use base64::{engine::general_purpose::STANDARD as B64, Engine};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use uuid::Uuid;

#[derive(Debug, Default)]
pub struct FileReceiveStore {
    inner: Mutex<HashMap<String, ReceiveSession>>,
}

#[derive(Debug)]
struct ReceiveSession {
    path: PathBuf,
    size: u64,
    chunk_size: u64,
    received: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReceiveBegin {
    pub transfer_id: String,
    pub file_name: String,
    pub size: u64,
    pub chunk_size: u64,
}

impl FileReceiveStore {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn begin(&self, app_data: &Path, req: ReceiveBegin) -> Result<PathBuf, String> {
        let dir = app_data.join("incoming-files");
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let safe = sanitize_name(&req.file_name);
        let path = dir.join(format!("{}_{}", req.transfer_id, safe));
        File::create(&path).map_err(|e| e.to_string())?;
        self.inner.lock().unwrap().insert(
            req.transfer_id.clone(),
            ReceiveSession {
                path: path.clone(),
                size: req.size,
                chunk_size: req.chunk_size.max(1),
                received: 0,
            },
        );
        Ok(path)
    }

    pub fn write_chunk(&self, transfer_id: &str, index: u64, data_b64: &str) -> Result<(), String> {
        let bytes = B64.decode(data_b64).map_err(|e| e.to_string())?;
        let mut map = self.inner.lock().unwrap();
        let session = map
            .get_mut(transfer_id)
            .ok_or_else(|| "unknown transfer".to_string())?;
        let mut f = OpenOptions::new()
            .write(true)
            .open(&session.path)
            .map_err(|e| e.to_string())?;
        let offset = index.saturating_mul(session.chunk_size);
        f.seek(SeekFrom::Start(offset)).map_err(|e| e.to_string())?;
        f.write_all(&bytes).map_err(|e| e.to_string())?;
        session.received = session.received.saturating_add(bytes.len() as u64);
        Ok(())
    }

    pub fn finish(&self, transfer_id: &str) -> Result<PathBuf, String> {
        let mut map = self.inner.lock().unwrap();
        let session = map
            .remove(transfer_id)
            .ok_or_else(|| "unknown transfer".to_string())?;
        Ok(session.path)
    }

    pub fn abort(&self, transfer_id: &str) -> Result<(), String> {
        let mut map = self.inner.lock().unwrap();
        if let Some(session) = map.remove(transfer_id) {
            let _ = fs::remove_file(session.path);
        }
        Ok(())
    }
}

pub fn read_file_chunk(path: &Path, offset: u64, len: usize) -> Result<String, String> {
    let mut f = File::open(path).map_err(|e| e.to_string())?;
    f.seek(SeekFrom::Start(offset)).map_err(|e| e.to_string())?;
    let mut buf = vec![0u8; len];
    let n = f.read(&mut buf).map_err(|e| e.to_string())?;
    buf.truncate(n);
    Ok(B64.encode(buf))
}

pub fn new_transfer_id() -> String {
    Uuid::new_v4().to_string()
}

fn sanitize_name(name: &str) -> String {
    name.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect()
}
