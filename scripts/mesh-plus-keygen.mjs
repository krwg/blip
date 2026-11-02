#!/usr/bin/env node
/**
 * Generate / rotate MESH+ + build-signing Ed25519 trust anchor.
 * Writes gitignored files under keys/ (and optional legacy scripts path).
 *
 *   node scripts/mesh-plus-keygen.mjs --rotate
 *   node scripts/mesh-plus-keygen.mjs --license   # mint one license with current private key
 */
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  sign,
} from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  formatEntitlementDisplay,
  ENTITLEMENT_CANON,
} from '../main/entitlement-codec.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const KEYS_DIR = join(root, 'keys');
const PRIV_PATH = join(KEYS_DIR, 'mesh-plus-private.b64');
const PUB_PATH = join(KEYS_DIR, 'mesh-plus-public.b64');
const LEGACY_PRIV = join(__dirname, '.mesh-plus-private.b64');
const LOCAL_PUB = join(root, 'mesh-plus-public-key.local');
const ENV_BUILD = join(root, '.env.build');
const BUILD_PUB = join(root, 'build', 'mesh-plus-public-key.txt');

function publicKeyB64FromPrivate(privateKey) {
  const pub = createPublicKey(privateKey);
  return pub.export({ type: 'spki', format: 'der' }).toString('base64');
}

function writeKeyBundle(privB64, pubB64) {
  mkdirSync(KEYS_DIR, { recursive: true });
  mkdirSync(join(root, 'build'), { recursive: true });
  writeFileSync(PRIV_PATH, `${privB64}\n`, 'utf8');
  writeFileSync(PUB_PATH, `${pubB64}\n`, 'utf8');
  writeFileSync(LEGACY_PRIV, `${privB64}\n`, 'utf8');
  writeFileSync(LOCAL_PUB, `${pubB64}\n`, 'utf8');
  writeFileSync(BUILD_PUB, `${pubB64}\n`, 'utf8');

  let env = '';
  if (existsSync(ENV_BUILD)) {
    env = readFileSync(ENV_BUILD, 'utf8');
    if (/^BLIP_MESH_PUBLIC_KEY\s*=/m.test(env)) {
      env = env.replace(/^BLIP_MESH_PUBLIC_KEY\s*=.*$/m, `BLIP_MESH_PUBLIC_KEY=${pubB64}`);
    } else {
      env = `${env.trimEnd()}\nBLIP_MESH_PUBLIC_KEY=${pubB64}\n`;
    }
  } else {
    env = `BLIP_MESH_PUBLIC_KEY=${pubB64}\n`;
  }
  writeFileSync(ENV_BUILD, env, 'utf8');
}

function loadPrivateKey() {
  const path = existsSync(PRIV_PATH) ? PRIV_PATH : LEGACY_PRIV;
  if (!existsSync(path)) return null;
  const b64 = readFileSync(path, 'utf8').trim();
  return createPrivateKey({
    key: Buffer.from(b64, 'base64'),
    format: 'der',
    type: 'pkcs8',
  });
}

function rotateKeys() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const privB64 = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
  const pubB64 = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  writeKeyBundle(privB64, pubB64);
  console.log('[mesh-plus-keygen] rotated trust anchor → keys/ (gitignored)');
  console.log('--- public (BLIP_MESH_PUBLIC_KEY) ---');
  console.log(pubB64);
  console.log('--- private path ---');
  console.log(PRIV_PATH);
  return { privateKey, pubB64 };
}

function mintLicense(privateKey) {
  const licenseId8 = randomBytes(8);
  const licenseId = licenseId8.toString('hex').toUpperCase();
  const canonical = `${ENTITLEMENT_CANON}|${licenseId}`;
  const sig = sign(null, Buffer.from(canonical, 'utf8'), privateKey);
  const displayKey = formatEntitlementDisplay(licenseId, sig.toString('base64'));
  return { licenseId, displayKey };
}

function printLicense(row) {
  console.log('--- MESH+ license (one user) ---');
  console.log(row.displayKey);
  console.log(`licenseId: ${row.licenseId}`);
}

const rotate = process.argv.includes('--rotate') || process.argv.includes('--force');
const licenseOnly = process.argv.includes('--license');
const countIdx = process.argv.indexOf('--count');
const count = countIdx >= 0 ? Math.max(1, Number(process.argv[countIdx + 1]) || 1) : 1;
const outIdx = process.argv.indexOf('--out');
const outPath = outIdx >= 0 ? process.argv[outIdx + 1] : null;

function ensurePrivateKey() {
  if (rotate || !loadPrivateKey()) {
    return rotateKeys().privateKey;
  }
  const pk = loadPrivateKey();
  const pubB64 = publicKeyB64FromPrivate(pk);
  writeKeyBundle(
    readFileSync(existsSync(PRIV_PATH) ? PRIV_PATH : LEGACY_PRIV, 'utf8').trim(),
    pubB64,
  );
  return pk;
}

const pk = ensurePrivateKey();
console.log('--- Trust anchor public ---');
console.log(publicKeyB64FromPrivate(pk));

const rows = [];
for (let i = 0; i < count; i++) {
  const row = mintLicense(pk);
  rows.push(row);
  if (!outPath) printLicense(row);
}

if (outPath) {
  mkdirSync(dirname(outPath), { recursive: true });
  const lines = [
    '# MESH+ licenses',
    `# Generated ${new Date().toISOString()}`,
    `# Count: ${rows.length}`,
    '',
  ];
  rows.forEach((row, i) => {
    lines.push(`## ${i + 1}. \`${row.licenseId}\``);
    lines.push('');
    lines.push('```');
    lines.push(row.displayKey);
    lines.push('```');
    lines.push('');
  });
  writeFileSync(outPath, `${lines.join('\n')}\n`, 'utf8');
  console.log(`[mesh-plus-keygen] wrote ${rows.length} license(s) → ${outPath}`);
}
