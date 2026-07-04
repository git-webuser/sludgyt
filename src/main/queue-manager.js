const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { BrowserWindow } = require('electron');
const { readSettings } = require('./settings-store');
const { binaryExists, killProcessTree, isBareCommand } = require('./process-utils');
const { looksLikeRawManifest } = require('../shared/manifest-heuristic');
const { sniffManifest } = require('./manifest-sniffer');

const PROGRESS_RE = /\[download\]\s+([\d.]+)%/;
const FINAL_PATH_RE = /^FINALPATH::(.+)$/;
const STDERR_TAIL_LINES = 20;

/** @type {import('../shared/types').QueueItem[]} */
const items = [];
let runningId = null;
let runningChild = null;
let runningSniffAbort = null;
const cancelledIds = new Set();

function broadcast(channel, payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload);
  }
}

function broadcastUpdate(item) {
  broadcast('queue:update', item);
}

function findItem(id) {
  return items.find((i) => i.id === id);
}

function addItem({ url, filename, saveDir }) {
  if (!url || !filename || !saveDir) {
    return { ok: false, error: 'Ссылка, имя файла и папка обязательны.' };
  }

  const settings = readSettings();
  if (!binaryExists(settings.ytDlpPath)) {
    return { ok: false, error: `yt-dlp не найден по пути "${settings.ytDlpPath}". Проверьте настройки.` };
  }
  if (!binaryExists(settings.ffmpegPath)) {
    return { ok: false, error: `ffmpeg не найден по пути "${settings.ffmpegPath}". Проверьте настройки.` };
  }

  const item = {
    id: crypto.randomUUID(),
    url,
    filename,
    saveDir,
    status: 'queued',
    percent: 0,
    error: undefined,
    finalPath: null,
    looksLikeRawManifest: looksLikeRawManifest(url),
    createdAt: Date.now(),
  };
  items.push(item);
  broadcastUpdate(item);
  maybeStartNext();
  return { ok: true, id: item.id };
}

function maybeStartNext() {
  if (runningId) return;
  const next = items.find((i) => i.status === 'queued');
  if (!next) return;
  runItem(next);
}

/**
 * Spawns yt-dlp for a single URL and resolves once it's done.
 * Never rejects — failures come back as { ok: false, error }.
 */
function spawnYtDlp(item, url, opts = {}) {
  return new Promise((resolve) => {
    const settings = readSettings();
    const outputTemplate = path.join(item.saveDir, `${item.filename}.%(ext)s`);
    const args = [
      '--newline',
      '--no-playlist',
      '--merge-output-format', 'mp4',
      '-o', outputTemplate,
      '--print', 'after_move:FINALPATH::%(filepath)s',
    ];

    // yt-dlp's --ffmpeg-location does not resolve bare command names via PATH the way
    // spawn() does — passing a bare "ffmpeg" makes it warn and skip ffmpeg entirely.
    // Only pass it when an actual filesystem path was configured; otherwise let yt-dlp
    // do its own PATH lookup, same as running it manually with no flag at all.
    if (!isBareCommand(settings.ffmpegPath)) {
      args.push('--ffmpeg-location', settings.ffmpegPath);
    }

    if (opts.referer) args.push('--referer', opts.referer);
    if (opts.userAgent) args.push('--user-agent', opts.userAgent);
    if (opts.cookie) args.push('--add-header', `Cookie:${opts.cookie}`);

    args.push(url);

    let child;
    try {
      child = spawn(settings.ytDlpPath, args, {
        windowsHide: true,
        detached: process.platform !== 'win32',
      });
    } catch (err) {
      resolve({ ok: false, error: `Не удалось запустить yt-dlp: ${err.message}` });
      return;
    }

    runningId = item.id;
    runningChild = child;
    item.status = 'downloading';
    item.percent = 0;
    broadcastUpdate(item);

    let stderrTail = [];
    let stdoutBuf = '';

    child.stdout.on('data', (chunk) => {
      stdoutBuf += chunk.toString();
      const lines = stdoutBuf.split('\n');
      stdoutBuf = lines.pop();
      for (const line of lines) {
        const progressMatch = PROGRESS_RE.exec(line);
        if (progressMatch) {
          item.percent = parseFloat(progressMatch[1]);
          broadcast('queue:progress', { id: item.id, percent: item.percent, raw: line.trim() });
          continue;
        }
        const pathMatch = FINAL_PATH_RE.exec(line.trim());
        if (pathMatch) {
          item.finalPath = pathMatch[1].trim();
        }
      }
    });

    child.stderr.on('data', (chunk) => {
      const lines = chunk.toString().split('\n').filter(Boolean);
      stderrTail.push(...lines);
      if (stderrTail.length > STDERR_TAIL_LINES) {
        stderrTail = stderrTail.slice(-STDERR_TAIL_LINES);
      }
    });

    child.on('error', (err) => {
      runningId = null;
      runningChild = null;
      resolve({ ok: false, error: `Не удалось запустить yt-dlp: ${err.message}` });
    });

    child.on('exit', (code) => {
      const wasCancelled = cancelledIds.has(item.id);
      cancelledIds.delete(item.id);
      runningId = null;
      runningChild = null;

      if (wasCancelled) {
        resolve({ ok: false, cancelled: true });
        return;
      }
      if (code === 0) {
        resolve({ ok: true });
        return;
      }
      const errorLines = stderrTail.filter((l) => l.startsWith('ERROR:'));
      const error = errorLines.length
        ? errorLines.join('\n')
        : stderrTail.length
          ? stderrTail.slice(-5).join('\n')
          : `yt-dlp завершился с кодом ${code}`;
      resolve({ ok: false, error });
    });
  });
}

