const { execFile } = require('child_process');

const SLUDGYT_RELEASES_API = 'https://api.github.com/repos/git-webuser/sludgyt/releases/latest';
const SLUDGYT_RELEASES_URL = 'https://github.com/git-webuser/sludgyt/releases/latest';

function normalizeVersion(value) {
  const text = String(value || '').trim();
  const match = /\d+(?:[.-]\d+)*/.exec(text);
  return match ? match[0] : text.replace(/^v/i, '');
}

function compareVersions(a, b) {
  const left = normalizeVersion(a).split(/[.-]/).map((part) => Number.parseInt(part, 10));
  const right = normalizeVersion(b).split(/[.-]/).map((part) => Number.parseInt(part, 10));
  const max = Math.max(left.length, right.length);

  for (let i = 0; i < max; i += 1) {
    const l = Number.isNaN(left[i]) ? 0 : (left[i] || 0);
    const r = Number.isNaN(right[i]) ? 0 : (right[i] || 0);
    if (l > r) return 1;
    if (l < r) return -1;
  }

  return 0;
}

function pickReleaseAsset(assets = [], platform = process.platform) {
  const candidates = assets
    .filter((asset) => asset && asset.browser_download_url && asset.name)
    .map((asset) => ({
      name: asset.name,
      url: asset.browser_download_url,
      lowerName: asset.name.toLowerCase(),
    }));

  const findByExt = (extensions) => candidates.find((asset) => (
    extensions.some((extension) => asset.lowerName.endsWith(extension))
  ));

  if (platform === 'darwin') {
    return findByExt(['.dmg', '.zip']);
  }

  if (platform === 'win32') {
    return findByExt(['.exe', '.msi', '.zip']);
  }

  if (platform === 'linux') {
    return findByExt(['.appimage', '.deb', '.rpm', '.tar.gz']);
  }

  return null;
}

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

async function checkAppUpdate(currentVersion) {
  try {
    const res = await fetch(SLUDGYT_RELEASES_API, {
      headers: { 'User-Agent': 'sludgyt-app' },
    });

    if (!res.ok) {
      return {
        ok: false,
        current: currentVersion,
        error: `GitHub вернул ${res.status}.`,
      };
    }

    const data = await res.json();
    const latest = data.tag_name || data.name || null;
    if (!latest) {
      return {
        ok: false,
        current: currentVersion,
        error: 'В последнем релизе не найдена версия.',
      };
    }

    const asset = pickReleaseAsset(data.assets);

    return {
      ok: true,
      current: currentVersion,
      latest,
      updateAvailable: compareVersions(currentVersion, latest) < 0,
      releaseUrl: data.html_url || SLUDGYT_RELEASES_URL,
      downloadUrl: asset ? asset.url : null,
      downloadName: asset ? asset.name : null,
    };
  } catch {
    return {
      ok: false,
      current: currentVersion,
      error: 'Не удалось подключиться к GitHub.',
    };
  }
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

module.exports = { checkYtDlp, checkFfmpeg, checkAppUpdate, autoDetectBinary };
