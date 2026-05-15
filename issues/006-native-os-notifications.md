# [FEATURE] OS-level toast notifications for messages and ringing calls when unfocused

## Type
Enhancement · Notifications

## Summary
Leverage Electron `Notification` API (with permission choreography on platforms that demand it) plus optional actionable buttons where supported — message preview trimmed, call ring distinct channel.

## Background
Users multitask locally; ephemeral in-app banners alone insufficient.

## Scope
- `new Notification(...)` guarded by duplicate suppression keyed by `{peerId, tsBucket}` throttle.
- Configurable verbosity: previews off / initials only full text.
- Call ring persists until Accept/Reject interacted or TTL policy.

## Acceptance criteria
- [ ] Incoming chat shows OS toast when BLIP inactive / unfocused.
- [ ] Clicking toast focuses correct conversation stub (if opened from hub).
- [ ] Permission denial degrades gracefully to existing in-app toasts only.

## Technical notes
Windows may require packaged app registration for modern toast features — document MSI vs portable divergence.

## Definition of done
No duplicate swarm of notifications during rapid bursts (debounce QA).
