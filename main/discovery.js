import dgram from 'dgram';
import mdns from 'multicast-dns';
import {
  getLocalIp,
  getLocalIpv4List,
  getLocalIpv4Set,
  listLanIpv4Interfaces,
  normalizePeerIp,
  peerDialIps,
} from './config.js';
import { resolvePorts, getDiscoveryBroadcastPorts } from './ports.js';
import {
  MESH_PROTO,
  announceCanonical,
  signCanonical,
  verifyAnnouncePayload,
  shouldAcceptAnnounce,
} from './mesh-identity.js';
import { resolveEntitlementState } from './mesh-plus-license.js';
import {
  getBuildAnnounceTrust,
  peerBuildTrustFromAnnounce,
  peerMeshPlusTrustFromAnnounce,
} from './trust-state.js';

const ANNOUNCE_INTERVAL = 5000;
const IFACE_REFRESH_INTERVAL = 20000;
const PEER_TIMEOUT = 30000;
const MAX_PRESENCE_TEXT = 48;
const MAX_UNICAST_PEERS = 24;

function uniqueIps(...lists) {
  const out = [];
  const seen = new Set();
  for (const list of lists) {
    const values = Array.isArray(list) ? list : [list];
    for (const raw of values) {
      const ip = normalizePeerIp(raw);
      if (!ip || seen.has(ip) || ip === '0.0.0.0') continue;
      seen.add(ip);
      out.push(ip);
    }
  }
  return out;
}

function sanitizePresenceText(raw) {
  if (raw == null) return '';
  return String(raw)
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, MAX_PRESENCE_TEXT);
}

export class Discovery {
  constructor(config, onPeersChange) {
    this.config = config;
    this.onPeersChange = onPeersChange;
    this.peers = new Map();
    this.occupiedIds = new Set();
    this.socket = null;
    this.mdnsInstance = null;
    this.announceTimer = null;
    this.cleanupTimer = null;
    this.udpPort = resolvePorts(config).udpPort;

    this.onSeedPacket = null;
    /** @type {Map<string, { socket: import('dgram').Socket, broadcast: string }>} */
    this.ifaceSenders = new Map();
    this.lastIfaceRefreshAt = 0;
    this.announceBurstTimers = [];
  }

  async start() {
    this.udpPort = resolvePorts(this.config).udpPort;
    this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    this.socket.on('message', (msg, rinfo) => this.handleUdpMessage(msg, rinfo));

    try {
      await new Promise((resolve, reject) => {
        const onBindError = (err) => {
          this.socket.off('error', onBindError);
          reject(err);
        };
        this.socket.once('error', onBindError);
        this.socket.bind(this.udpPort, () => {
          this.socket.off('error', onBindError);
          this.socket.on('error', (err) => console.error('[UDP]', err.message));
          this.socket.setBroadcast(true);
          console.log(`[UDP] listening on ${this.udpPort}`);
          resolve();
        });
      });
    } catch (err) {
      try {
        this.socket?.close();
      } catch {

      }
      this.socket = null;
      throw err;
    }

    await this.refreshIfaceSenders({ force: true });
    this.startMdns();
    this.announce();
    // Burst helps Wi‑Fi ↔ Ethernet peers hear each other after join.
    this.announceBurstTimers = [
      setTimeout(() => this.announce(), 700),
      setTimeout(() => this.announce(), 1800),
      setTimeout(() => this.announce(), 3500),
    ];
    this.announceTimer = setInterval(() => this.announce(), ANNOUNCE_INTERVAL);
    this.cleanupTimer = setInterval(() => this.cleanupStale(), 5000);
  }

  async refreshIfaceSenders({ force = false } = {}) {
    const now = Date.now();
    if (!force && now - this.lastIfaceRefreshAt < IFACE_REFRESH_INTERVAL) return;
    this.lastIfaceRefreshAt = now;
    const ifaces = listLanIpv4Interfaces({ force });
    const keep = new Set(ifaces.map((i) => i.address));
    for (const [addr, entry] of this.ifaceSenders) {
      if (keep.has(addr)) continue;
      try {
        entry.socket.close();
      } catch {
        /* ignore */
      }
      this.ifaceSenders.delete(addr);
    }
    for (const iface of ifaces) {
      if (this.ifaceSenders.has(iface.address)) {
        const cur = this.ifaceSenders.get(iface.address);
        if (cur) cur.broadcast = iface.broadcast;
        continue;
      }
      try {
        const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
        await new Promise((resolve, reject) => {
          const onErr = (err) => {
            socket.off('error', onErr);
            reject(err);
          };
          socket.once('error', onErr);
          socket.bind({ address: iface.address, port: 0 }, () => {
            socket.off('error', onErr);
            socket.on('error', (err) => console.error('[UDP iface]', iface.address, err.message));
            try {
              socket.setBroadcast(true);
            } catch {
              /* ignore */
            }
            resolve();
          });
        });
        this.ifaceSenders.set(iface.address, { socket, broadcast: iface.broadcast });
      } catch (err) {
        console.error('[UDP iface] bind failed', iface.address, err?.message || err);
      }
    }
  }

