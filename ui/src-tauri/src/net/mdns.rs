//! Auxiliary mDNS discovery for BLIP (`_blip._udp.local`).
//!
//! Peers discovered here go through the same `Discovery::apply_announce` path as UDP,
//! so blocklist / ID checks / IP merge stay consistent.

use crate::net::discovery::Discovery;
use crate::peer::AnnouncePacket;
use mdns_sd::{ServiceDaemon, ServiceEvent, ServiceInfo};
use std::net::IpAddr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::time;

pub const SERVICE_TYPE: &str = "_blip._udp.local.";
const REREGISTER_EVERY: Duration = Duration::from_secs(30);

static MDNS_ACTIVE: AtomicBool = AtomicBool::new(false);

pub fn is_active() -> bool {
    MDNS_ACTIVE.load(Ordering::Relaxed)
}

/// Convert a resolved mDNS service into a BLIP announce packet.
pub fn announce_from_service(info: &ServiceInfo) -> Option<AnnouncePacket> {
    let blip_id = info
        .get_property_val_str("blipId")
        .or_else(|| info.get_property_val_str("id"))
        .and_then(|v| v.parse::<u8>().ok())?;
    let display_name = info
        .get_property_val_str("name")
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| format!("Peer {blip_id}"));
    let tcp_port = info
        .get_property_val_str("tcp")
        .and_then(|v| v.parse::<u16>().ok())
        .filter(|p| *p != 0)
        .unwrap_or_else(|| info.get_port());
    let udp_port = info
        .get_property_val_str("udp")
        .and_then(|v| v.parse::<u16>().ok())
        .filter(|p| *p != 0)
        .unwrap_or_else(|| info.get_port());
    if tcp_port == 0 || udp_port == 0 {
        return None;
    }
    let ips: Vec<String> = info
        .get_addresses()
        .iter()
        .filter_map(|a| match a {
            IpAddr::V4(v4) if !v4.is_unspecified() && !v4.is_multicast() => Some(v4.to_string()),
            _ => None,
        })
        .collect();
    let presence = info
        .get_property_val_str("presence")
        .unwrap_or("online")
        .to_string();
    let custom_status = info
        .get_property_val_str("status")
        .unwrap_or("")
        .to_string();
    let mesh_public_key = info
        .get_property_val_str("meshPk")
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty());
    let mesh_proto = info
        .get_property_val_str("meshProto")
        .and_then(|v| v.parse().ok())
        .unwrap_or(3);

    Some(AnnouncePacket {
        kind: "announce".into(),
        blip_id,
        display_name,
        presence,
        custom_status,
        tcp_port,
        udp_port,
        ips,
        mesh_public_key,
        mesh_proto,
    })
}

fn build_service_info(cfg: &crate::config::BlipConfig) -> mdns_sd::Result<ServiceInfo> {
    let host = format!("blip-{}.local.", cfg.blip_id);
    let instance = format!("blip-{}", cfg.blip_id);
    let ips = Discovery::local_ipv4s();
    let ip_arg = if ips.is_empty() {
        String::new()
    } else {
        ips.join(",")
    };
    let props = [
        ("blipId", cfg.blip_id.to_string()),
        ("name", cfg.display_name.clone()),
        ("tcp", cfg.tcp_port.to_string()),
        ("udp", cfg.udp_port.to_string()),
        ("presence", cfg.presence_status.clone()),
        ("status", cfg.custom_status.clone()),
        ("meshProto", "3".into()),
        (
            "meshPk",
            cfg.mesh_public_key.clone().unwrap_or_default(),
        ),
    ];
    ServiceInfo::new(
        SERVICE_TYPE,
        &instance,
        &host,
        ip_arg.as_str(),
        cfg.udp_port,
        &props[..],
    )
}

