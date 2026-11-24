use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use std::time::Instant;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PeerInfo {
    pub blip_id: u8,
    pub display_name: String,
    pub presence: String,
    pub custom_status: String,
    pub ips: Vec<String>,
    pub tcp_port: u16,
    pub udp_port: u16,
    pub last_seen_ms: u64,
    pub latency_ms: Option<u64>,
    pub mesh_public_key: Option<String>,
}

#[derive(Debug, Clone)]
pub struct PeerRuntime {
    pub info: PeerInfo,
    pub last_seen: Instant,
    pub dial_addr: Option<SocketAddr>,
}

impl PeerRuntime {
    pub fn from_announce(info: PeerInfo, addr: Option<SocketAddr>) -> Self {
        Self {
            info,
            last_seen: Instant::now(),
            dial_addr: addr,
        }
    }

    pub fn touch(&mut self) {
        self.last_seen = Instant::now();
        self.info.last_seen_ms = chrono::Utc::now().timestamp_millis() as u64;
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnnouncePacket {
    pub kind: String,
    pub blip_id: u8,
    pub display_name: String,
    pub presence: String,
    pub custom_status: String,
    pub tcp_port: u16,
    pub udp_port: u16,
    pub ips: Vec<String>,
    pub mesh_public_key: Option<String>,
    pub mesh_proto: u8,
}

impl AnnouncePacket {
    pub fn new(cfg: &crate::config::BlipConfig, ips: Vec<String>) -> Self {
        Self {
            kind: "announce".into(),
            blip_id: cfg.blip_id,
            display_name: cfg.display_name.clone(),
            presence: cfg.presence_status.clone(),
            custom_status: cfg.custom_status.clone(),
            tcp_port: cfg.tcp_port,
            udp_port: cfg.udp_port,
            ips,
            mesh_public_key: cfg.mesh_public_key.clone(),
            mesh_proto: 3, // Rust-era protocol
        }
    }
}
