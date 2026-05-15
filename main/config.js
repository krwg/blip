import { app } from 'electron';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import os from 'os';

const DEFAULT_CONFIG = {
  blipId: null,
  displayName: 'Anonymous',
  language: 'en',
};

let configPath = null;

export function initConfigPath() {
  const dir = join(app.getPath('userData'));
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  configPath = join(dir, 'blip-config.json');
}

export function loadConfig() {
  if (!configPath) initConfigPath();
  try {
    if (existsSync(configPath)) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(configPath, 'utf8')) };
    }
  } catch {
    /* use defaults */
  }
  return { ...DEFAULT_CONFIG };
}

export function saveConfig(config) {
  if (!configPath) initConfigPath();
  const merged = { ...loadConfig(), ...config };
  writeFileSync(configPath, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

export function getLocalIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
}