  sendBroadcastBuf(buf) {
    if (!buf?.length) return;
    const ports = getDiscoveryBroadcastPorts(this.config);
    const hosts = new Set(['255.255.255.255']);
    for (const iface of listLanIpv4Interfaces()) {
      if (iface.broadcast) hosts.add(iface.broadcast);
    }
    const sendOne = (socket, host, port) => {
      try {
        socket.send(buf, 0, buf.length, port, host);
      } catch {
        /* ignore */
      }
    };
    if (this.socket) {
      for (const host of hosts) {
        for (const port of ports) sendOne(this.socket, host, port);
      }
    }
    for (const { socket, broadcast } of this.ifaceSenders.values()) {
      const targets = new Set(['255.255.255.255']);
      if (broadcast) targets.add(broadcast);
      for (const host of targets) {
        for (const port of ports) sendOne(socket, host, port);
      }
    }
    // Unicast to known peers — bridges asymmetric broadcast (Wi‑Fi ↔ Ethernet).
    if (this.socket) {
      let n = 0;
      for (const peer of this.peers.values()) {
        if (!peer?.online || n >= MAX_UNICAST_PEERS) break;
        const ips = peerDialIps(peer).slice(0, 2);
        if (!ips.length) continue;
        n += 1;
        const peerUdp = Number(peer.udpPort) || this.udpPort;
        for (const ip of ips) {
          sendOne(this.socket, ip, peerUdp);
          for (const port of ports) {
            if (port !== peerUdp) sendOne(this.socket, ip, port);
          }
        }
      }
    }
  }

  announce() {
    if (!this.config.blipId || !this.socket) return;
    void (async () => {
      try {
        await this.refreshIfaceSenders();
      } catch {
        /* ignore */
      }
      const payload = JSON.stringify(this.buildAnnounce());
      const buf = Buffer.from(payload);
      this.sendBroadcastBuf(buf);
      this.announceMdns();
    })();
  }

  startMdns() {
    this.mdnsInstance = mdns();
    this.mdnsInstance.on('response', (resp) => {
      resp.answers.forEach((a) => {
        if (a.name === '_blip._udp.local' && a.type === 'TXT') {
          try {
            const data = JSON.parse(Buffer.from(a.data).toString());
            this.registerPeer(data);
          } catch {

          }
        }
      });
    });

    this.mdnsInstance.on('query', (query) => {
      query.questions.forEach((q) => {
        if (q.name === '_blip._udp.local') {
          this.announceMdns();
        }
      });
    });

    setInterval(() => this.announceMdns(), ANNOUNCE_INTERVAL);
  }

  announceMdns() {
    if (!this.config.blipId || !this.mdnsInstance) return;
    const payload = this.buildAnnounce();
    this.mdnsInstance.respond({
      answers: [
        {
          name: '_blip._udp.local',
          type: 'PTR',
          data: `blip-${this.config.blipId}._blip._udp.local`,
          ttl: 120,
        },
        {
          name: `blip-${this.config.blipId}._blip._udp.local`,
          type: 'TXT',
          data: Buffer.from(JSON.stringify(payload)),
          ttl: 120,
        },
      ],
    });
  }

