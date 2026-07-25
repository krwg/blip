
const { readFileSync, writeFileSync, existsSync } = require('fs');
const { join } = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const TARGETS = [
  'main/entitlement-codec.js',
  'main/mesh-plus-license.js',
  'main/mesh-plus-public-key.js',
  'main/mesh-plus-public-key-loader.js',
  'shared/mesh-plus-gates.js',
];

const OBF_OPTS = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.4,
  deadCodeInjection: false,
  stringArray: true,
  stringArrayThreshold: 0.75,
  rotateStringArray: true,
  selfDefending: false,
  target: 'node',
};

/**
 * Post-pack only (electron-builder afterPack). Never runs in electron:dev.
 * Skip: BLIP_SKIP_OBFUSCATE=1
 * Local measure (repo root, no pack): ~0.4s for the five MESH+ targets.
 */
module.exports = async function afterPack(context) {
  if (process.env.BLIP_SKIP_OBFUSCATE === '1' || process.env.BLIP_SKIP_OBFUSCATE === 'true') {
    console.log('[obfuscate-after-pack] skipped (BLIP_SKIP_OBFUSCATE)');
    return;
  }

  const appDir = join(context.appOutDir, 'resources', 'app');
  if (!existsSync(appDir)) {
    console.warn('[obfuscate-after-pack] skip — no resources/app at', appDir);
    return;
  }

  const t0 = Date.now();
  let files = 0;
  for (const rel of TARGETS) {
    const filePath = join(appDir, rel);
    if (!existsSync(filePath)) {
      console.warn('[obfuscate-after-pack] missing', rel);
      continue;
    }
    const code = readFileSync(filePath, 'utf8');
    const started = Date.now();
    const out = JavaScriptObfuscator.obfuscate(code, OBF_OPTS).getObfuscatedCode();
    writeFileSync(filePath, out, 'utf8');
    files += 1;
    console.log(
      '[obfuscate-after-pack] ok',
      rel,
      `${code.length}→${out.length}B`,
      `${Date.now() - started}ms`,
    );
  }
  console.log(`[obfuscate-after-pack] done ${files} file(s) in ${Date.now() - t0}ms`);
};
