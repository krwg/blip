use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

pub const BLIP_ID_MIN: u8 = 1;
pub const BLIP_ID_MAX: u8 = 64;
pub const DEFAULT_UDP_PORT: u16 = 42069;
pub const DEFAULT_TCP_PORT: u16 = 42070;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlipConfig {
    pub blip_id: u8,
    pub display_name: String,
    pub language: String,
    pub presence_status: String,
    pub custom_status: String,
    pub theme: String,
    pub animated_bg_id: String,
    pub ui_sound_pack: String,
    pub ui_melody_pack: String,
    pub ui_sounds_enabled: bool,
    pub ui_sounds_volume: f32,
    pub global_shortcuts_enabled: bool,
    pub close_to_tray: bool,
    pub launch_at_login: bool,
    pub max_file_transfer_gb: u32,
    pub blocked_peer_ids: Vec<u8>,
    pub trusted_peer_ids: Vec<u8>,
    pub known_peer_keys: HashMap<String, String>,
    pub mesh_public_key: Option<String>,
    pub mesh_private_key: Option<String>,
    pub accent_custom_hex: Option<String>,
    pub profile_gif_active_id: Option<String>,
    pub has_profile_gif: bool,
    pub app_icon_variant: String,
    pub clipboard_sync_mode: String,
    pub udp_port: u16,
    pub tcp_port: u16,
}

impl Default for BlipConfig {
    fn default() -> Self {
        Self {
            blip_id: 1,
            display_name: "Operator".into(),
            language: "en".into(),
            presence_status: "online".into(),
            custom_status: String::new(),
            theme: "dark".into(),
            animated_bg_id: "none".into(),
            ui_sound_pack: "signal".into(),
            ui_melody_pack: "mesh".into(),
            ui_sounds_enabled: true,
            ui_sounds_volume: 0.7,
            global_shortcuts_enabled: true,
            close_to_tray: true,
            launch_at_login: false,
            max_file_transfer_gb: 10,
            blocked_peer_ids: vec![],
            trusted_peer_ids: vec![],
            known_peer_keys: HashMap::new(),
            mesh_public_key: None,
            mesh_private_key: None,
            accent_custom_hex: None,
            profile_gif_active_id: None,
            has_profile_gif: false,
            app_icon_variant: "default".into(),
            clipboard_sync_mode: "off".into(),
            udp_port: DEFAULT_UDP_PORT,
            tcp_port: DEFAULT_TCP_PORT,
        }
    }
}

impl BlipConfig {
    pub fn sanitize(&mut self) {
        if self.blip_id < BLIP_ID_MIN || self.blip_id > BLIP_ID_MAX {
            self.blip_id = BLIP_ID_MIN;
        }
        if self.udp_port == 0 {
            self.udp_port = DEFAULT_UDP_PORT;
        }
        if self.tcp_port == 0 {
            self.tcp_port = DEFAULT_TCP_PORT;
        }
        if self.max_file_transfer_gb < 1 {
            self.max_file_transfer_gb = 1;
        }
        if self.max_file_transfer_gb > 100 {
            self.max_file_transfer_gb = 100;
        }
        // Ex-MESH+ packs are free in 3.0.0 Rust — no premium reset.
    }
}

pub fn config_path(app_data: &Path) -> PathBuf {
    app_data.join("blip-config.json")
}

pub fn load_config(app_data: &Path) -> BlipConfig {
    let path = config_path(app_data);
    let mut cfg = if path.exists() {
        match fs::read_to_string(&path) {
            Ok(raw) => serde_json::from_str(&raw).unwrap_or_default(),
            Err(_) => BlipConfig::default(),
        }
    } else {
        BlipConfig::default()
    };
    cfg.sanitize();
    cfg
}

pub fn save_config(app_data: &Path, cfg: &BlipConfig) -> Result<(), String> {
    fs::create_dir_all(app_data).map_err(|e| e.to_string())?;
    let path = config_path(app_data);
    let raw = serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?;
    fs::write(path, raw).map_err(|e| e.to_string())
}

pub fn factory_reset(app_data: &Path) -> Result<BlipConfig, String> {
    let fresh = BlipConfig::default();
    save_config(app_data, &fresh)?;
    // Wipe auxiliary stores but keep directory.
    for name in ["avatar.png", "profile-gifs", "incoming-files", "chat-export"] {
        let p = app_data.join(name);
        if p.is_dir() {
            let _ = fs::remove_dir_all(&p);
        } else if p.is_file() {
            let _ = fs::remove_file(&p);
        }
    }
    Ok(fresh)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_id_in_range() {
        let c = BlipConfig::default();
        assert!(c.blip_id >= BLIP_ID_MIN && c.blip_id <= BLIP_ID_MAX);
    }
}
