use crate::config::{
    factory_reset, save_config, BlipConfig, BLIP_ID_MAX, BLIP_ID_MIN,
};
use crate::files::{new_transfer_id, read_file_chunk, ReceiveBegin};
use crate::net::tcp_mesh::is_allowed_type;
use crate::peer::PeerInfo;
use crate::state::AppState;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::time::Instant;
use tauri::{State, Window};

#[tauri::command]
pub async fn get_config(state: State<'_, AppState>) -> Result<BlipConfig, String> {
    Ok(state.config.read().await.clone())
}

#[tauri::command]
pub async fn save_config_cmd(
    state: State<'_, AppState>,
    mut config: BlipConfig,
) -> Result<BlipConfig, String> {
    config.sanitize();
    if config.blip_id < BLIP_ID_MIN || config.blip_id > BLIP_ID_MAX {
        return Err("invalid blip id".into());
    }
    save_config(&state.app_data, &config)?;
    *state.config.write().await = config.clone();
    Ok(config)
}

#[tauri::command]
pub async fn factory_reset_cmd(state: State<'_, AppState>) -> Result<BlipConfig, String> {
    let fresh = factory_reset(&state.app_data)?;
    *state.config.write().await = fresh.clone();
    Ok(fresh)
}

#[tauri::command]
pub async fn get_peers(state: State<'_, AppState>) -> Result<Vec<PeerInfo>, String> {
    Ok(state.discovery.list_peers().await)
}

#[tauri::command]
pub async fn get_app_metadata() -> Result<Value, String> {
    Ok(json!({
        "displayName": "BLIP",
        "codename": "Rust",
        "version": "3.0.0",
        "githubUrl": "https://github.com/krwg/blip"
    }))
}

#[tauri::command]
pub async fn dial_peer(state: State<'_, AppState>, blip_id: u8) -> Result<Value, String> {
    if !(BLIP_ID_MIN..=BLIP_ID_MAX).contains(&blip_id) {
        return Err("invalid blip id".into());
    }
    let peer = state
        .discovery
        .get_peer(blip_id)
        .await
        .ok_or_else(|| format!("peer {blip_id} not found"))?;
    let t0 = Instant::now();
    state.mesh.clone().ensure_session(peer).await?;
    Ok(json!({
        "ok": true,
        "blipId": blip_id,
        "readyMs": t0.elapsed().as_millis() as u64,
        "hasSession": state.mesh.has_session(blip_id).await,
    }))
}

#[tauri::command]
pub async fn ping_peer(state: State<'_, AppState>, blip_id: u8) -> Result<Value, String> {
    if !(BLIP_ID_MIN..=BLIP_ID_MAX).contains(&blip_id) {
        return Err("invalid blip id".into());
    }
    let peer = state
        .discovery
        .get_peer(blip_id)
        .await
        .ok_or_else(|| format!("peer {blip_id} not found"))?;
    let from = state.config.read().await.blip_id;
    let id = new_transfer_id();
    let t0 = Instant::now();
    state
        .mesh
        .clone()
        .ensure_and_send(
            peer,
            json!({
                "type": "ping",
                "from": from,
                "to": blip_id,
                "id": id,
            }),
        )
        .await?;
    Ok(json!({
        "ok": true,
        "id": id,
        "blipId": blip_id,
        "dialMs": t0.elapsed().as_millis() as u64,
    }))
}

#[tauri::command]
pub async fn check_id_conflict(state: State<'_, AppState>, blip_id: u8) -> Result<Value, String> {
    if !(BLIP_ID_MIN..=BLIP_ID_MAX).contains(&blip_id) {
        return Ok(json!({
            "conflict": true,
            "reason": "out_of_range",
            "blipId": blip_id,
        }));
    }
    let local = state.config.read().await.blip_id;
    if blip_id == local {
        return Ok(json!({
            "conflict": false,
            "reason": "local",
            "blipId": blip_id,
        }));
    }
    match state.discovery.get_peer(blip_id).await {
        Some(peer) => Ok(json!({
            "conflict": true,
            "reason": "peer_seen",
            "blipId": blip_id,
            "displayName": peer.info.display_name,
            "ips": peer.info.ips,
        })),
        None => Ok(json!({
            "conflict": false,
            "reason": "free",
            "blipId": blip_id,
        })),
    }
}

#[tauri::command]
pub async fn send_tcp_message(
    state: State<'_, AppState>,
    payload: Value,
) -> Result<Value, String> {
    let ty = payload
        .get("type")
        .and_then(|t| t.as_str())
        .unwrap_or("");
    if !is_allowed_type(ty) {
        return Err(format!("message type not allowed in 3.0.0: {ty}"));
    }
    let to = payload
        .get("to")
        .and_then(|t| t.as_u64())
        .map(|n| n as u8)
        .ok_or_else(|| "missing to".to_string())?;

    let peer = state
        .discovery
        .get_peer(to)
        .await
        .ok_or_else(|| format!("peer {to} not found"))?;

    let mut body = payload.clone();
    if let Some(obj) = body.as_object_mut() {
        obj.insert("from".into(), json!(state.config.read().await.blip_id));
    }
    state.mesh.clone().ensure_and_send(peer, body).await?;
    Ok(json!({ "ok": true, "to": to }))
}

#[tauri::command]
pub async fn get_network_diagnostics(state: State<'_, AppState>) -> Result<Value, String> {
    let cfg = state.config.read().await.clone();
    let peers = state.discovery.list_peers().await;
    Ok(json!({
        "udpPort": cfg.udp_port,
        "tcpPort": cfg.tcp_port,
        "localIps": crate::net::discovery::Discovery::local_ipv4s(),
        "peerCount": peers.len(),
        "peers": peers,
        "blipId": cfg.blip_id,
        "peerTtlSecs": crate::net::discovery::PEER_TTL.as_secs(),
    }))
}

#[tauri::command]
pub fn window_minimize(window: Window) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn window_maximize(window: Window) -> Result<(), String> {
    if window.is_maximized().unwrap_or(false) {
        window.unmaximize().map_err(|e| e.to_string())
    } else {
        window.maximize().map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn window_close(window: Window) -> Result<(), String> {
    window.close().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn receive_file_begin(
    state: State<'_, AppState>,
    req: ReceiveBegin,
) -> Result<Value, String> {
    let path = state.files.begin(&state.app_data, req)?;
    Ok(json!({ "path": path.to_string_lossy() }))
}

#[tauri::command]
pub async fn receive_file_chunk(
    state: State<'_, AppState>,
    transfer_id: String,
    index: u64,
    data_b64: String,
) -> Result<Value, String> {
    state.files.write_chunk(&transfer_id, index, &data_b64)?;
    Ok(json!({ "ok": true }))
}

#[tauri::command]
pub async fn receive_file_finish(
    state: State<'_, AppState>,
    transfer_id: String,
) -> Result<Value, String> {
    let path = state.files.finish(&transfer_id)?;
    Ok(json!({ "path": path.to_string_lossy() }))
}

#[tauri::command]
pub async fn receive_file_abort(
    state: State<'_, AppState>,
    transfer_id: String,
) -> Result<Value, String> {
    state.files.abort(&transfer_id)?;
    Ok(json!({ "ok": true }))
}

#[tauri::command]
pub async fn read_outgoing_chunk(
    path: String,
    offset: u64,
    len: usize,
) -> Result<Value, String> {
    let data = read_file_chunk(PathBuf::from(path).as_path(), offset, len)?;
    Ok(json!({ "data": data }))
}

#[tauri::command]
pub fn new_id() -> String {
    new_transfer_id()
}
