import net from 'net';

export const TCP_PORT = 42070;

const pendingConnections = new Map();

export function connectToPeer(ip, blipId) {
  return new Promise((resolve, reject) => {
    const key = `${ip}:${blipId}`;
    if (pendingConnections.has(key)) {
      resolve(pendingConnections.get(key));
      return;
    }

    const socket = net.createConnection({ host: ip, port: TCP_PORT }, () => {
      pendingConnections.set(key, socket);
      resolve(socket);
    });

    socket.setTimeout(5000);
    socket.on('timeout', () => {
      socket.destroy();
      pendingConnections.delete(key);
      reject(new Error('Connection timeout'));
    });

    socket.on('error', (err) => {
      pendingConnections.delete(key);
      reject(err);
    });
  });
}

export function sendOnSocket(socket, payload) {
  return new Promise((resolve, reject) => {
    if (!socket || socket.destroyed) {
      reject(new Error('Socket not available'));
      return;
    }
    socket.write(JSON.stringify(payload) + '\n', (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export function pingPeer(ip) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: ip, port: TCP_PORT }, () => {
      const payload = JSON.stringify({ type: 'ping' }) + '\n';
      socket.write(payload, () => {
        socket.destroy();
        resolve(true);
      });
    });
    socket.setTimeout(2000);
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => resolve(false));
  });
}
