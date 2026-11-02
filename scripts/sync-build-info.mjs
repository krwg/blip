
import { createHash, createPrivateKey, sign } from 'crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const privCandidates = [
  join(root, 'keys', 'mesh-plus-private.b64'),
  join(root, 'scripts', '.mesh-plus-private.b64'),
];
const metaPath = join(root, 'app-metadata.json');
const outPath = join(root, 'build', 'build-info.json');
const pubCandidates = [
  join(root, 'keys', 'mesh-plus-public.b64'),
  join(root, 'build', 'mesh-plus-public-key.txt'),
  join(root, 'mesh-plus-public-key.local'),
];

const ISSUER = 'krwg-official';

function readPriv() {
  const fromEnv = (process.env.BLIP_BUILD_SIGN_KEY_B64 || '').trim();
  if (fromEnv) {
    return createPrivateKey({
      key: Buffer.from(fromEnv, 'base64'),
      format: 'der',
      type: 'pkcs8',
    });
  }
  for (const privPath of privCandidates) {
    if (!existsSync(privPath)) continue;
    const b64 = readFileSync(privPath, 'utf8').trim();
    if (!b64) continue;
    return createPrivateKey({
      key: Buffer.from(b64, 'base64'),
      format: 'der',
      type: 'pkcs8',
    });
  }
  return null;
}

function readVersion() {
  try {
    const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
    return String(meta.version || '0.0.0');
  } catch {
    return '0.0.0';
  }
}

function readPubHash() {
  const fromEnv = (process.env.BLIP_MESH_PUBLIC_KEY || '').trim();
  let pub = fromEnv;
  if (!pub) {
    for (const p of pubCandidates) {
      if (!existsSync(p)) continue;
      pub = readFileSync(p, 'utf8').trim();
      if (pub) break;
    }
  }
  if (!pub) return '';
  return createHash('sha256').update(pub, 'utf8').digest('hex').slice(0, 16);
}

const pk = readPriv();
mkdirSync(join(root, 'build'), { recursive: true });

if (!pk) {
  writeFileSync(outPath, '{}\n', 'utf8');
  console.log('[sync-build-info] no signing key — wrote empty build/build-info.json');
  process.exit(0);
}

const version = readVersion();
const buildTimestamp = Date.now();
const canonical = `BLIP|${version}|${ISSUER}|${buildTimestamp}`;
const buildSignature = sign(null, Buffer.from(canonical, 'utf8'), pk).toString('base64');

const payload = {
  issuer: ISSUER,
  version,
  buildTimestamp,
  buildSignature,
  meshPlusPublicKeyHash: readPubHash(),
};

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log('[sync-build-info] wrote build/build-info.json');
