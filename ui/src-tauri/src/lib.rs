mod commands;
mod config;
mod files;
mod identity;
mod net;
mod peer;
mod state;

use state::AppState;
use tauri::{Emitter, Manager};
use tracing_subscriber::EnvFilter;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env().add_directive("blip=info".parse().unwrap()))
        .try_init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.set_focus();
            }
        }))
        .setup(|app| {
            let app_data = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from(".blip-data"));
            let state = AppState::boot(app_data);
            let discovery = state.discovery.clone();
            let mesh = state.mesh.clone();
            let mut inbound = mesh.subscribe();
            let mut peers_rx = discovery.subscribe();
            let handle_mesh = app.handle().clone();
            let handle_peers = app.handle().clone();
            app.manage(state);

            tauri::async_runtime::spawn(async move {
                discovery.run().await;
            });
            tauri::async_runtime::spawn(async move {
                mesh.run_listener().await;
            });
            tauri::async_runtime::spawn(async move {
                while let Ok(msg) = inbound.recv().await {
                    let _ = handle_mesh.emit("tcp-message", msg);
                }
            });
            tauri::async_runtime::spawn(async move {
                while let Ok(peers) = peers_rx.recv().await {
                    let _ = handle_peers.emit("peers-updated", peers);
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_config,
            commands::save_config_cmd,
            commands::factory_reset_cmd,
            commands::get_peers,
            commands::get_app_metadata,
            commands::dial_peer,
            commands::ping_peer,
            commands::check_id_conflict,
            commands::send_tcp_message,
            commands::get_network_diagnostics,
            commands::window_minimize,
            commands::window_maximize,
            commands::window_close,
            commands::receive_file_begin,
            commands::receive_file_chunk,
            commands::receive_file_finish,
            commands::receive_file_abort,
            commands::read_outgoing_chunk,
            commands::new_id,
        ])
        .run(tauri::generate_context!())
        .expect("error while running BLIP");
}
