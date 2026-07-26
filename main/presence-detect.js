import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync } from 'node:fs';

const execFileAsync = promisify(execFile);

const GAME_HINTS = [
  'steam',
  'steamwebhelper',
  'cs2',
  'csgo',
  'dota2',
  'valorant',
  'leagueclient',
  'league of legends',
  'minecraft',
  'javaw',
  'epicgameslauncher',
  'fortniteclient',
  'r5apex',
  'overwatch',
  'gta5',
  'rdr2',
  'witcher3',
  'cyberpunk2077',
  'hl2',
  'tf2',
  'rocketleague',
  'genshinimpact',
  'osu!',
  'osu',
  'faceit',
  'battlenet',
  'origin',
  'eaDesktop',
  'upc',
  'riotclient',
];

let lastSnapshot = { title: '', app: '', pid: 0, at: 0 };
/** @type {{ key: string, since: number, kind: string, label: string, app: string, title: string } | null} */
let session = null;

export async function detectForegroundApp() {
  if (process.platform === 'win32') return detectWindowsForeground();
  if (process.platform === 'darwin') return detectMacForeground();
  if (process.platform === 'linux') return detectLinuxForeground();
  return null;
}

export function getLastPresenceSnapshot() {
  return lastSnapshot;
}

export function getActivitySession() {
  return session;
}

export function isLikelyGame(appName, title = '') {
  const app = String(appName || '').toLowerCase();
  const t = String(title || '').toLowerCase();
  if (!app) return false;
  if (app === 'blip' || app === 'electron' || app === 'powershell' || app === 'cmd') {
    return false;
  }
  return GAME_HINTS.some((g) => app.includes(g.toLowerCase()) || t.includes(g.toLowerCase()));
}

function prettyApp(name) {
  return String(name || '')
    .replace(/\.exe$/i, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim();
}

function formatDuration(ms) {
  const sec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Classify foreground activity with session timing (Discord/Steam-style).
 * preferGames: when true, games win over generic apps for status.
 * pinnedApp: optional process name to always treat as the focus app.
 */
export function classifyActivity(snap, opts = {}) {
  const preferGames = opts.preferGames !== false;
  const pinned = String(opts.pinnedApp || '')
    .trim()
    .toLowerCase();
  const excludeSelf = opts.excludeSelf !== false;

  if (!snap?.app) {
    session = null;
    return null;
  }

  const appRaw = String(snap.app);
  const app = appRaw.toLowerCase();
  if (excludeSelf && (app === 'blip' || app === 'electron')) {
    return session
      ? {
          ...session,
          elapsedMs: Date.now() - session.since,
          elapsedLabel: formatDuration(Date.now() - session.since),
          current: false,
        }
      : null;
  }

  const title = String(snap.title || '').trim();
  const game = isLikelyGame(appRaw, title);
  const pinnedHit = pinned && (app === pinned || app.includes(pinned));

  let kind = 'app';
  let label = prettyApp(appRaw);
  if (pinnedHit) {
    kind = game ? 'game' : 'app';
    label = prettyApp(appRaw);
  } else if (game && preferGames) {
    kind = 'game';
    label = title && title.length > 2 && !title.toLowerCase().includes(app)
      ? title.slice(0, 64)
      : prettyApp(appRaw);
  } else if (game) {
    kind = 'game';
    label = prettyApp(appRaw);
  } else if (title.length > 2) {
    label = `${prettyApp(appRaw)}`.slice(0, 48);
  }

  const key = `${kind}:${app}`;
  if (!session || session.key !== key) {
    session = {
      key,
      since: Date.now(),
      kind,
      label,
      app: appRaw,
      title,
    };
  } else {
    session.label = label;
    session.title = title;
    session.app = appRaw;
    session.kind = kind;
  }

  const elapsedMs = Date.now() - session.since;
  return {
    ...session,
    elapsedMs,
    elapsedLabel: formatDuration(elapsedMs),
    current: true,
    statusLine:
      kind === 'game'
        ? `Playing ${label}`.slice(0, 48)
        : `In ${prettyApp(appRaw)} · ${formatDuration(elapsedMs)}`.slice(0, 48),
  };
}

/** @deprecated prefer classifyActivity */
export function formatPresenceActivity(snap, opts = {}) {
  const c = classifyActivity(snap, opts);
  return c?.statusLine || '';
}

async function detectWindowsForeground() {
  const script = `
$ErrorActionPreference = 'Stop'
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class BlipFg {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
}
"@
$h = [BlipFg]::GetForegroundWindow()
if ($h -eq [IntPtr]::Zero) { '{}' ; exit 0 }
$sb = New-Object System.Text.StringBuilder 512
[void][BlipFg]::GetWindowText($h, $sb, $sb.Capacity)
$procId = 0
[void][BlipFg]::GetWindowThreadProcessId($h, [ref]$procId)
$name = ''
try { $name = (Get-Process -Id $procId -ErrorAction Stop).ProcessName } catch {}
@{ title = $sb.ToString(); app = $name; pid = $procId } | ConvertTo-Json -Compress
`.trim();

  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, timeout: 2500, maxBuffer: 64 * 1024 }
    );
    const raw = String(stdout || '').trim();
    if (!raw || raw === '{}') return null;
    const parsed = JSON.parse(raw);
    const snap = {
      title: String(parsed.title || '').slice(0, 120),
      app: String(parsed.app || '').slice(0, 64),
      pid: Number(parsed.pid) || 0,
      at: Date.now(),
    };
    lastSnapshot = snap;
    return snap;
  } catch {
    return null;
  }
}