  buildAnnounce() {
    const { udpPort, tcpPort } = resolvePorts(this.config);
    let presence = this.config.presenceStatus || 'online';
    if (this.config.doNotDisturb) presence = 'busy';
    else if (presence === 'online' && this.config.idleAwayActive) presence = 'away';
    const ip = getLocalIp();
    const ips = getLocalIpv4List();
    const meshAnnounceTs = Date.now();
    const meshPubkey = this.config.meshPublicKey || '';
    const base = {
      type: 'announce',
      blipId: this.config.blipId,
      displayName: this.config.displayName,
      presence,
      presenceText: sanitizePresenceText(this.config.presenceText),
      ip,
      ips,
      udpPort,
      tcpPort,
      meshProto: MESH_PROTO,
      meshPubkey,
      meshAnnounceTs,
    };
    const canonical = announceCanonical({
      blipId: base.blipId,
      displayName: base.displayName || '',
      presence: base.presence,
      presenceText: base.presenceText,
      ip: base.ip,
      udpPort: base.udpPort,
      tcpPort: base.tcpPort,
      meshAnnounceTs,
      meshPubkey,
    });
    const meshAnnounceSig = signCanonical(this.config, canonical);
    const meshPlus = resolveEntitlementState(this.config);
    const hasProfileGif = meshPlus && !!this.config?.hasProfileGif;
    const buildTrust = getBuildAnnounceTrust();
    return {
      ...base,
      meshAnnounceSig,
      meshPlus,
      hasProfileGif,
      buildVerified: buildTrust.buildVerified,
      buildIssuer: buildTrust.buildIssuer,
      buildVersion: buildTrust.buildVersion,
      meshPlusTrust: meshPlus ? buildTrust.meshPlusTrust : null,
      ips,
    };
  }

  broadcastPacket(obj) {
    if (!this.config.blipId || !this.socket || !obj) return;
    const payload = JSON.stringify(obj);
    const buf = Buffer.from(payload);
    this.sendBroadcastBuf(buf);
  }

  handleUdpMessage(msg, rinfo) {
    try {
      const data = JSON.parse(msg.toString());
      if (data.type === 'seed-announce' || data.type === 'seed-pulse' || data.type === 'seed-gone') {
        this.onSeedPacket?.(data);
        return;
      }
      if (data.type === 'announce' && data.blipId) {
        this.registerPeer(data, rinfo?.address);
      }
    } catch {

    }
  }

  registerPeer(data, observedIp) {
    const selfId = this.config.blipId;
    const announceIp = normalizePeerIp(data.ip);
    const observed = normalizePeerIp(observedIp);
    const announcedIps = uniqueIps(data.ip, data.ips);
    if (
      selfId != null &&
      data.blipId === selfId &&
      announcedIps.some((ip) => getLocalIpv4Set().has(ip))
    ) {
      return;
    }
    if (selfId != null && data.blipId === selfId && observed && getLocalIpv4Set().has(observed)) {
      return;
    }

    if (!shouldAcceptAnnounce(data)) {
      return;
    }

    const { tcpPort, udpPort } = resolvePorts(this.config);
    const peerTcp = Number(data.tcpPort) || tcpPort;
    const peerUdp = Number(data.udpPort) || udpPort;

    const existing = this.peers.get(data.blipId);
    const presence =
      data.presence === 'away' || data.presence === 'busy' ? data.presence : 'online';
    const presenceText = sanitizePresenceText(data.presenceText);
    const check = verifyAnnouncePayload(data);
    const meshVerified = check.ok;
    const meshLegacy = !!check.meshLegacy;
    const meshProto = Number(check.meshProto) || Number(data.meshProto) || 0;
    const meshPubkey = String(data.meshPubkey || '');
    const meshTcpEncrypted = existing?.meshTcpEncrypted === true && !meshLegacy;

    // Prefer packet source when we have no stable dial IP yet; keep existing primary if still listed.
    const ips = uniqueIps(observed, announceIp, data.ips, existing?.ips);
    const primaryIp =
      (existing?.ip && ips.includes(existing.ip) && existing.ip) ||
      observed ||
      announceIp ||
      ips[0] ||
      data.ip;

    const peer = {
      blipId: data.blipId,
      displayName: data.displayName || `BLIP-${data.blipId}`,
      presence,
      presenceText,
      ip: primaryIp,
      ips,
      tcpPort: peerTcp,
      udpPort: peerUdp,
      lastSeen: Date.now(),
      online: true,
      meshVerified,
      meshLegacy,
      meshProto,
      meshTcpEncrypted,
      meshPubkey,
      meshPlus: !!data.meshPlus,
      hasProfileGif: !!data.meshPlus && !!data.hasProfileGif,
      buildTrust: peerBuildTrustFromAnnounce(data),
      buildIssuer: String(data.buildIssuer || ''),
      buildVerified: !!data.buildVerified,
      meshPlusTrust: peerMeshPlusTrustFromAnnounce(data),
    };

    const structuralChanged =
      !existing ||
      existing.displayName !== peer.displayName ||
      existing.presence !== peer.presence ||
      existing.tcpPort !== peer.tcpPort ||
      existing.meshVerified !== peer.meshVerified ||
      existing.meshLegacy !== peer.meshLegacy ||
      existing.meshProto !== peer.meshProto ||
      existing.meshTcpEncrypted !== peer.meshTcpEncrypted ||
      existing.meshPubkey !== peer.meshPubkey ||
      existing.meshPlus !== peer.meshPlus ||
      existing.hasProfileGif !== peer.hasProfileGif ||
      existing.buildTrust !== peer.buildTrust ||
      existing.buildVerified !== peer.buildVerified ||
      existing.meshPlusTrust !== peer.meshPlusTrust;

    const presenceTextChanged =
      !!existing && existing.presenceText !== peer.presenceText;

    this.occupiedIds.add(data.blipId);

    if (!existing) {
      this.peers.set(data.blipId, peer);
      this.emitPeers();
      return;
    }

    if (structuralChanged) {
      if (existing.ip && ips.includes(existing.ip)) peer.ip = existing.ip;
      this.peers.set(data.blipId, { ...peer, meshCompat: existing.meshCompat });
      this.emitPeers();
      return;
    }

    const wasOffline = !existing.online;
    existing.lastSeen = Date.now();
    existing.online = true;
    existing.tcpPort = peerTcp;
    existing.udpPort = peerUdp;
    existing.ips = ips;
    if (!ips.includes(existing.ip)) existing.ip = primaryIp;
    if (presenceTextChanged) {
      existing.presenceText = peer.presenceText;
      this.emitPeers({ sublineOnly: true });
    } else if (wasOffline) {
      this.emitPeers();
    }
  }

