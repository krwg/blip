/**
 * electron-builder afterPack:
 * 1) Embed Windows .ico + version strings (rcedit) — needed because
 *    signAndEditExecutable is false (winCodeSign symlink extract fails without
 *    Developer Mode / admin on some hosts).
 * 2) Run MESH+ obfuscation when asar is unpacked to resources/app.
 */
const { existsSync } = require('fs');
const { join } = require('path');
const rcedit = require('rcedit');
const obfuscate = require('./obfuscate-after-pack.cjs');

async function embedWindowsIcon(context) {
  if (context.electronPlatformName !== 'win32') return;

  const exeName = `${context.packager.appInfo.productFilename}.exe`;
  const exePath = join(context.appOutDir, exeName);
  const iconPath = join(context.packager.projectDir, 'build', 'icon.ico');

  if (!existsSync(exePath)) {
    console.warn('[after-pack] skip icon — exe missing', exePath);
    return;
  }
  if (!existsSync(iconPath)) {
    console.warn('[after-pack] skip icon — ico missing', iconPath);
    return;
  }

  const version = String(context.packager.appInfo.version || '0.0.0');
  const copyright = String(context.packager.appInfo.copyright || 'Copyright © krwg');

  await rcedit(exePath, {
    icon: iconPath,
    'file-version': version,
    'product-version': version,
    'version-string': {
      CompanyName: 'krwg',
      FileDescription: 'BLIP — P2P LAN Messenger',
      ProductName: 'BLIP',
      LegalCopyright: copyright,
      OriginalFilename: exeName,
      InternalName: 'BLIP',
    },
  });
  console.log('[after-pack] embedded icon + version into', exeName);
}

module.exports = async function afterPack(context) {
  await embedWindowsIcon(context);
  await obfuscate(context);
};
