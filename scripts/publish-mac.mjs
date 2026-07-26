/**
 * Publish macOS artifacts with sequential DMG builds so x64 and arm64
 * do not race on the same /Volumes mount name (hdiutil detach flakes in CI).
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;

function run(args) {
  const r = spawnSync('npx', ['electron-builder', ...args], {
    stdio: 'inherit',
    shell: true,
    cwd: root,
    env: {
      ...process.env,
      USE_HARD_LINKS: process.env.USE_HARD_LINKS || 'false',
    },
  });
  if (r.status) process.exit(r.status ?? 1);
}

const publish = process.argv.includes('--publish') ? ['--publish', 'always'] : [];

run(['--mac', 'zip', '--x64', '--arm64', ...publish]);
run([
  '--mac',
  'dmg',
  '--arm64',
  `--config.dmg.title=BLIP-${version}-arm64`,
  ...publish,
]);
run([
  '--mac',
  'dmg',
  '--x64',
  `--config.dmg.title=BLIP-${version}-x64`,
  ...publish,
]);
