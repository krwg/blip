use crate::config::BlipConfig;
use crate::net::framing::{encode_json_line, LineCodec};
use crate::peer::PeerRuntime;
use futures::{SinkExt, StreamExt};
use serde_json::Value;
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{mpsc, RwLock};
use tokio_util::codec::Framed;

type PeerTx = mpsc::UnboundedSender<String>;

pub struct TcpMesh {
    cfg: Arc<RwLock<BlipConfig>>,
    outbound: Arc<RwLock<HashMap<u8, PeerTx>>>,
}

impl TcpMesh {
    pub fn new(cfg: Arc<RwLock<BlipConfig>>) -> Self {
        Self {
            cfg,
            outbound: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn run(self: Arc<Self>, app: AppHandle) {
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
                    let app = app.clone();
                    tokio::spawn(async move {
                        mesh.handle_connection(stream, addr, app, None).await;
                    });
                }
                Err(e) => tracing::warn!("TCP accept error: {e}"),
            }
        }
    }

    pub async fn dial_peer(
        self: Arc<Self>,
        peer: PeerRuntime,
        app: AppHandle,
    ) -> Result<(), String> {
        if self.outbound.read().await.contains_key(&peer.info.blip_id) {
            return Ok(());
        }
        let mut addrs: Vec<SocketAddr> = vec![];
        if let Some(a) = peer.dial_addr {
            addrs.push(a);
        }
        for ip in &peer.info.ips {
            if let Ok(a) = format!("{}:{}", ip, peer.info.tcp_port).parse() {
                addrs.push(a);
            }
        }
        let mut last_err = "no addresses".to_string();
        for addr in addrs {
            match TcpStream::connect(addr).await {
                Ok(stream) => {
                    let mesh = self.clone();
                    let app2 = app.clone();
                    let peer_id = peer.info.blip_id;
                    tokio::spawn(async move {
                        mesh.handle_connection(stream, addr, app2, Some(peer_id))
                            .await;
                    });
                    return Ok(());
                }
                Err(e) => last_err = e.to_string(),
            }
        }
        Err(last_err)
    }

    pub async fn send_to_peer(&self, peer_id: u8, payload: Value) -> Result<(), String> {
        let line = encode_json_line(&payload)?;
        let map = self.outbound.read().await;
        let tx = map
            .get(&peer_id)
            .ok_or_else(|| format!("no tcp session for peer {peer_id}"))?;
        tx.send(line).map_err(|e| e.to_string())
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
        app: AppHandle,
        known_peer: Option<u8>,
    ) {
        let framed = Framed::new(stream, LineCodec);
        let (mut sink, mut stream) = framed.split();
        let (tx, mut rx) = mpsc::unbounded_channel::<String>();

        // Hello / handshake
        let cfg = self.cfg.read().await.clone();
        let hello = serde_json::json!({
            "type": "mesh-handshake",
            "from": cfg.blip_id,
            "displayName": cfg.display_name,
            "meshProto": 3,
            "meshPublicKey": cfg.mesh_public_key,
        });
        if let Ok(line) = encode_json_line(&hello) {
            let _ = sink.send(line).await;
        }

        let mut peer_id = known_peer;
        if let Some(id) = peer_id {
            self.outbound.write().await.insert(id, tx.clone());
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
                    peer_id = Some(id);
                    self.outbound.write().await.insert(id, tx.clone());
                    if ty == "mesh-handshake" {
                        let ack = serde_json::json!({
                            "type": "mesh-handshake-ack",
                            "from": cfg.blip_id,
                            "displayName": cfg.display_name,
                            "meshProto": 3,
                        });
                        if let Ok(line) = encode_json_line(&ack) {
                            let _ = tx.send(line);
                        }
                    }
                }
                continue;
            }

            // Drop cut message types
            if ty.starts_with("seed-")
                || ty.starts_with("group-")
                || ty.starts_with("voice-ch-")
                || ty.starts_with("mesh-proj-")
            {
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
            let _ = app.emit("tcp-message", msg);
        }

        if let Some(id) = peer_id {
            self.outbound.write().await.remove(&id);
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

    #[test]
    fn allowlist_rejects_group() {
        assert!(!is_allowed_type("group-msg"));
        assert!(is_allowed_type("message"));
    }
}
