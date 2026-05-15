import { Tray, Menu, nativeImage } from 'electron';
import { existsSync } from 'fs';
import { resolveBuildAsset } from './paths.js';

let tray = null;

function createTrayIcon() {
  const trayPath = resolveBuildAsset('tray-16.png');
  if (existsSync(trayPath)) {
    return nativeImage.createFromPath(trayPath);
  }

  const size = 16;
  const canvas = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const accent = (x + y) % 3 === 0;
      canvas[i] = accent ? 0 : 10;
      canvas[i + 1] = accent ? 255 : 10;
      canvas[i + 2] = accent ? 200 : 10;
      canvas[i + 3] = 255;
    }
  }
  return nativeImage.createFromBuffer(canvas, { width: size, height: size });
}

export function createTray(mainWindow) {
  try {
    tray = new Tray(createTrayIcon());
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'BLIP',
        click: () => {
          mainWindow?.show();
          mainWindow?.focus();
        },
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => mainWindow?.close(),
      },
    ]);
    tray.setToolTip('BLIP');
    tray.setContextMenu(contextMenu);
    tray.on('click', () => {
      mainWindow?.show();
      mainWindow?.focus();
    });
  } catch {
    /* tray optional on some platforms */
  }
}
