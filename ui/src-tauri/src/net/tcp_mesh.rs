use crate::config::BlipConfig;
use crate::net::framing::{encode_json_line, LineCodec};
use crate::peer::PeerRuntime;
use futures::{SinkExt, StreamExt};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{broadcast, mpsc, Mutex, Notify, RwLock};
use tokio_util::codec::Framed;

type PeerTx = mpsc::UnboundedSender<String>;

const SESSION_WAIT: Duration = Duration::from_secs(8);
const DIAL_CONNECT_TIMEOUT: Duration = Duration::from_secs(4);

#[derive(Clone)]
struct InflightDial {
    notify: Arc<Notify>,
}

pub struct TcpMesh {
    cfg: Arc<RwLock<BlipConfig>>,
    outbound: Arc<RwLock<HashMap<u8, PeerTx>>>,
    ready: Arc<Mutex<HashMap<u8, Arc<Notify>>>>,
    inflight: Arc<Mutex<HashMap<u8, InflightDial>>>,
    inbound_tx: broadcast::Sender<Value>,
}

impl TcpMesh {
    pub fn new(cfg: Arc<RwLock<BlipConfig>>) -> Self {
        let (inbound_tx, _) = broadcast::channel(256);
        Self {
            cfg,
            outbound: Arc::new(RwLock::new(HashMap::new())),
            ready: Arc::new(Mutex::new(HashMap::new())),
            inflight: Arc::new(Mutex::new(HashMap::new())),
            inbound_tx,
        }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<Value> {
        self.inbound_tx.subscribe()
    }

    pub async fn has_session(&self, peer_id: u8) -> bool {
        self.outbound.read().await.contains_key(&peer_id)
    }

    pub async fn run_listener(self: Arc<Self>) {
        let port = self.cfg.read().await.tcp_port;
        let listener = match TcpListener::bind(("0.0.0.0", port)).await {
            Ok(l) => l,
            Err(e) => {
                tracing::error!("TCP bind failed on {port}: {e}");
                return;
            }
        };
        tracing::info!("TCP listening on {port}");

        loop {
            match listener.accept().await {
                Ok((stream, addr)) => {
                    let mesh = self.clone();
                    tokio::spawn(async move {
                        mesh.handle_connection(stream, addr, None).await;
                    });
                }
                Err(e) => tracing::warn!("TCP accept error: {e}"),
            }
        }
    }

    /// Ensure a live TCP session exists for `peer`, waiting through handshake.
    pub async fn ensure_session(self: Arc<Self>, peer: PeerRuntime) -> Result<(), String> {
        let peer_id = peer.info.blip_id;
        if self.has_session(peer_id).await {
            return Ok(());
        }

        // Coalesce concurrent dials to the same peer.
        let maybe_wait = {
            let mut inflight = self.inflight.lock().await;
            if let Some(slot) = inflight.get(&peer_id) {
                Some(slot.notify.clone())
            } else {
                let notify = Arc::new(Notify::new());
                inflight.insert(
                    peer_id,
                    InflightDial {
                        notify: notify.clone(),
                    },
                );
                None
            }
        };

        if let Some(notify) = maybe_wait {
            return self.wait_session(peer_id, SESSION_WAIT, Some(notify)).await;
        }

        let result = self.clone().dial_once(peer).await;
        {
            let mut inflight = self.inflight.lock().await;
            if let Some(slot) = inflight.remove(&peer_id) {
                slot.notify.notify_waiters();
            }
        }
        result?;
        self.wait_session(peer_id, SESSION_WAIT, None).await
    }

    async fn dial_once(self: Arc<Self>, peer: PeerRuntime) -> Result<(), String> {
        let peer_id = peer.info.blip_id;
        if self.has_session(peer_id).await {
            return Ok(());
        }

        let mut addrs: Vec<SocketAddr> = Vec::new();
        let mut seen = HashSet::new();
        if let Some(a) = peer.dial_addr {
            if seen.insert(a) {
                addrs.push(a);
            }
        }
        for ip in &peer.info.ips {
            if let Ok(a) = format!("{}:{}", ip, peer.info.tcp_port).parse::<SocketAddr>() {
                if seen.insert(a) {
                    addrs.push(a);
                }
            }
        }
        if addrs.is_empty() {
            return Err(format!("no dial addresses for peer {peer_id}"));
        }

        let mut last_err = "connect failed".to_string();
        for addr in addrs {
            match tokio::time::timeout(DIAL_CONNECT_TIMEOUT, TcpStream::connect(addr)).await {
                Ok(Ok(stream)) => {
                    let mesh = self.clone();
                    tokio::spawn(async move {
                        mesh.handle_connection(stream, addr, Some(peer_id)).await;
                    });
                    return Ok(());
                }
                Ok(Err(e)) => last_err = format!("{addr}: {e}"),
                Err(_) => last_err = format!("{addr}: connect timeout"),
            }
        }
        Err(last_err)
    }

    async fn wait_session(
        &self,
        peer_id: u8,
        timeout: Duration,
        extra_notify: Option<Arc<Notify>>,
    ) -> Result<(), String> {
        let deadline = Instant::now() + timeout;
        loop {
            if self.has_session(peer_id).await {
                return Ok(());
            }
            let left = deadline.saturating_duration_since(Instant::now());
            if left.is_zero() {
                return Err(format!(
                    "timeout waiting for tcp session with peer {peer_id}"
                ));
            }

            let session_notify = {
                let mut map = self.ready.lock().await;
                map.entry(peer_id)
                    .or_insert_with(|| Arc::new(Notify::new()))
                    .clone()
            };

            tokio::select! {
                _ = session_notify.notified() => {}
                _ = async {
                    if let Some(n) = &extra_notify {
                        n.notified().await;
                    } else {
                        std::future::pending::<()>().await;
                    }
                } => {}
                _ = tokio::time::sleep(left) => {
                    if self.has_session(peer_id).await {
                        return Ok(());
                    }
                    return Err(format!(
                        "timeout waiting for tcp session with peer {peer_id}"
                    ));
                }
            }
        }
    }

    async fn register_session(&self, peer_id: u8, tx: PeerTx) {
        self.outbound.write().await.insert(peer_id, tx);
        let notify = {
            let mut map = self.ready.lock().await;
            map.entry(peer_id)
                .or_insert_with(|| Arc::new(Notify::new()))
                .clone()
        };
        notify.notify_waiters();
    }

    async fn unregister_session(&self, peer_id: u8) {
        self.outbound.write().await.remove(&peer_id);
        self.ready.lock().await.remove(&peer_id);
    }

    pub async fn send_to_peer(&self, peer_id: u8, payload: Value) -> Result<(), String> {
        if !is_allowed_type(
            payload
                .get("type")
                .and_then(|t| t.as_str())
                .unwrap_or(""),
        ) {
            return Err("message type not allowed".into());
        }
        let line = encode_json_line(&payload)?;
        let map = self.outbound.read().await;
        let tx = map
            .get(&peer_id)
            .ok_or_else(|| format!("no tcp session for peer {peer_id}"))?;
        tx.send(line).map_err(|_| format!("tcp session closed for peer {peer_id}"))
    }

    /// Dial (if needed), wait for session, then send.
    pub async fn ensure_and_send(
        self: Arc<Self>,
        peer: PeerRuntime,
        payload: Value,
    ) -> Result<(), String> {
        let peer_id = peer.info.blip_id;
        self.clone().ensure_session(peer).await?;
        self.send_to_peer(peer_id, payload).await
    }

    pub async fn broadcast(&self, payload: Value) -> Result<(), String> {
        let line = encode_json_line(&payload)?;
        let map = self.outbound.read().await;
        for tx in map.values() {
            let _ = tx.send(line.clone());
        }
        Ok(())
    }

    async fn handle_connection(
        self: Arc<Self>,
        stream: TcpStream,
        addr: SocketAddr,
        known_peer: Option<u8>,
    ) {
        let _ = stream.set_nodelay(true);
        let framed = Framed::new(stream, LineCodec);
        let (mut sink, mut stream) = framed.split();
        let (tx, mut rx) = mpsc::unbounded_channel::<String>();

        let cfg = self.cfg.read().await.clone();
        let hello = serde_json::json!({
            "type": "mesh-handshake",
            "from": cfg.blip_id,
            "displayName": cfg.display_name,
            "meshProto": 3,
            "meshPublicKey": cfg.mesh_public_key,
        });
        if let Ok(line) = encode_json_line(&hello) {
            if sink.send(line).await.is_err() {
                return;
            }
        }

        let mut peer_id = known_peer;
        // Outbound dials know the target id up front — register TX immediately so
        // waiters unblock as soon as the socket is writable, then confirm via handshake.
        if let Some(id) = peer_id {
            self.register_session(id, tx.clone()).await;
        }

        let writer = tokio::spawn(async move {
            while let Some(line) = rx.recv().await {
                if sink.send(line).await.is_err() {
                    break;
                }
            }
        });

        while let Some(Ok(line)) = stream.next().await {
            let Ok(v) = serde_json::from_str::<Value>(&line) else {
                continue;
            };
            let ty = v.get("type").and_then(|t| t.as_str()).unwrap_or("");
            if ty == "mesh-handshake" || ty == "mesh-handshake-ack" {
                if let Some(from) = v.get("from").and_then(|x| x.as_u64()) {
                    let id = from as u8;
                    if cfg.blocked_peer_ids.contains(&id) {
                        tracing::info!("dropping blocked peer {id} from {addr}");
                        break;
                    }
                    peer_id = Some(id);
                    self.register_session(id, tx.clone()).await;
                    if ty == "mesh-handshake" {
                        let ack = serde_json::json!({
                            "type": "mesh-handshake-ack",
                            "from": cfg.blip_id,
                            "displayName": cfg.display_name,
                            "meshProto": 3,
                            "meshPublicKey": cfg.mesh_public_key,
                        });
                        if let Ok(line) = encode_json_line(&ack) {
                            let _ = tx.send(line);
                        }
                    }
                }
                continue;
            }

            if ty.starts_with("seed-")
                || ty.starts_with("group-")
                || ty.starts_with("voice-ch-")
                || ty.starts_with("mesh-proj-")
            {
                continue;
            }

            if !is_allowed_type(ty) {
                continue;
            }

            let mut msg = v;
            if let Some(obj) = msg.as_object_mut() {
                obj.insert("remoteAddr".into(), serde_json::json!(addr.to_string()));
                if let Some(id) = peer_id {
                    obj.entry("from".to_string())
                        .or_insert(serde_json::json!(id));
                }
            }
            let _ = self.inbound_tx.send(msg);
        }

        if let Some(id) = peer_id {
            self.unregister_session(id).await;
        }
        writer.abort();
    }
}

pub fn is_allowed_type(ty: &str) -> bool {
    matches!(
        ty,
        "mesh-handshake"
            | "mesh-handshake-ack"
            | "message"
            | "receipt"
            | "reaction"
            | "typing"
            | "ping"
            | "pong"
            | "call-offer"
            | "call-answer"
            | "call-candidate"
            | "call-reject"
            | "call-hangup"
            | "call-state"
            | "call-renegotiate"
            | "call-renegotiate-answer"
            | "file-offer"
            | "file-chunk"
            | "file-done"
            | "file-abort"
            | "clipboard-push"
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::BlipConfig;
    use crate::peer::PeerInfo;
    use std::time::Duration;

    fn cfg_with(id: u8, tcp: u16) -> Arc<RwLock<BlipConfig>> {
        let mut c = BlipConfig::default();
        c.blip_id = id;
        c.tcp_port = tcp;
        c.display_name = format!("Peer{id}");
        Arc::new(RwLock::new(c))
    }

    fn peer(id: u8, port: u16) -> PeerRuntime {
        PeerRuntime::from_announce(
            PeerInfo {
                blip_id: id,
                display_name: format!("Peer{id}"),
                presence: "online".into(),
                custom_status: String::new(),
                ips: vec!["127.0.0.1".into()],
                tcp_port: port,
                udp_port: 42069,
                last_seen_ms: 0,
                latency_ms: None,
                mesh_public_key: None,
            },
            Some(format!("127.0.0.1:{port}").parse().unwrap()),
        )
    }

    #[test]
    fn allowlist_rejects_group() {
        assert!(!is_allowed_type("group-msg"));
        assert!(is_allowed_type("message"));
        assert!(is_allowed_type("ping"));
    }

    #[tokio::test]
    async fn dial_waits_until_session_then_ping_roundtrip() {
        let port_a = 43111;
        let port_b = 43112;
        let mesh_a = Arc::new(TcpMesh::new(cfg_with(1, port_a)));
        let mesh_b = Arc::new(TcpMesh::new(cfg_with(2, port_b)));

        tokio::spawn(mesh_a.clone().run_listener());
        tokio::spawn(mesh_b.clone().run_listener());
        tokio::time::sleep(Duration::from_millis(80)).await;

        let mut sub_b = mesh_b.subscribe();
        mesh_a
            .clone()
            .ensure_session(peer(2, port_b))
            .await
            .expect("session ready");
        assert!(mesh_a.has_session(2).await);

        mesh_a
            .send_to_peer(
                2,
                serde_json::json!({
                    "type": "ping",
                    "from": 1,
                    "id": "test-ping-1",
                }),
            )
            .await
            .expect("ping send");

        let msg = tokio::time::timeout(Duration::from_secs(3), async {
            loop {
                let v = sub_b.recv().await.expect("recv");
                if v.get("type").and_then(|t| t.as_str()) == Some("ping") {
                    break v;
                }
            }
        })
        .await
        .expect("ping delivered");

        assert_eq!(msg.get("id").and_then(|x| x.as_str()), Some("test-ping-1"));
        assert!(mesh_b.has_session(1).await);
    }

    #[tokio::test]
    async fn concurrent_ensure_session_coalesces() {
        let port_a = 43121;
        let port_b = 43122;
        let mesh_a = Arc::new(TcpMesh::new(cfg_with(3, port_a)));
        let mesh_b = Arc::new(TcpMesh::new(cfg_with(4, port_b)));
        tokio::spawn(mesh_a.clone().run_listener());
        tokio::spawn(mesh_b.clone().run_listener());
        tokio::time::sleep(Duration::from_millis(80)).await;

        let p = peer(4, port_b);
        let a = mesh_a.clone().ensure_session(p.clone());
        let b = mesh_a.clone().ensure_session(p.clone());
        let c = mesh_a.clone().ensure_session(p);
        let (ra, rb, rc) = tokio::join!(a, b, c);
        ra.expect("a");
        rb.expect("b");
        rc.expect("c");
        assert!(mesh_a.has_session(4).await);
    }
}
