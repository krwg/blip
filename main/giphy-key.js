import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { app } from 'electron';

let cached = '';

/**
 * Giphy API key: env, then userData/giphy-api-key.txt, then ./giphy-api-key.local (gitignored).
 */
export function getGiphyApiKey() {
  if (cached) return cached;
  const fromEnv = (
    process.env.BLIP_GIPHY_API_KEY ||
    process.env.GIPHY_API_KEY ||
    ''
  ).trim();
  if (fromEnv) {
    cached = fromEnv;
    return cached;
  }
  const paths = [
    join(app.getPath('userData'), 'giphy-api-key.txt'),
    join(process.cwd(), 'giphy-api-key.local'),
  ];
  for (const p of paths) {
    try {
      if (existsSync(p)) {
        const k = readFileSync(p, 'utf8').trim();
        if (k) {
          cached = k;
          return cached;
        }
      }
    } catch {
      /* ignore */
    }
  }
  return '';
}

export function resetGiphyApiKeyCache() {
  cached = '';
}
