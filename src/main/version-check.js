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

async function checkYtDlp(ytDlpPath) {
  const result = await runVersionCommand(ytDlpPath, ['--version']);
  if (!result.ok) return result;

  const version = result.raw.split('\n')[0].trim();
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

module.exports = { checkYtDlp, checkFfmpeg };
