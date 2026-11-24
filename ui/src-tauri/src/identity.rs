use crate::config::BlipConfig;
use ed25519_dalek::{SigningKey, VerifyingKey};
use rand::rngs::OsRng;

pub fn ensure_mesh_keys(cfg: &mut BlipConfig) {
    if cfg.mesh_public_key.is_some() && cfg.mesh_private_key.is_some() {
        return;
    }
    let signing = SigningKey::generate(&mut OsRng);
    let verifying: VerifyingKey = signing.verifying_key();
    cfg.mesh_private_key = Some(hex::encode(signing.to_bytes()));
    cfg.mesh_public_key = Some(hex::encode(verifying.as_bytes()));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generates_keys() {
        let mut cfg = BlipConfig::default();
        ensure_mesh_keys(&mut cfg);
        assert!(cfg.mesh_public_key.as_ref().unwrap().len() >= 32);
        assert!(cfg.mesh_private_key.as_ref().unwrap().len() >= 32);
    }
}