/// Run mDNS register + browse until the task is cancelled / daemon fails.
pub async fn run_mdns(discovery: Arc<Discovery>) {
    let daemon = match ServiceDaemon::new() {
        Ok(d) => d,
        Err(e) => {
            tracing::warn!("mDNS unavailable: {e}");
            MDNS_ACTIVE.store(false, Ordering::Relaxed);
            return;
        }
    };

    let receiver = match daemon.browse(SERVICE_TYPE) {
        Ok(r) => r,
        Err(e) => {
            tracing::warn!("mDNS browse failed: {e}");
            MDNS_ACTIVE.store(false, Ordering::Relaxed);
            return;
        }
    };

    let mut last_fingerprint = String::new();
    if let Err(e) = register_self(&daemon, &discovery, &mut last_fingerprint).await {
        tracing::warn!("mDNS initial register failed: {e}");
    } else {
        MDNS_ACTIVE.store(true, Ordering::Relaxed);
        tracing::info!("mDNS browsing/registering {SERVICE_TYPE}");
    }

    let mut reregister = time::interval(REREGISTER_EVERY);
    loop {
        tokio::select! {
            event = receiver.recv_async() => {
                match event {
                    Ok(ServiceEvent::ServiceResolved(info)) => {
                        if let Some(pkt) = announce_from_service(&info) {
                            match discovery.apply_announce(pkt, None).await {
                                Ok(_) => discovery.publish_now().await,
                                Err(e) => {
                                    tracing::trace!("mDNS announce rejected: {e:?}");
                                }
                            }
                        }
                    }
                    Ok(ServiceEvent::ServiceRemoved(_, fullname)) => {
                        tracing::debug!("mDNS removed {fullname}");
                    }
                    Ok(_) => {}
                    Err(e) => {
                        tracing::warn!("mDNS browse channel closed: {e}");
                        MDNS_ACTIVE.store(false, Ordering::Relaxed);
                        break;
                    }
                }
            }
            _ = reregister.tick() => {
                if let Err(e) = register_self(&daemon, &discovery, &mut last_fingerprint).await {
                    tracing::debug!("mDNS re-register: {e}");
                } else {
                    MDNS_ACTIVE.store(true, Ordering::Relaxed);
                }
            }
        }
    }
}

async fn register_self(
    daemon: &ServiceDaemon,
    discovery: &Discovery,
    last_fingerprint: &mut String,
) -> Result<(), String> {
    let cfg = discovery.cfg_for_mdns().await;
    let fp = format!(
        "{}|{}|{}|{}|{}",
        cfg.blip_id, cfg.display_name, cfg.tcp_port, cfg.udp_port, cfg.presence_status
    );
    if fp == *last_fingerprint {
        return Ok(());
    }
    let info = build_service_info(&cfg).map_err(|e| e.to_string())?;
    let fullname = info.get_fullname().to_string();
    // Best-effort unregister previous instance name if id changed.
    let _ = daemon.unregister(&fullname);
    daemon.register(info).map_err(|e| e.to_string())?;
    *last_fingerprint = fp;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use mdns_sd::ServiceInfo;

    fn sample_info(id: u8, name: &str, tcp: u16, ips: &str) -> ServiceInfo {
        let props = [
            ("blipId", id.to_string()),
            ("name", name.to_string()),
            ("tcp", tcp.to_string()),
            ("udp", "42069".into()),
            ("presence", "away".into()),
            ("status", "coding".into()),
            ("meshProto", "3".into()),
            ("meshPk", "abcd".into()),
        ];
        ServiceInfo::new(
            SERVICE_TYPE,
            &format!("blip-{id}"),
            &format!("blip-{id}.local."),
            ips,
            42069,
            &props[..],
        )
        .expect("service info")
    }

    #[test]
    fn announce_from_service_maps_txt() {
        let info = sample_info(7, "Nest", 42070, "10.0.0.7");
        let pkt = announce_from_service(&info).expect("announce");
        assert_eq!(pkt.blip_id, 7);
        assert_eq!(pkt.display_name, "Nest");
        assert_eq!(pkt.tcp_port, 42070);
        assert_eq!(pkt.udp_port, 42069);
        assert_eq!(pkt.presence, "away");
        assert_eq!(pkt.custom_status, "coding");
        assert_eq!(pkt.mesh_public_key.as_deref(), Some("abcd"));
        assert!(pkt.ips.contains(&"10.0.0.7".to_string()));
    }

    #[test]
    fn announce_from_service_requires_blip_id() {
        let props: [(&str, String); 2] = [("name", "x".into()), ("tcp", "42070".into())];
        let info = ServiceInfo::new(
            SERVICE_TYPE,
            "blip-x",
            "blip-x.local.",
            "10.0.0.1",
            42069,
            &props[..],
        )
        .unwrap();
        assert!(announce_from_service(&info).is_none());
    }
}