function sniffManifestForItem(item) {
  runningId = item.id;
  const { promise, abort } = sniffManifest(item.url);
  runningSniffAbort = abort;
  return promise.then((result) => {
    runningSniffAbort = null;
    if (cancelledIds.has(item.id)) {
      cancelledIds.delete(item.id);
      return { ok: false, cancelled: true };
    }
    return result;
  });
}

async function runItem(item) {
  const settings = readSettings();

  if (!binaryExists(settings.ytDlpPath) || !binaryExists(settings.ffmpegPath)) {
    item.status = 'failed';
    item.error = 'Пути к yt-dlp/ffmpeg стали недействительны. Проверьте настройки.';
    broadcastUpdate(item);
    maybeStartNext();
    return;
  }

  const firstAttempt = await spawnYtDlp(item, item.url);

  if (firstAttempt.cancelled) {
    item.status = 'cancelled';
    broadcastUpdate(item);
    maybeStartNext();
    return;
  }
  if (firstAttempt.ok) {
    item.status = 'done';
    item.percent = 100;
    broadcastUpdate(item);
    maybeStartNext();
    return;
  }

  // Direct attempt failed. If this wasn't already a raw manifest link, fall back to
  // sniffing the real manifest URL out of the page via a hidden browser — the same
  // thing the user would otherwise do by hand via devtools' Network tab.
  if (item.looksLikeRawManifest) {
    item.status = 'failed';
    item.error = firstAttempt.error;
    broadcastUpdate(item);
    maybeStartNext();
    return;
  }

  item.status = 'sniffing';
  broadcastUpdate(item);

  const sniffResult = await sniffManifestForItem(item);

  if (sniffResult.cancelled) {
    item.status = 'cancelled';
    broadcastUpdate(item);
    maybeStartNext();
    return;
  }
  if (!sniffResult.ok) {
    item.status = 'failed';
    item.error = `yt-dlp: ${firstAttempt.error}\n\nАвтопоиск манифеста: ${sniffResult.error}`;
    broadcastUpdate(item);
    maybeStartNext();
    return;
  }

  item.looksLikeRawManifest = true;
  const secondAttempt = await spawnYtDlp(item, sniffResult.manifestUrl, {
    referer: sniffResult.referer,
    userAgent: sniffResult.userAgent,
    cookie: sniffResult.cookie,
  });

  if (secondAttempt.cancelled) {
    item.status = 'cancelled';
  } else if (secondAttempt.ok) {
    item.status = 'done';
    item.percent = 100;
  } else {
    item.status = 'failed';
    item.error = `Манифест найден автоматически, но скачивание всё равно не удалось: ${secondAttempt.error}`;
  }
  broadcastUpdate(item);
  maybeStartNext();
}

function cancelItem(id) {
  const item = findItem(id);
  if (!item) return { ok: false };

  if (item.status === 'queued') {
    item.status = 'cancelled';
    broadcastUpdate(item);
    return { ok: true };
  }

  if ((item.status === 'downloading' || item.status === 'sniffing') && runningId === id) {
    cancelledIds.add(id);
    if (runningChild) killProcessTree(runningChild.pid);
    if (runningSniffAbort) runningSniffAbort();
    return { ok: true };
  }

  return { ok: false };
}

function removeItem(id) {
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return { ok: false };
  if (items[idx].status === 'downloading' || items[idx].status === 'sniffing') return { ok: false };
  items.splice(idx, 1);
  broadcast('queue:removed', { id });
  return { ok: true };
}

function getAll() {
  return items;
}

module.exports = { addItem, cancelItem, removeItem, getAll };
