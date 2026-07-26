# Cross-version mesh compatibility

BLIP Morse (2.0+) encrypts mesh TCP after handshake when **both** peers advertise `meshProto ≥ 2` (X25519 + AES-GCM).

Older builds may only speak plaintext TCP (or skip handshake). To keep **all BLIP versions** able to chat and call on the same LAN:

1. Settings → **Network** → **Allow older BLIP versions (no TCP encryption)** (on by default).
2. When a peer cannot complete an encrypted handshake, Morse falls back to a **plaintext compat** session and shows the legacy `!` badge.
3. Turn the toggle **off** for an encrypted-only LAN — legacy / compat peers will be refused (`unencrypted_mesh_disabled`).

## Safety model

| Peers | Transport |
|-------|-----------|
| Morse ↔ Morse (proto ≥ 2) | Encrypted mesh TCP |
| Morse ↔ older (with consent) | Plaintext TCP + discovery-bound compat auth |
| Consent off + legacy peer | Connection refused |

WebRTC media for calls is separate from mesh TCP crypto; this setting only covers the signalling / chat channel.

## TOFU key rotation

`knownPeerKeys` remembers the last successful mesh pubkey per blipId. If a peer **rotates** keys (dev rebuild, factory reset) but keeps the same number, Morse accepts the new key when the current LAN **announce** is signature-verified for that exact pubkey (rebind). A hard mismatch with no matching verified announce still rejects the handshake.
