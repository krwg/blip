/**
 * Duplex-like facade so mesh handshake / TCP writers can target SteamLAN peers.
 */

import { EventEmitter } from 'events';
import { encodeSteamLanFrame, STEAM_LAN_FRAME_STREAM } from './steam-lan-protocol.js';

export class SteamLanSocket extends EventEmitter {
  /**
   * @param {string} steamId64
   * @param {(steamId64: string, frame: Buffer) => boolean} sendFrame
   */
  constructor(steamId64, sendFrame) {
    super();
    this.steamId64 = String(steamId64);
    this.remoteAddress = `steam:${this.steamId64}`;
    this.destroyed = false;
    this._sendFrame = sendFrame;
    this._rxBuf = Buffer.alloc(0);
  }

  setNoDelay() {}
  setKeepAlive() {}

  /**
   * @param {string|Buffer} chunk
   * @param {BufferEncoding|Function} [encoding]
   * @param {Function} [cb]
   */
  write(chunk, encoding, cb) {
    if (typeof encoding === 'function') {
      cb = encoding;
      encoding = 'utf8';
    }
    if (this.destroyed) {
      const err = new Error('steam_lan_socket_destroyed');
      cb?.(err);
      return false;
    }
    try {
      const body = Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(String(chunk), encoding || 'utf8');
      const frame = encodeSteamLanFrame(body, STEAM_LAN_FRAME_STREAM);
      const ok = this._sendFrame(this.steamId64, frame);
      if (!ok) {
        const err = new Error('steam_lan_send_failed');
        this.emit('error', err);
        cb?.(err);
        return false;
      }
      cb?.();
      return true;
    } catch (err) {
      this.emit('error', err);
      cb?.(err);
      return false;
    }
  }

  /** @param {Buffer} framePayload stream bytes from a decoded SteamLAN frame */
  pushRemoteBytes(framePayload) {
    if (this.destroyed) return;
    const chunk = Buffer.isBuffer(framePayload)
      ? framePayload
      : Buffer.from(framePayload);
    if (!chunk.length) return;
    this.emit('data', chunk);
  }

  end(data, encoding, cb) {
    if (data != null) this.write(data, encoding, () => this.destroy());
    else this.destroy();
    if (typeof encoding === 'function') encoding();
    else cb?.();
  }

  destroy(err) {
    if (this.destroyed) return;
    this.destroyed = true;
    if (err) this.emit('error', err);
    this.emit('close');
  }
}
