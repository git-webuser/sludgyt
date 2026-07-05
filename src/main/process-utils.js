const fs = require('fs');
const os = require('os');
const path = require('path');
const { exec } = require('child_process');

// GUI apps launched from Finder/Dock (as opposed to a terminal) inherit launchd's
// bare-minimum PATH, not the one a user's shell profile builds up — so Homebrew
// installs (/opt/homebrew on Apple Silicon, /usr/local on Intel) are invisible to
// bare command names like "yt-dlp" even though they resolve fine in a terminal.
const COMMON_UNIX_BIN_DIRS = [
  '/opt/homebrew/bin',
  '/opt/homebrew/sbin',
  '/usr/local/bin',
  '/usr/local/sbin',
  '/opt/local/bin',
  path.join(os.homedir(), '.local/bin'),
];

function ensureCommonBinDirsOnPath() {
  if (process.platform === 'win32') return;

  const current = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  const missing = COMMON_UNIX_BIN_DIRS.filter((dir) => !current.includes(dir));
  if (missing.length > 0) {
    process.env.PATH = [...current, ...missing].join(path.delimiter);
  }
}

function isBareCommand(p) {
  return !p.includes('/') && !p.includes('\\');
}

function binaryExists(configuredPath) {
  if (!configuredPath) return false;
  if (isBareCommand(configuredPath)) return true; // resolved via PATH at spawn time
  return fs.existsSync(configuredPath);
}

function killProcessTree(pid) {
  if (process.platform === 'win32') {
    exec(`taskkill /pid ${pid} /T /F`);
    return;
  }
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // process already gone
    }
  }
}

module.exports = { isBareCommand, binaryExists, killProcessTree, ensureCommonBinDirsOnPath };
