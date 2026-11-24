use crate::config::{BlipConfig, BLIP_ID_MAX, BLIP_ID_MIN};
use crate::peer::{AnnouncePacket, PeerInfo, PeerRuntime};
use local_ip_address::list_afinet_netifas;
use std::collections::{HashMap, HashSet};
use std::net::{Ipv4Addr, SocketAddr};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::net::UdpSocket;
use tokio::sync::{broadcast, RwLock};
use tokio::time;

pub const PEER_TTL: Duration = Duration::from_secs(45);
const ANNOUNCE_INTERVAL: Duration = Duration::from_secs(2);
const PRUNE_INTERVAL: Duration = Duration::from_secs(5);
const EMIT_MIN_GAP: Duration = Duration::from_millis(250);

pub struct Discovery {
    peers: Arc<RwLock<HashMap<u8, PeerRuntime>>>,
    cfg: Arc<RwLock<BlipConfig>>,
    updates: broadcast::Sender<Vec<PeerInfo>>,
}

impl Discovery {
    pub fn new(cfg: Arc<RwLock<BlipConfig>>) -> Self {
        let (updates, _) = broadcast::channel(64);
        Self {
            peers: Arc::new(RwLock::new(HashMap::new())),
            cfg,
            updates,
        }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<Vec<PeerInfo>> {
        self.updates.subscribe()
    }

    pub async fn cfg_for_mdns(&self) -> BlipConfig {
        self.cfg.read().await.clone()
    }

    pub async fn publish_now(&self) {
        self.publish(self.list_peers().await);
    }

    pub fn peers_handle(&self) -> Arc<RwLock<HashMap<u8, PeerRuntime>>> {
        self.peers.clone()
    }

    pub async fn list_peers(&self) -> Vec<PeerInfo> {
        let mut list: Vec<_> = self
            .peers
            .read()
            .await
            .values()
            .map(|p| p.info.clone())
            .collect();
        list.sort_by_key(|p| p.blip_id);
        list
    }

    pub async fn get_peer(&self, id: u8) -> Option<PeerRuntime> {
        self.peers.read().await.get(&id).cloned()
    }

    pub async fn peer_count(&self) -> usize {
        self.peers.read().await.len()
    }

    fn publish(&self, peers: Vec<PeerInfo>) {
        let _ = self.updates.send(peers);
    }

    pub async fn upsert_peer(&self, info: PeerInfo, addr: Option<SocketAddr>) -> bool {
        let mut map = self.peers.write().await;
        let changed = if let Some(existing) = map.get_mut(&info.blip_id) {
            let before = existing.info.clone();
            existing.info.display_name = info.display_name;
            existing.info.presence = info.presence;
            existing.info.custom_status = info.custom_status;
            existing.info.tcp_port = info.tcp_port;
            existing.info.udp_port = info.udp_port;
            existing.info.mesh_public_key = info.mesh_public_key;
            existing.info.ips = merge_ips(&existing.info.ips, &info.ips);
            existing.touch();
            if let Some(a) = prefer_dial_addr(&existing.info.ips, existing.info.tcp_port, addr) {
                existing.dial_addr = Some(a);
            }
            before.display_name != existing.info.display_name
                || before.presence != existing.info.presence
                || before.ips != existing.info.ips
                || before.tcp_port != existing.info.tcp_port
        } else {
            let dial = prefer_dial_addr(&info.ips, info.tcp_port, addr);
            map.insert(info.blip_id, PeerRuntime::from_announce(info, dial));
            true
        };
        drop(map);
        changed
    }

    pub async fn prune(&self) -> usize {
        let mut map = self.peers.write().await;
        let before = map.len();
        map.retain(|_, p| p.last_seen.elapsed() < PEER_TTL);
        before.saturating_sub(map.len())
    }

    /// Apply a decoded announce. Returns whether the peer table changed.
    pub async fn apply_announce(
        &self,
        pkt: AnnouncePacket,
        from: Option<SocketAddr>,
    ) -> Result<bool, AnnounceReject> {
        if pkt.kind != "announce" {
            return Err(AnnounceReject::BadKind);
        }
        if !(BLIP_ID_MIN..=BLIP_ID_MAX).contains(&pkt.blip_id) {
            return Err(AnnounceReject::BadId);
        }
        if pkt.tcp_port == 0 || pkt.udp_port == 0 {
            return Err(AnnounceReject::BadPort);
        }

        let cfg = self.cfg.read().await.clone();
        if pkt.blip_id == cfg.blip_id {
            return Err(AnnounceReject::SelfAnnounce);
        }
        if cfg.blocked_peer_ids.contains(&pkt.blip_id) {
            // Ensure blocked peers do not linger.
            let mut map = self.peers.write().await;
            let removed = map.remove(&pkt.blip_id).is_some();
            drop(map);
            return if removed {
                Ok(true)
            } else {
                Err(AnnounceReject::Blocked)
            };
        }

        let ips = sanitize_ips(&pkt.ips);
        let info = PeerInfo {
            blip_id: pkt.blip_id,
            display_name: pkt.display_name.trim().chars().take(64).collect(),
            presence: normalize_presence(&pkt.presence),
            custom_status: pkt.custom_status.chars().take(120).collect(),
            ips,
            tcp_port: pkt.tcp_port,
            udp_port: pkt.udp_port,
            last_seen_ms: chrono::Utc::now().timestamp_millis() as u64,
            latency_ms: None,
            mesh_public_key: pkt.mesh_public_key,
        };
        let from_tcp = from.map(|a| SocketAddr::new(a.ip(), pkt.tcp_port));
        Ok(self.upsert_peer(info, from_tcp).await)
    }

    pub fn local_ipv4s() -> Vec<String> {
        list_afinet_netifas()
            .unwrap_or_default()
            .into_iter()
            .filter_map(|(_, ip)| match ip {
                std::net::IpAddr::V4(v4)
                    if !v4.is_loopback() && !v4.is_link_local() && !v4.is_unspecified() =>
                {
                    Some(v4.to_string())
                }
                _ => None,
            })
            .collect()
    }

    pub fn build_announce(cfg: &BlipConfig) -> AnnouncePacket {
        AnnouncePacket::new(cfg, Self::local_ipv4s())
    }

    pub async fn run(self: Arc<Self>) {
        let port = self.cfg.read().await.udp_port;
        let sock = match UdpSocket::bind(("0.0.0.0", port)).await {
            Ok(s) => Arc::new(s),
            Err(e) => {
                tracing::error!("UDP bind failed on {port}: {e}");
                return;
            }
        };
        let _ = sock.set_broadcast(true);
        tracing::info!("UDP discovery listening on {port}");

        let recv_sock = sock.clone();
        let announce_sock = sock;

        let this = self.clone();
        tokio::spawn(async move {
            let mut buf = vec![0u8; 65535];
            let mut last_emit = Instant::now() - EMIT_MIN_GAP;
            let mut pending_emit = false;
            loop {
                match recv_sock.recv_from(&mut buf).await {
                    Ok((n, from)) => {
                        match serde_json::from_slice::<AnnouncePacket>(&buf[..n]) {
                            Ok(pkt) => match this.apply_announce(pkt, Some(from)).await {
                                Ok(true) => {
                                    pending_emit = true;
                                }
                                Ok(false) => {
                                    // touch-only: still refresh UI occasionally via prune loop
                                }
                                Err(AnnounceReject::Blocked) => {}
                                Err(e) => {
                                    tracing::trace!("reject announce from {from}: {e:?}");
                                }
                            },
                            Err(_) => {
                                tracing::trace!("ignore non-announce UDP from {from}");
                            }
                        }
                        if pending_emit && last_emit.elapsed() >= EMIT_MIN_GAP {
                            pending_emit = false;
                            last_emit = Instant::now();
                            this.publish(this.list_peers().await);
                        }
                    }
                    Err(e) => {
                        tracing::warn!("UDP recv error: {e}");
                        time::sleep(Duration::from_millis(200)).await;
                    }
                }
            }
        });

        let this = self.clone();
        tokio::spawn(async move {
            let mut tick = time::interval(PRUNE_INTERVAL);
            loop {
                tick.tick().await;
                let _removed = this.prune().await;
                // Publish every prune tick so UI TTL / peer list stays honest.
                this.publish(this.list_peers().await);
            }
        });

        let this = self.clone();
        tokio::spawn(async move {
            let mut tick = time::interval(ANNOUNCE_INTERVAL);
            loop {
                tick.tick().await;
                let cfg = this.cfg.read().await.clone();
                let pkt = Self::build_announce(&cfg);
                let Ok(bytes) = serde_json::to_vec(&pkt) else {
                    continue;
                };
                let targets = broadcast_targets(cfg.udp_port, &Self::local_ipv4s());
                for addr in targets {
                    let _ = announce_sock.send_to(&bytes, addr).await;
                }
            }
        });
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AnnounceReject {
    BadKind,
    BadId,
    BadPort,
    SelfAnnounce,
    Blocked,
}

fn normalize_presence(raw: &str) -> String {
    match raw.trim().to_ascii_lowercase().as_str() {
        "away" => "away".into(),
        "busy" => "busy".into(),
        "offline" => "offline".into(),
        _ => "online".into(),
    }
}

fn sanitize_ips(ips: &[String]) -> Vec<String> {
    let mut out = Vec::new();
    let mut seen = HashSet::new();
    for ip in ips {
        let Ok(v4) = ip.parse::<Ipv4Addr>() else {
            continue;
        };
        if v4.is_unspecified() || v4.is_multicast() {
            continue;
        }
        let s = v4.to_string();
        if seen.insert(s.clone()) {
            out.push(s);
        }
    }
    out
}

fn merge_ips(existing: &[String], incoming: &[String]) -> Vec<String> {
    let mut out = sanitize_ips(existing);
    let mut seen: HashSet<String> = out.iter().cloned().collect();
    for ip in sanitize_ips(incoming) {
        if seen.insert(ip.clone()) {
            out.push(ip);
        }
    }
    out
}

fn prefer_dial_addr(
    ips: &[String],
    tcp_port: u16,
    fallback: Option<SocketAddr>,
) -> Option<SocketAddr> {
    for ip in ips {
        if let Ok(v4) = ip.parse::<Ipv4Addr>() {
            if v4.is_loopback() {
                continue;
            }
            return Some(SocketAddr::from((v4, tcp_port)));
        }
    }
    // Allow loopback for same-machine dual-instance testing.
    for ip in ips {
        if let Ok(addr) = format!("{ip}:{tcp_port}").parse() {
            return Some(addr);
        }
    }
    fallback
}

fn broadcast_targets(udp_port: u16, local_ips: &[String]) -> Vec<SocketAddr> {
    let mut out = vec![SocketAddr::from((Ipv4Addr::BROADCAST, udp_port))];
    let mut seen = HashSet::from([out[0]]);
    for ip in local_ips {
        if let Ok(v4) = ip.parse::<Ipv4Addr>() {
            let o = v4.octets();
            // /24 directed broadcast — common home LAN case.
            let subnet = Ipv4Addr::new(o[0], o[1], o[2], 255);
            let addr = SocketAddr::from((subnet, udp_port));
            if seen.insert(addr) {
                out.push(addr);
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::BlipConfig;

    fn cfg(id: u8) -> Arc<RwLock<BlipConfig>> {
        let mut c = BlipConfig::default();
        c.blip_id = id;
        c.blocked_peer_ids = vec![9];
        Arc::new(RwLock::new(c))
    }

    fn pkt(id: u8, name: &str, ips: &[&str]) -> AnnouncePacket {
        AnnouncePacket {
            kind: "announce".into(),
            blip_id: id,
            display_name: name.into(),
            presence: "online".into(),
            custom_status: String::new(),
            tcp_port: 42070,
            udp_port: 42069,
            ips: ips.iter().map(|s| (*s).to_string()).collect(),
            mesh_public_key: None,
            mesh_proto: 3,
        }
    }

    #[tokio::test]
    async fn rejects_self_and_bad_id() {
        let d = Discovery::new(cfg(1));
        assert_eq!(
            d.apply_announce(pkt(1, "me", &["10.0.0.1"]), None)
                .await,
            Err(AnnounceReject::SelfAnnounce)
        );
        assert_eq!(
            d.apply_announce(pkt(0, "bad", &["10.0.0.1"]), None)
                .await,
            Err(AnnounceReject::BadId)
        );
        assert_eq!(
            d.apply_announce(pkt(99, "bad", &["10.0.0.1"]), None)
                .await,
            Err(AnnounceReject::BadId)
        );
    }

    #[tokio::test]
    async fn upsert_merges_ips_and_lists_sorted() {
        let d = Discovery::new(cfg(1));
        assert!(d
            .apply_announce(pkt(2, "A", &["10.0.0.2"]), None)
            .await
            .unwrap());
        assert!(d
            .apply_announce(pkt(3, "B", &["10.0.0.3"]), None)
            .await
            .unwrap());
        // merge new IP for peer 2
        let changed = d
            .apply_announce(pkt(2, "A2", &["10.0.0.2", "10.0.0.22"]), None)
            .await
            .unwrap();
        assert!(changed);
        let peers = d.list_peers().await;
        assert_eq!(peers.len(), 2);
        assert_eq!(peers[0].blip_id, 2);
        assert_eq!(peers[0].display_name, "A2");
        assert!(peers[0].ips.contains(&"10.0.0.22".into()));
        assert_eq!(peers[1].blip_id, 3);
    }

    #[tokio::test]
    async fn blocked_peer_removed_and_rejected() {
        let d = Discovery::new(cfg(1));
        // sneak peer in then block path removes
        d.upsert_peer(
            PeerInfo {
                blip_id: 9,
                display_name: "blocked".into(),
                presence: "online".into(),
                custom_status: String::new(),
                ips: vec!["10.0.0.9".into()],
                tcp_port: 42070,
                udp_port: 42069,
                last_seen_ms: 0,
                latency_ms: None,
                mesh_public_key: None,
            },
            None,
        )
        .await;
        assert_eq!(d.peer_count().await, 1);
        let changed = d
            .apply_announce(pkt(9, "blocked", &["10.0.0.9"]), None)
            .await
            .unwrap();
        assert!(changed);
        assert_eq!(d.peer_count().await, 0);
    }

    #[tokio::test]
    async fn prune_expires_stale_peers() {
        let d = Discovery::new(cfg(1));
        d.apply_announce(pkt(5, "old", &["10.0.0.5"]), None)
            .await
            .unwrap();
        {
            let mut map = d.peers.write().await;
            if let Some(p) = map.get_mut(&5) {
                p.last_seen = Instant::now() - PEER_TTL - Duration::from_secs(1);
            }
        }
        let removed = d.prune().await;
        assert_eq!(removed, 1);
        assert_eq!(d.peer_count().await, 0);
    }

    #[test]
    fn broadcast_targets_include_subnet() {
        let t = broadcast_targets(42069, &["192.168.1.10".into()]);
        assert!(t.contains(&"255.255.255.255:42069".parse().unwrap()));
        assert!(t.contains(&"192.168.1.255:42069".parse().unwrap()));
    }

    #[test]
    fn sanitize_drops_junk_ips() {
        let ips = sanitize_ips(&[
            "10.0.0.1".into(),
            "not-an-ip".into(),
            "0.0.0.0".into(),
            "10.0.0.1".into(),
        ]);
        assert_eq!(ips, vec!["10.0.0.1".to_string()]);
    }
}