  cleanupStale() {
    const now = Date.now();
    let changed = false;
    for (const [id, peer] of this.peers) {
      if (now - peer.lastSeen > PEER_TIMEOUT) {
        if (peer.online) {
          peer.online = false;
          changed = true;
        }
      }
    }
    if (changed) this.emitPeers();
  }

  getPeers() {
    return Array.from(this.peers.values()).sort((a, b) => a.blipId - b.blipId);
  }

  noteObservedPeerIp(blipId, ip) {
    const id = Number(blipId);
    if (!Number.isFinite(id)) return;
    const peer = this.peers.get(id);
    if (!peer) return;
    const nip = normalizePeerIp(ip);
    if (!nip) return;
    const ips = uniqueIps(nip, peer.ip, peer.ips);
    peer.ips = ips;
    // Update dial target quietly — do not rebuild contacts/chats UI.
    if (peer.ip !== nip) peer.ip = nip;
  }

  notePeerChannelCrypto(blipId, encrypted) {
    const id = Number(blipId);
    if (!Number.isFinite(id)) return;
    const peer = this.peers.get(id);
    if (!peer) return;
    const next = !!encrypted && !peer.meshLegacy;
    if (peer.meshTcpEncrypted === next) return;
    peer.meshTcpEncrypted = next;
    this.emitPeers();
  }

  notePeerCompat(blipId, compat) {
    const id = Number(blipId);
    if (!Number.isFinite(id)) return;
    const peer = this.peers.get(id);
    if (!peer) return;
    const next = !!compat;
    if (peer.meshCompat === next) return;
    peer.meshCompat = next;
    if (next) {
      peer.meshTcpEncrypted = false;
      peer.meshLegacy = true;
    }
    this.emitPeers();
  }

  getOccupiedIds() {
    return Array.from(this.occupiedIds);
  }

  updateConfig(config) {
    this.config = config;
    this.announce();
  }

  emitPeers(meta = {}) {
    this.onPeersChange(this.getPeers(), this.getOccupiedIds(), meta);
  }

  stop() {
    clearInterval(this.announceTimer);
    clearInterval(this.cleanupTimer);
    for (const t of this.announceBurstTimers || []) clearTimeout(t);
    this.announceBurstTimers = [];
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    for (const { socket } of this.ifaceSenders.values()) {
      try {
        socket.close();
      } catch {
        /* ignore */
      }
    }
    this.ifaceSenders.clear();
    if (this.mdnsInstance) {
      this.mdnsInstance.destroy();
      this.mdnsInstance = null;
    }
  }
}