async function detectMacForeground() {
  const script = `
tell application "System Events"
  set p to first application process whose frontmost is true
  set n to name of p
end tell
return n
`.trim();
  try {
    const { stdout } = await execFileAsync(
      'osascript',
      ['-e', script],
      { timeout: 2500, maxBuffer: 16 * 1024 }
    );
    const app = String(stdout || '').trim().slice(0, 64);
    if (!app) return null;
    const snap = { title: '', app, pid: 0, at: Date.now() };
    lastSnapshot = snap;
    return snap;
  } catch {
    return null;
  }
}

/**
 * Best-effort Linux foreground: prefer xdotool (X11), then gdbus (GNOME),
 * then /proc + wmctrl fallbacks. Wayland without helpers returns null.
 */
async function detectLinuxForeground() {
  const viaXdotool = await tryLinuxXdotool();
  if (viaXdotool) return viaXdotool;
  const viaGdbus = await tryLinuxGdbus();
  if (viaGdbus) return viaGdbus;
  return null;
}

async function tryLinuxXdotool() {
  try {
    const { stdout: widOut } = await execFileAsync(
      'xdotool',
      ['getactivewindow'],
      { timeout: 1500, maxBuffer: 8 * 1024 }
    );
    const wid = String(widOut || '').trim();
    if (!wid) return null;
    let title = '';
    let pid = 0;
    try {
      const { stdout: tOut } = await execFileAsync(
        'xdotool',
        ['getwindowname', wid],
        { timeout: 1500, maxBuffer: 16 * 1024 }
      );
      title = String(tOut || '').trim().slice(0, 120);
    } catch {

    }
    try {
      const { stdout: pOut } = await execFileAsync(
        'xdotool',
        ['getwindowpid', wid],
        { timeout: 1500, maxBuffer: 8 * 1024 }
      );
      pid = Number(String(pOut || '').trim()) || 0;
    } catch {

    }
    let app = '';
    if (pid > 0) {
      try {
        const raw = readFileSync(`/proc/${pid}/comm`, 'utf8');
        app = String(raw || '').trim().slice(0, 64);
      } catch {

      }
    }
    if (!app && !title) return null;
    const snap = { title, app: app || title.slice(0, 64), pid, at: Date.now() };
    lastSnapshot = snap;
    return snap;
  } catch {
    return null;
  }
}

async function tryLinuxGdbus() {
  try {
    const { stdout } = await execFileAsync(
      'gdbus',
      [
        'call',
        '--session',
        '--dest',
        'org.gnome.Shell',
        '--object-path',
        '/org/gnome/Shell',
        '--method',
        'org.gnome.Shell.Eval',
        'global.display.focus_window ? global.display.focus_window.get_wm_class() : ""',
      ],
      { timeout: 2000, maxBuffer: 16 * 1024 }
    );
    const raw = String(stdout || '');
    const m = raw.match(/\(true,\s*'([^']*)'\)/) || raw.match(/\(true,\s*"([^"]*)"\)/);
    const app = (m?.[1] || '').trim().slice(0, 64);
    if (!app) return null;
    const snap = { title: '', app, pid: 0, at: Date.now() };
    lastSnapshot = snap;
    return snap;
  } catch {
    return null;
  }
}
