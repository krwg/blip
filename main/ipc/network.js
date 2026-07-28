/**
 * Network / mesh peer IPC (extracted from main/index.js).
 * @see https://github.com/krwg/blip/issues/60
 */

import { ipcMain } from 'electron';
import os from 'os';
import { getLocalIp, getLocalIpv4Set } from '../config.js';
import { resolvePorts } from '../ports.js';
import { pingPeer } from '../tcp-client.js';
import { sendOnSocket } from '../tcp-client.js';
import { blipErrorIpcPayload, createBlipError, BlipErrorCode } from '../../shared/blip-errors.js';

/**
 * @param {object} deps
 * @param {() => object|null} deps.getConfig
 * @param {() => import('../discovery.js').Discovery|null} deps.getDiscovery
 * @param {(peerId: number) => object|null} deps.findPeer
 * @param {(peerId: number) => Promise<import('net').Socket>} deps.resolveMeshSendSocket
 */
export function registerNetworkIpc(deps) {
  const { getConfig, getDiscovery, findPeer, resolveMeshSendSocket } = deps;

  ipcMain.handle('get-peers', () => ({
    peers: getDiscovery()?.getPeers() || [],
    occupiedIds: getDiscovery()?.getOccupiedIds() || [],
  }));

  ipcMain.handle('get-network-diagnostics', () => {
    const config = getConfig();
    const { tcpPort, udpPort } = resolvePorts(config);
    const peers = getDiscovery()?.getPeers() || [];
    return {
      blipId: config.blipId,
      hostname: os.hostname(),
      localIp: getLocalIp(),
      localIpv4s: [...getLocalIpv4Set()],
      tcpPort,
      udpPort,
      discoveryActive: !!getDiscovery()?.socket,
      onlinePeers: peers.filter((p) => p.online).length,
      totalPeers: peers.length,
    };
  });

  ipcMain.handle('send-tcp-message', async (_, payload) => {
    try {
      const config = getConfig();
      const socket = await resolveMeshSendSocket(payload.to);
      const type = payload.type || 'message';
      const packet = {
        type,
        from: config.blipId,
        to: payload.to,
      };
      const skip = new Set(['to', 'type']);
      for (const [key, val] of Object.entries(payload)) {
        if (skip.has(key) || val === undefined) continue;
        packet[key] = val;
      }
      packet.from = config.blipId;
      packet.to = payload.to;
      packet.type = type;

      if (type === 'message' && packet.text === undefined) {
        packet.text = '';
        packet.timestamp = payload.timestamp ?? Date.now();
      }
      if (type === 'typing' && packet.active === undefined) {
        packet.active = !!payload.active;
      }
      if (type === 'profile-gif-share' && packet.dataUrl) {
        const line = JSON.stringify(packet) + '\n';
        if (Buffer.byteLength(line, 'utf8') > 3_900_000) {
          return { ok: false, error: 'profile_gif_too_large' };
        }
      }
      await sendOnSocket(socket, packet);
      return { ok: true };
    } catch (err) {
      return blipErrorIpcPayload(
        err?.blipCode != null
          ? err
          : createBlipError(BlipErrorCode.ENSURE_HANDSHAKE_FAILED, err?.message || 'send failed', err)
      );
    }
  });

  ipcMain.handle('ping-peer', async (_, blipId) => {
    const config = getConfig();
    const peer = findPeer(blipId);
    if (!peer) return false;
    return pingPeer(peer.ip, peer.tcpPort || resolvePorts(config).tcpPort);
  });

  ipcMain.handle('check-id-conflict', async (_, blipId) => {
    const config = getConfig();
    const peers = getDiscovery()?.getPeers() || [];
    const conflict = peers.find((p) => p.blipId === blipId && p.online);
    if (!conflict) return { taken: false };
    const responds = await pingPeer(
      conflict.ip,
      conflict.tcpPort || resolvePorts(config).tcpPort
    );
    return { taken: responds.ok };
  });
}
