# [FEATURE] Safety affordance — optional trust / PIN confirmation for unseen BLIP identities

## Type
Enhancement · Security UX

## Summary
Presentation-only first contact modal summarizing ephemeral key fingerprint or hashed announce signature so users can verbally confirm coworker parity before sensitive chat.

## Background
Pure LAN broadcasts are spoofable inside broadcast domain by malicious insiders.

## Scope
No centralized CA; fingerprints derived locally deterministic from handshake material or hashed displayName+source IP TTL policy (document spoof limitations honestly).
Configurable strict mode rejecting messages until acknowledgement.

## Acceptance criteria
- [ ] Modal shows reproducible fingerprint string copyable ASCII.
- [ ] User can defer trust; suppressed until next identity tuple change detected.
- [ ] Exportable trust store JSON migrations versioned (`trust_v1`).

## Technical notes
Avoid implying end-to-end encryption beyond WebRTC ephemeral keys unless audited — phrase as authenticity aid.

## Definition of done
Synthetic mismatch scenario tested (simulate IP swap or ID collision).
