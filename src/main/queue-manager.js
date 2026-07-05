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
const INACTIVITY_LIMIT_MS = 3 * 60 * 1000;
const INACTIVITY_CHECK_INTERVAL_MS = 15000;
const CANCEL_GRACE_MS = 5000;

const FORMAT_SELECTORS = {
  1080: 'bestvideo[height<=1080]+bestaudio/best[height<=1080]',
  720: 'bestvideo[height<=720]+bestaudio/best[height<=720]',
  480: 'bestvideo[height<=480]+bestaudio/best[height<=480]',
};

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
  // If the item was already removed from the queue, don't let a late/straggling
  // event (e.g. a child process that finally exits after being force-released)
  // resurrect it in the renderer's list.
  if (!items.includes(item)) return;
  broadcast('queue:update', item);
}

function findItem(id) {
  return items.find((i) => i.id === id);
}

function generateFilename(url) {
  let host = 'video';
  try {
    host = new URL(url).hostname.replace(/^www\./, '') || 'video';
  } catch {
    // Not a parseable absolute URL — fall back to the generic label above.
  }
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${host}-${stamp}`;
}

function addItem({ url, filename, saveDir, quality }) {
  if (!url || !saveDir) {
    return { ok: false, error: 'Ссылка и папка обязательны.' };
  }

  const settings = readSettings();
  if (!binaryExists(settings.ytDlpPath)) {
    return { ok: false, error: `yt-dlp не найден по пути "${settings.ytDlpPath}". Проверьте настройки.` };
  }
  if (!binaryExists(settings.ffmpegPath)) {
    return { ok: false, error: `ffmpeg не найден по пути "${settings.ffmpegPath}". Проверьте настройки.` };
  }

  const resolvedFilename = (filename && filename.trim()) || generateFilename(url);

  const item = {
    id: crypto.randomUUID(),
    url,
    filename: resolvedFilename,
    saveDir,
    quality: quality || 'best',
    status: 'queued',
    percent: 0,
    error: undefined,
    finalPath: null,
    looksLikeRawManifest: looksLikeRawManifest(url),
    createdAt: Date.now(),
  };
  items.unshift(item);
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

/** Immediately frees the currently-running slot and advances the queue, regardless
 * of whether the underlying OS process has actually confirmed it exited yet — used
 * as a safety net so a hung/zombie process can never permanently block the queue. */
function forceReleaseRunningSlot(id) {
  if (runningId !== id) return;
  runningId = null;
  runningChild = null;
  runningSniffAbort = null;
  maybeStartNext();
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

    const formatSelector = FORMAT_SELECTORS[item.quality];
    if (formatSelector) args.push('-f', formatSelector);

    if (opts.referer) args.push('--referer', opts.referer);
    if (opts.userAgent) args.push('--user-agent', opts.userAgent);
    if (opts.cookie) args.push('--add-header', `Cookie:${opts.cookie}`);
    if (settings.cookiesFromBrowser) {
      args.push('--cookies-from-browser', settings.cookiesFromBrowser);
    }

    args.push(url);

    let child;
    try {
      child = spawn(settings.ytDlpPath, args, {
        windowsHide: true,
        detached: process.platform !== 'win32',
        // yt-dlp is a Python program; when stdout isn't a real terminal, Python
        // block-buffers it instead of flushing per line, so progress updates can
        // arrive in one giant burst right at the end (looks like "stuck at 0%,
        // then jumps to 100%"). This forces line-by-line flushing.
        env: { ...process.env, PYTHONUNBUFFERED: '1' },
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
    let settled = false;
    let lastActivityAt = Date.now();

    const watchdog = setInterval(() => {
      if (Date.now() - lastActivityAt > INACTIVITY_LIMIT_MS) {
        clearInterval(watchdog);
        cancelledIds.delete(item.id);
        killProcessTree(child.pid);
        forceReleaseRunningSlot(item.id);
        if (!settled) {
          settled = true;
          resolve({ ok: false, error: 'Загрузка зависла: нет данных от yt-dlp более 3 минут. Прервано автоматически.' });
        }
      }
    }, INACTIVITY_CHECK_INTERVAL_MS);

    child.stdout.on('data', (chunk) => {
      lastActivityAt = Date.now();
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
      lastActivityAt = Date.now();
      const lines = chunk.toString().split('\n').filter(Boolean);
      stderrTail.push(...lines);
      if (stderrTail.length > STDERR_TAIL_LINES) {
        stderrTail = stderrTail.slice(-STDERR_TAIL_LINES);
      }
    });

    child.on('error', (err) => {
      clearInterval(watchdog);
      runningId = null;
      runningChild = null;
      if (settled) return;
      settled = true;
      resolve({ ok: false, error: `Не удалось запустить yt-dlp: ${err.message}` });
    });

    child.on('exit', (code) => {
      clearInterval(watchdog);
      const wasCancelled = cancelledIds.has(item.id);
      cancelledIds.delete(item.id);
      runningId = null;
      runningChild = null;

      if (settled) return;
      settled = true;

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
    if (runningId === item.id) runningId = null;
    if (runningSniffAbort === abort) runningSniffAbort = null;
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

    // Safety net: don't trust the OS process to actually die and emit 'exit' — if it
    // hasn't within a short grace period (hung/zombie process), free the slot anyway
    // so the queue can never get permanently stuck on a single bad item.
    setTimeout(() => {
      if (runningId !== id) return;
      cancelledIds.delete(id);
      item.status = 'cancelled';
      item.error = 'Процесс не ответил на отмену вовремя — принудительно освобождено.';
      broadcastUpdate(item);
      forceReleaseRunningSlot(id);
    }, CANCEL_GRACE_MS);

    return { ok: true };
  }

  return { ok: false };
}

function removeItem(id) {
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return { ok: false };

  const item = items[idx];
  const wasActive = item.status === 'downloading' || item.status === 'sniffing';

  if (wasActive) {
    cancelledIds.add(id);
    if (runningId === id) {
      if (runningChild) killProcessTree(runningChild.pid);
      if (runningSniffAbort) runningSniffAbort();
    }
  }

  items.splice(idx, 1);
  broadcast('queue:removed', { id });

  // Don't wait for the process to confirm it exited — free the slot immediately so
  // deleting a stuck item always unblocks the rest of the queue right away.
  if (wasActive && runningId === id) {
    forceReleaseRunningSlot(id);
  }

  return { ok: true };
}

function reorderItems(orderedIds) {
  const byId = new Map(items.map((i) => [i.id, i]));
  const reordered = orderedIds.map((id) => byId.get(id)).filter(Boolean);
  const placed = new Set(reordered.map((i) => i.id));
  const missing = items.filter((i) => !placed.has(i.id));
  items.length = 0;
  items.push(...reordered, ...missing);
  return { ok: true, items };
}

function getAll() {
  return items;
}

module.exports = { addItem, cancelItem, removeItem, reorderItems, getAll };
