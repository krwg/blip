use crate::config::BlipConfig;
use crate::peer::{AnnouncePacket, PeerInfo, PeerRuntime};
use local_ip_address::list_afinet_netifas;
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::net::UdpSocket;
use tokio::sync::RwLock;
use tokio::time;

const PEER_TTL: Duration = Duration::from_secs(45);

pub struct Discovery {
    peers: Arc<RwLock<HashMap<u8, PeerRuntime>>>,
    cfg: Arc<RwLock<BlipConfig>>,
}

impl Discovery {
    pub fn new(cfg: Arc<RwLock<BlipConfig>>) -> Self {
        Self {
            peers: Arc::new(RwLock::new(HashMap::new())),
            cfg,
        }
    }

    pub fn peers_handle(&self) -> Arc<RwLock<HashMap<u8, PeerRuntime>>> {
        self.peers.clone()
    }

    pub async fn list_peers(&self) -> Vec<PeerInfo> {
        let map = self.peers.read().await;
        map.values().map(|p| p.info.clone()).collect()
    }

    pub async fn get_peer(&self, id: u8) -> Option<PeerRuntime> {
        self.peers.read().await.get(&id).cloned()
    }

    pub async fn upsert_peer(&self, info: PeerInfo, addr: Option<SocketAddr>) {
        let mut map = self.peers.write().await;
        if let Some(existing) = map.get_mut(&info.blip_id) {
            existing.info = info;
            existing.touch();
            if addr.is_some() {
                existing.dial_addr = addr;
            }
        } else {
            map.insert(info.blip_id, PeerRuntime::from_announce(info, addr));
        }
    }

    pub async fn prune(&self) {
        let mut map = self.peers.write().await;
        map.retain(|_, p| p.last_seen.elapsed() < PEER_TTL);
    }

    pub fn local_ipv4s() -> Vec<String> {
        list_afinet_netifas()
            .unwrap_or_default()
            .into_iter()
            .filter_map(|(_, ip)| match ip {
                std::net::IpAddr::V4(v4) if !v4.is_loopback() => Some(v4.to_string()),
                _ => None,
            })
            .collect()
    }

    pub async fn run(self: Arc<Self>, app: AppHandle) {
        let cfg = self.cfg.read().await.clone();
        let port = cfg.udp_port;
        let sock = match UdpSocket::bind(("0.0.0.0", port)).await {
            Ok(s) => Arc::new(s),
            Err(e) => {
                tracing::error!("UDP bind failed on {port}: {e}");
                return;
            }
        };
        let _ = sock.set_broadcast(true);

        let recv_sock = sock.clone();
        let announce_sock = sock;

        let this = self.clone();
        let app_recv = app.clone();
        tokio::spawn(async move {
            let mut buf = vec![0u8; 65535];
            loop {
                match recv_sock.recv_from(&mut buf).await {
                    Ok((n, from)) => {
                        if let Ok(pkt) = serde_json::from_slice::<AnnouncePacket>(&buf[..n]) {
                            if pkt.kind != "announce" {
                                continue;
                            }
                            let local_id = this.cfg.read().await.blip_id;
                            if pkt.blip_id == local_id {
                                continue;
                            }
                            let info = PeerInfo {
                                blip_id: pkt.blip_id,
                                display_name: pkt.display_name,
                                presence: pkt.presence,
                                custom_status: pkt.custom_status,
                                ips: pkt.ips,
                                tcp_port: pkt.tcp_port,
                                udp_port: pkt.udp_port,
                                last_seen_ms: chrono::Utc::now().timestamp_millis() as u64,
                                latency_ms: None,
                                mesh_public_key: pkt.mesh_public_key,
                            };
                            let dial = info
                                .ips
                                .first()
                                .and_then(|ip| format!("{}:{}", ip, info.tcp_port).parse().ok())
                                .or_else(|| {
                                    Some(SocketAddr::new(from.ip(), info.tcp_port))
                                });
                            this.upsert_peer(info, dial).await;
                            let peers = this.list_peers().await;
                            let _ = app_recv.emit("peers-updated", peers);
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
        let app_prune = app.clone();
        tokio::spawn(async move {
            let mut tick = time::interval(Duration::from_secs(5));
            loop {
                tick.tick().await;
                this.prune().await;
                let peers = this.list_peers().await;
                let _ = app_prune.emit("peers-updated", peers);
            }
        });

        let this = self.clone();
        tokio::spawn(async move {
            let mut tick = time::interval(Duration::from_secs(2));
            loop {
                tick.tick().await;
                let cfg = this.cfg.read().await.clone();
                let ips = Self::local_ipv4s();
                let pkt = AnnouncePacket::new(&cfg, ips);
                if let Ok(bytes) = serde_json::to_vec(&pkt) {
                    let bcast = SocketAddr::from(([255, 255, 255, 255], cfg.udp_port));
                    let _ = announce_sock.send_to(&bytes, bcast).await;
                    // Also poke subnet broadcasts for common home nets via local IPs.
                    for ip in Self::local_ipv4s() {
                        if let Ok(v4) = ip.parse::<std::net::Ipv4Addr>() {
                            let o = v4.octets();
                            let subnet = std::net::Ipv4Addr::new(o[0], o[1], o[2], 255);
                            let addr = SocketAddr::from((subnet, cfg.udp_port));
                            let _ = announce_sock.send_to(&bytes, addr).await;
                        }
                    }
                }
            }
        });
    }
}
