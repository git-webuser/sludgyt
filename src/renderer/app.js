function showStartupBanner(problems, onFix) {
  const banner = document.getElementById('startup-banner');
  banner.innerHTML = '';

  const text = document.createElement('div');
  text.textContent = 'Проблема с бинарниками: ' + problems.join('; ');
  banner.appendChild(text);

  const btn = document.createElement('button');
  btn.className = 'btn';
  btn.textContent = 'Открыть настройки';
  btn.style.marginTop = '8px';
  btn.onclick = onFix;
  banner.appendChild(btn);

  banner.classList.remove('hidden');
}

(function () {
  const addForm = initAddForm();
  const settingsPanel = initSettingsPanel();
  setQueueRetryHandler((prefillData) => addForm.prefill(prefillData));
  setQueueReorderHandler((newItems) => {
    currentItems = newItems;
    renderQueueList(currentItems);
  });

  window.api.settings.get().then(async (settings) => {
    applyTheme(resolveActiveThemeColors(settings));

    const [ytdlpResult, ffmpegResult] = await Promise.all([
      window.api.binaries.checkYtDlp(settings.ytDlpPath, { skipUpdateCheck: true }),
      window.api.binaries.checkFfmpeg(settings.ffmpegPath),
    ]);

    const problems = [];
    if (!ytdlpResult.ok) problems.push(`yt-dlp — ${ytdlpResult.error}`);
    if (!ffmpegResult.ok) problems.push(`ffmpeg — ${ffmpegResult.error}`);

    if (problems.length > 0) {
      showStartupBanner(problems, () => settingsPanel.open());
    }
  });

  let currentItems = [];

  const clearQueueBtn = document.getElementById('clear-queue-btn');
  clearQueueBtn.addEventListener('click', () => {
    const finishedIds = currentItems
      .filter((i) => i.status === 'done' || i.status === 'failed' || i.status === 'cancelled')
      .map((i) => i.id);
    for (const id of finishedIds) {
      window.api.queue.remove(id);
    }
  });

  function upsertItem(updated) {
    const idx = currentItems.findIndex((i) => i.id === updated.id);
    if (idx === -1) {
      currentItems.push(updated);
    } else {
      currentItems[idx] = updated;
    }
    renderQueueList(currentItems);
  }

  window.api.queue.getAll().then((items) => {
    currentItems = items;
    renderQueueList(currentItems);
  });

  window.api.queue.onUpdate((item) => {
    upsertItem(item);
  });

  window.api.queue.onRemoved(({ id }) => {
    currentItems = currentItems.filter((i) => i.id !== id);
    renderQueueList(currentItems);
  });

  window.api.queue.onProgress(({ id, percent }) => {
    const item = currentItems.find((i) => i.id === id);
    if (item) item.percent = percent;
    updateItemProgress(id, percent);
  });
})();
