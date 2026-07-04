const fs = require('fs');
const { exec } = require('child_process');

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

module.exports = { isBareCommand, binaryExists, killProcessTree };
