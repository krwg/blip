import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

let lastSnapshot = { title: '', app: '', pid: 0, at: 0 };

/**
 * Opt-in foreground app probe (Windows first).
 * Returns { title, app, pid } or null when unavailable.
 */
export async function detectForegroundApp() {
  if (process.platform === 'win32') {
    return detectWindowsForeground();
  }
  if (process.platform === 'darwin') {
    return detectMacForeground();
  }
  return null;
}

export function getLastPresenceSnapshot() {
  return lastSnapshot;
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

/** Map process names to a short activity label for mesh status. */
export function formatPresenceActivity(snap, { excludeSelf = true } = {}) {
  if (!snap?.app) return '';
  const app = snap.app.toLowerCase();
  if (excludeSelf && (app === 'blip' || app === 'electron')) return '';
  const games = [
    'steam',
    'cs2',
    'dota2',
    'valorant',
    'league of legends',
    'minecraft',
    'epicgameslauncher',
    'r5apex',
    'overwatch',
  ];
  const pretty = snap.app.replace(/\.exe$/i, '');
  if (games.some((g) => app.includes(g))) {
    return `Playing ${pretty}`;
  }
  if (snap.title && snap.title.length > 2) {
    return `${pretty}: ${snap.title}`.slice(0, 80);
  }
  return pretty.slice(0, 64);
}
