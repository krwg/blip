import dgram from 'dgram';
import mdns from 'multicast-dns';
import { getLocalIp } from './config.js';

export const UDP_PORT = 42069;
const ANNOUNCE_INTERVAL = 5000;
const PEER_TIMEOUT = 30000;

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
  }

  start() {
    this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    this.socket.on('message', (msg) => this.handleUdpMessage(msg));
    this.socket.on('error', (err) => console.error('[UDP]', err.message));
    this.socket.bind(UDP_PORT, () => {
      this.socket.setBroadcast(true);
    });

    this.startMdns();
    this.announce();
    this.announceTimer = setInterval(() => this.announce(), ANNOUNCE_INTERVAL);
    this.cleanupTimer = setInterval(() => this.cleanupStale(), 5000);
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
            /* ignore malformed */
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
    return {
      type: 'announce',
      blipId: this.config.blipId,
      displayName: this.config.displayName,
      ip: getLocalIp(),
    };
  }

  announce() {
    if (!this.config.blipId) return;
    const payload = JSON.stringify(this.buildAnnounce());
    const buf = Buffer.from(payload);
    this.socket.send(buf, 0, buf.length, UDP_PORT, '255.255.255.255');
    this.announceMdns();
  }

  handleUdpMessage(msg) {
    try {
      const data = JSON.parse(msg.toString());
      if (data.type === 'announce' && data.blipId) {
        this.registerPeer(data);
      }
    } catch {
      /* ignore */
    }
  }

  registerPeer(data) {
    const selfId = this.config.blipId;
    if (data.blipId === selfId && data.ip === getLocalIp()) return;

    const existing = this.peers.get(data.blipId);
    const peer = {
      blipId: data.blipId,
      displayName: data.displayName || `BLIP-${data.blipId}`,
      ip: data.ip,
      lastSeen: Date.now(),
      online: true,
    };

    if (!existing || existing.ip !== peer.ip || existing.displayName !== peer.displayName) {
      this.peers.set(data.blipId, peer);
    } else {
      existing.lastSeen = Date.now();
      existing.online = true;
    }

    this.occupiedIds.add(data.blipId);
    this.emitPeers();
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

  getOccupiedIds() {
    return Array.from(this.occupiedIds);
  }

  updateConfig(config) {
    this.config = config;
    this.announce();
  }

  emitPeers() {
    this.onPeersChange(this.getPeers(), this.getOccupiedIds());
  }

  stop() {
    clearInterval(this.announceTimer);
    clearInterval(this.cleanupTimer);
    if (this.socket) this.socket.close();
    if (this.mdnsInstance) this.mdnsInstance.destroy();
  }
}
