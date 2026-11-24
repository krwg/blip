use crate::config::{factory_reset, save_config, BlipConfig, BLIP_ID_MAX, BLIP_ID_MIN};
use crate::files::{new_transfer_id, read_file_chunk, ReceiveBegin};
use crate::net::tcp_mesh::is_allowed_type;
use crate::peer::PeerInfo;
use crate::state::AppState;
use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::{AppHandle, State, Window};

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
pub async fn dial_peer(
    app: AppHandle,
    state: State<'_, AppState>,
    blip_id: u8,
) -> Result<Value, String> {
    let peer = state
        .discovery
        .get_peer(blip_id)
        .await
        .ok_or_else(|| "peer not found".to_string())?;
    state.mesh.clone().dial_peer(peer, app).await?;
    Ok(json!({ "ok": true }))
}

#[tauri::command]
pub async fn ping_peer(
    app: AppHandle,
    state: State<'_, AppState>,
    blip_id: u8,
) -> Result<Value, String> {
    let peer = state
        .discovery
        .get_peer(blip_id)
        .await
        .ok_or_else(|| "peer not found".to_string())?;
    let _ = state.mesh.clone().dial_peer(peer, app).await;
    let from = state.config.read().await.blip_id;
    state
        .mesh
        .send_to_peer(
            blip_id,
            json!({
                "type": "ping",
                "from": from,
                "id": new_transfer_id(),
            }),
        )
        .await?;
    Ok(json!({ "ok": true }))
}

#[tauri::command]
pub async fn check_id_conflict(state: State<'_, AppState>, blip_id: u8) -> Result<Value, String> {
    let conflict = state.discovery.get_peer(blip_id).await.is_some();
    Ok(json!({ "conflict": conflict }))
}

#[tauri::command]
pub async fn send_tcp_message(
    app: AppHandle,
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

    if let Some(peer) = state.discovery.get_peer(to).await {
        let _ = state.mesh.clone().dial_peer(peer, app).await;
    }

    let mut body = payload.clone();
    if let Some(obj) = body.as_object_mut() {
        obj.insert("from".into(), json!(state.config.read().await.blip_id));
    }
    state.mesh.send_to_peer(to, body).await?;
    Ok(json!({ "ok": true }))
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
        "blipId": cfg.blip_id,
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
