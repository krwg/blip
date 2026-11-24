import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

export type BlipConfig = {
  blipId: number;
  displayName: string;
  language: string;
  presenceStatus: string;
  customStatus: string;
  theme: string;
  animatedBgId: string;
  uiSoundPack: string;
  uiMelodyPack: string;
  uiSoundsEnabled: boolean;
  uiSoundsVolume: number;
  globalShortcutsEnabled: boolean;
  closeToTray: boolean;
  launchAtLogin: boolean;
  maxFileTransferGb: number;
  blockedPeerIds: number[];
  trustedPeerIds: number[];
  knownPeerKeys: Record<string, string>;
  meshPublicKey?: string | null;
  meshPrivateKey?: string | null;
  accentCustomHex?: string | null;
  profileGifActiveId?: string | null;
  hasProfileGif: boolean;
  appIconVariant: string;
  clipboardSyncMode: string;
  udpPort: number;
  tcpPort: number;
};

export type PeerInfo = {
  blipId: number;
  displayName: string;
  presence: string;
  customStatus: string;
  ips: string[];
  tcpPort: number;
  udpPort: number;
  lastSeenMs: number;
  latencyMs?: number | null;
  meshPublicKey?: string | null;
};

export type AppMetadata = {
  displayName: string;
  codename: string;
  version: string;
  githubUrl: string;
};

export const blip = {
  getConfig: () => invoke<BlipConfig>("get_config"),
  saveConfig: (config: BlipConfig) => invoke<BlipConfig>("save_config_cmd", { config }),
  factoryReset: () => invoke<BlipConfig>("factory_reset_cmd"),
  getPeers: () => invoke<PeerInfo[]>("get_peers"),
  getAppMetadata: () => invoke<AppMetadata>("get_app_metadata"),
  dialPeer: (blipId: number) =>
    invoke<{ ok: boolean; blipId: number; readyMs: number; hasSession: boolean }>(
      "dial_peer",
      { blipId },
    ),
  pingPeer: (blipId: number) =>
    invoke<{ ok: boolean; id: string; blipId: number; dialMs: number }>("ping_peer", {
      blipId,
    }),
  checkIdConflict: (blipId: number) =>
    invoke<{
      conflict: boolean;
      reason: string;
      blipId: number;
      displayName?: string;
      ips?: string[];
    }>("check_id_conflict", { blipId }),
  sendTcpMessage: (payload: Record<string, unknown>) =>
    invoke<{ ok: boolean; to: number }>("send_tcp_message", { payload }),
  getNetworkDiagnostics: () => invoke<Record<string, unknown>>("get_network_diagnostics"),
  newId: () => invoke<string>("new_id"),
  windowMinimize: () => invoke("window_minimize"),
  windowMaximize: () => invoke("window_maximize"),
  windowClose: () => invoke("window_close"),
  startDrag: async () => {
    await getCurrentWindow().startDragging();
  },
  onPeersUpdated: async (cb: (peers: PeerInfo[]) => void): Promise<UnlistenFn> =>
    listen<PeerInfo[]>("peers-updated", (e) => cb(e.payload)),
  onTcpMessage: async (cb: (msg: Record<string, unknown>) => void): Promise<UnlistenFn> =>
    listen<Record<string, unknown>>("tcp-message", (e) => cb(e.payload)),
};
