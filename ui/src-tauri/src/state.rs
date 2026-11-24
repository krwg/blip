use crate::config::{load_config, save_config, BlipConfig};
use crate::files::FileReceiveStore;
use crate::identity::ensure_mesh_keys;
use crate::net::discovery::Discovery;
use crate::net::tcp_mesh::TcpMesh;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;

pub struct AppState {
    pub app_data: PathBuf,
    pub config: Arc<RwLock<BlipConfig>>,
    pub discovery: Arc<Discovery>,
    pub mesh: Arc<TcpMesh>,
    pub files: Arc<FileReceiveStore>,
}

impl AppState {
    pub fn boot(app_data: PathBuf) -> Self {
        let _ = std::fs::create_dir_all(&app_data);
        let mut cfg = load_config(&app_data);
        ensure_mesh_keys(&mut cfg);
        let _ = save_config(&app_data, &cfg);
        let config = Arc::new(RwLock::new(cfg));
        let discovery = Arc::new(Discovery::new(config.clone()));
        let mesh = Arc::new(TcpMesh::new(config.clone()));
        Self {
            app_data,
            config,
            discovery,
            mesh,
            files: Arc::new(FileReceiveStore::new()),
        }
    }
}
