/**
 * IPC contracts exposed by preload.cjs. Payload and result shapes remain
 * unknown while the main-process handlers are migrated incrementally.
 */
export interface BlipInvokeChannels {
  'get-trust-state': readonly [];
  'get-config': readonly [];
  'save-config': readonly [config: unknown];
  'activate-mesh-plus': readonly [key: unknown];
  'deactivate-mesh-plus': readonly [];
  'factory-reset': readonly [];
  'get-mesh-plus-status': readonly [];
  'get-app-metadata': readonly [];
  'get-app-icon-url': readonly [];
  'get-app-icon-variants': readonly [];
  'is-voice-call-active': readonly [];
  'get-avatar-data-url': readonly [];
  'save-avatar': readonly [dataUrl: unknown];
  'clear-avatar': readonly [];
  'get-profile-gif-active-url': readonly [];
  'get-profile-gif-share-url': readonly [];
  'get-profile-gif-history': readonly [];
  'save-profile-gif': readonly [dataUrl: unknown];
  'save-profile-gif-bytes': readonly [base64: unknown];
  'save-profile-gif-path': readonly [filePath: unknown];
  'set-profile-gif-active': readonly [id: unknown];
  'clear-profile-gif': readonly [];
  'is-giphy-configured': readonly [];
  'search-giphy': readonly [query: unknown, offset: unknown];
  'trending-giphy': readonly [offset: unknown];
  'import-giphy-gif': readonly [url: unknown];
  'open-external': readonly [url: unknown];
  'show-item-in-folder': readonly [filePath: unknown];
  'list-display-sources': readonly [];
  'prepare-display-capture': readonly [sourceId: unknown];
  'get-peers': readonly [];
  'get-network-diagnostics': readonly [];
  'get-github-releases': readonly [limit: unknown];
  'send-tcp-message': readonly [payload: unknown];
  'initiate-call': readonly [payload: unknown];
  'call-accept': readonly [payload: unknown];
  'call-reject': readonly [payload: unknown];
  'call-candidate': readonly [payload: unknown];
  'call-hangup': readonly [payload: unknown];
  'call-state': readonly [payload: unknown];
  'call-renegotiate': readonly [payload: unknown];
  'call-renegotiate-answer': readonly [payload: unknown];
  'ping-peer': readonly [blipId: unknown];
  'check-id-conflict': readonly [blipId: unknown];
  'open-call-outgoing': readonly [payload: unknown];
  'close-call-window': readonly [];
  'check-for-updates': readonly [];
  'quit-and-install': readonly [];
  'show-message-notification': readonly [payload: unknown];
  'beacon-udp-send': readonly [payload: unknown];
  'beacon-paths': readonly [];
  'beacon-pick-publish-file': readonly [];
  'beacon-publish-from-path': readonly [payload: unknown];
  'beacon-serve-chunks-tcp': readonly [payload: unknown];
  'send-file-from-path': readonly [payload: unknown];
  'beacon-write-meta': readonly [payload: unknown];
  'beacon-read-meta': readonly [payload: unknown];
  'beacon-read-preview': readonly [payload: unknown];
  'beacon-write-preview': readonly [payload: unknown];
  'set-tray-transfer-progress': readonly [info: unknown];
  'beacon-write-chunk': readonly [payload: unknown];
  'beacon-write-chunks-batch': readonly [payload: unknown];
  'beacon-read-chunk': readonly [payload: unknown];
  'beacon-read-chunks-batch': readonly [payload: unknown];
  'beacon-have-bitmap': readonly [payload: unknown];
  'beacon-chunk-exists': readonly [payload: unknown];
  'beacon-count-chunks': readonly [payload: unknown];
  'beacon-list-local': readonly [];
  'beacon-save-assembled': readonly [payload: unknown];
  'beacon-delete-seed': readonly [payload: unknown];
  'beacon-seed-exists': readonly [payload: unknown];
  'beacon-read-blip-file': readonly [payload: unknown];
  'call-window-toggle-fullscreen': readonly [];
  'call-window-is-fullscreen': readonly [];
  'open-group-call': readonly [payload: unknown];
  'open-group-call-incoming': readonly [payload: unknown];
  'leave-group-call': readonly [];
  'close-group-call-window': readonly [];
  'get-group-for-call': readonly [groupId: unknown];
  'get-foreground-presence': readonly [];
  'overlay-push-stats': readonly [stats: unknown];
}

export type BlipInvokeChannel = keyof BlipInvokeChannels;
export type BlipInvoke = <Channel extends BlipInvokeChannel>(
  channel: Channel,
  ...args: BlipInvokeChannels[Channel]
) => Promise<unknown>;

/** Public shape of the `window.blip` bridge during the gradual migration. */
export interface BlipPreloadApi {
  platform: string;
  [member: string]: unknown;
}

export interface BlipOverlayApi {
  onUpdate(callback: (data: unknown) => void): () => void;
  ready(): void;
}

declare global {
  interface Window {
    blip: BlipPreloadApi;
    blipOverlay: BlipOverlayApi;
  }
}
