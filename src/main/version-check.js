const { execFile } = require('child_process');

function runVersionCommand(binaryPath, args) {
  return new Promise((resolve) => {
    if (!binaryPath) {
      resolve({ ok: false, error: 'Путь не указан.' });
      return;
    }
    execFile(binaryPath, args, { timeout: 8000 }, (err, stdout, stderr) => {
      if (err) {
        const reason = err.code === 'ENOENT'
          ? `Файл не найден: ${binaryPath}`
          : (stderr || err.message).trim();
        resolve({ ok: false, error: reason });
        return;
      }
      resolve({ ok: true, raw: stdout.trim() });
    });
  });
}

async function checkYtDlp(ytDlpPath, opts = {}) {
  const result = await runVersionCommand(ytDlpPath, ['--version']);
  if (!result.ok) return result;

  const version = result.raw.split('\n')[0].trim();
  if (opts.skipUpdateCheck) {
    return { ok: true, version, latest: null, updateAvailable: null };
  }

  let latest = null;
  let updateAvailable = null;
  try {
    const res = await fetch('https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest', {
      headers: { 'User-Agent': 'sludgyt-app' },
    });
    if (res.ok) {
      const data = await res.json();
      latest = data.tag_name;
      updateAvailable = Boolean(latest) && latest !== version;
    }
  } catch {
    // No network / GitHub unreachable — version check still succeeded, just skip the comparison.
  }

  return { ok: true, version, latest, updateAvailable };
}

async function checkFfmpeg(ffmpegPath) {
  const result = await runVersionCommand(ffmpegPath, ['-version']);
  if (!result.ok) return result;

  const firstLine = result.raw.split('\n')[0].trim();
  const match = /ffmpeg version (\S+)/.exec(firstLine);
  return { ok: true, version: match ? match[1] : firstLine };
}

/**
 * A bare command "exists" for our purposes if attempting to run it doesn't fail
 * with ENOENT — any other failure (bad flag, non-zero exit, etc.) still means the
 * binary itself was found and executed.
 */
function probeBinaryRuns(name) {
  return new Promise((resolve) => {
    execFile(name, ['--version'], { timeout: 5000 }, (err) => {
      resolve(!(err && err.code === 'ENOENT'));
    });
  });
}

/**
 * Tries to locate a binary the same way the user would: first checking whether
 * the bare command name already resolves (matching how we actually spawn it),
 * then falling back to a shell-level lookup that also resolves aliases/shell
 * functions — which `where` on Windows does not do, but PowerShell's
 * Get-Command does (this is what actually worked for the user manually).
 */
function autoDetectBinary(name) {
  return new Promise((resolve) => {
    probeBinaryRuns(name).then((exists) => {
      if (exists) {
        resolve({ found: true, path: name });
        return;
      }

      if (process.platform === 'win32') {
        execFile(
          'powershell.exe',
          ['-NoProfile', '-Command', `(Get-Command ${name} -ErrorAction SilentlyContinue).Source`],
          { timeout: 5000 },
          (err, stdout) => {
            const found = (stdout || '').trim();
            resolve(found ? { found: true, path: found } : { found: false, path: null });
          }
        );
      } else {
        execFile('which', [name], { timeout: 5000 }, (err, stdout) => {
          const found = (stdout || '').trim();
          resolve(found ? { found: true, path: found } : { found: false, path: null });
        });
      }
    });
  });
}

module.exports = { checkYtDlp, checkFfmpeg, autoDetectBinary };
