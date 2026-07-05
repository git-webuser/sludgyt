function initSettingsPanel(onSaved) {
  const dialog = document.getElementById('settings-dialog');
  const toggleBtn = document.getElementById('settings-toggle');
  const cancelBtn = document.getElementById('settings-cancel');
  const saveBtn = document.getElementById('settings-save');

  const ytdlpPath = document.getElementById('ytdlp-path');
  const ffmpegPath = document.getElementById('ffmpeg-path');
  const cookiesBrowser = document.getElementById('cookies-browser');
  const cookiesBrowserResult = document.getElementById('cookies-browser-result');
  const defaultDir = document.getElementById('default-dir');
  const appUpdateCheckBtn = document.getElementById('app-update-check');
  const appUpdateDownloadBtn = document.getElementById('app-update-download');
  const appUpdateGithubBtn = document.getElementById('app-update-github');
  const appUpdateResult = document.getElementById('app-update-result');

  const ytdlpBrowse = document.getElementById('ytdlp-browse');
  const ffmpegBrowse = document.getElementById('ffmpeg-browse');
  const defaultDirBrowse = document.getElementById('default-dir-browse');

  const ytdlpAutoBtn = document.getElementById('ytdlp-autodetect');
  const ffmpegAutoBtn = document.getElementById('ffmpeg-autodetect');

  const ytdlpCheckBtn = document.getElementById('ytdlp-check');
  const ytdlpCheckResult = document.getElementById('ytdlp-check-result');
  const ytdlpGithubBtn = document.getElementById('ytdlp-github');

  const ffmpegCheckBtn = document.getElementById('ffmpeg-check');
  const ffmpegCheckResult = document.getElementById('ffmpeg-check-result');
  const ffmpegGithubBtn = document.getElementById('ffmpeg-github');

  const themeSelect = document.getElementById('theme-select');
  const customEditor = document.getElementById('custom-theme-editor');

  let workingCustomColors = null;
  let appUpdateDownloadUrl = null;

  function buildCustomEditor(initialColors) {
    customEditor.innerHTML = '';
    workingCustomColors = { ...initialColors };
    for (const [key, label] of Object.entries(COLOR_LABELS)) {
      const row = document.createElement('div');
      row.className = 'color-row';

      const labelEl = document.createElement('label');
      labelEl.textContent = label;

      const input = document.createElement('input');
      input.type = 'color';
      input.value = workingCustomColors[key] || '#000000';
      input.addEventListener('input', () => {
        workingCustomColors[key] = input.value;
        applyTheme(workingCustomColors);
      });

      row.appendChild(labelEl);
      row.appendChild(input);
      customEditor.appendChild(row);
    }
  }

  themeSelect.addEventListener('change', () => {
    const id = themeSelect.value;
    if (id === 'custom') {
      customEditor.classList.remove('hidden');
      const base = workingCustomColors || BUILTIN_THEMES['vscode-dark'].colors;
      buildCustomEditor(base);
      applyTheme(workingCustomColors);
    } else {
      customEditor.classList.add('hidden');
      applyTheme(BUILTIN_THEMES[id].colors);
    }
  });

  function renderCookieBrowserOptions(browsers, selected) {
    cookiesBrowser.innerHTML = '';

    const disabledOption = document.createElement('option');
    disabledOption.value = '';
    disabledOption.textContent = 'Не использовать cookies';
    cookiesBrowser.appendChild(disabledOption);

    for (const browser of browsers) {
      const option = document.createElement('option');
      option.value = browser.id;
      option.disabled = !browser.supported;
      const suffixes = [];
      if (browser.isDefault) suffixes.push('по умолчанию');
      if (!browser.supported) suffixes.push('не поддерживается yt-dlp');
      option.textContent = browser.label + (suffixes.length ? ` (${suffixes.join(', ')})` : '');
      cookiesBrowser.appendChild(option);
    }

    if (selected && !browsers.some((browser) => browser.id === selected)) {
      const currentOption = document.createElement('option');
      currentOption.value = selected;
      currentOption.textContent = selected + ' (сохранено вручную)';
      cookiesBrowser.appendChild(currentOption);
    }

    cookiesBrowser.value = selected || '';
    if (browsers.length === 0) {
      cookiesBrowserResult.textContent = 'Браузеры с cookies не найдены автоматически.';
      cookiesBrowserResult.className = 'check-result warn';
    } else {
      cookiesBrowserResult.textContent = 'Найдено: ' + browsers.map((browser) => browser.label).join(', ');
      cookiesBrowserResult.className = 'check-result success';
    }
  }

  async function openDialog() {
    const [settings, browsers] = await Promise.all([
      window.api.settings.get(),
      window.api.browsers.listCookieSources(),
    ]);
    ytdlpPath.value = settings.ytDlpPath || '';
    ffmpegPath.value = settings.ffmpegPath || '';
    renderCookieBrowserOptions(browsers, settings.cookiesFromBrowser || '');
    defaultDir.value = settings.defaultSaveDir || '';
    ytdlpCheckResult.textContent = '';
    ytdlpCheckResult.className = 'check-result';
    ffmpegCheckResult.textContent = '';
    ffmpegCheckResult.className = 'check-result';
    appUpdateResult.textContent = '';
    appUpdateResult.className = 'check-result';
    appUpdateDownloadUrl = null;
    appUpdateDownloadBtn.classList.add('hidden');

    themeSelect.value = settings.themeId || 'vscode-dark';
    if (settings.themeId === 'custom' && settings.customTheme) {
      customEditor.classList.remove('hidden');
      buildCustomEditor(settings.customTheme);
    } else {
      customEditor.classList.add('hidden');
      workingCustomColors = null;
    }

    dialog.showModal();
  }

  toggleBtn.addEventListener('click', openDialog);

  async function cancelSettings() {
    const settings = await window.api.settings.get();
    applyTheme(resolveActiveThemeColors(settings));
    dialog.close();
  }

  cancelBtn.addEventListener('click', cancelSettings);

  // <dialog> only fires 'click' on itself (not a descendant) when the click lands
  // on the backdrop — its own box is sized to the visible panel, not the overlay.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) cancelSettings();
  });

  ytdlpBrowse.addEventListener('click', async () => {
    const picked = await window.api.dialog.pickFile(ytdlpPath.value || undefined);
    if (picked) ytdlpPath.value = picked;
  });

  ffmpegBrowse.addEventListener('click', async () => {
    const picked = await window.api.dialog.pickFile(ffmpegPath.value || undefined);
    if (picked) ffmpegPath.value = picked;
  });

  defaultDirBrowse.addEventListener('click', async () => {
    const picked = await window.api.dialog.pickDirectory(defaultDir.value || undefined);
    if (picked) defaultDir.value = picked;
  });

  ytdlpAutoBtn.addEventListener('click', async () => {
    ytdlpCheckResult.textContent = 'Ищу…';
    ytdlpCheckResult.className = 'check-result';
    const result = await window.api.binaries.autoDetect('yt-dlp');
    if (result.found) {
      ytdlpPath.value = result.path;
      ytdlpCheckResult.textContent = `Найдено: ${result.path}`;
      ytdlpCheckResult.className = 'check-result success';
    } else {
      ytdlpCheckResult.textContent = 'Не удалось найти автоматически. Укажите путь вручную через «Обзор…».';
      ytdlpCheckResult.className = 'check-result error';
    }
  });

  ffmpegAutoBtn.addEventListener('click', async () => {
    ffmpegCheckResult.textContent = 'Ищу…';
    ffmpegCheckResult.className = 'check-result';
    const result = await window.api.binaries.autoDetect('ffmpeg');
    if (result.found) {
      ffmpegPath.value = result.path;
      ffmpegCheckResult.textContent = `Найдено: ${result.path}`;
      ffmpegCheckResult.className = 'check-result success';
    } else {
      ffmpegCheckResult.textContent = 'Не удалось найти автоматически. Укажите путь вручную через «Обзор…».';
      ffmpegCheckResult.className = 'check-result error';
    }
  });

  ytdlpCheckBtn.addEventListener('click', async () => {
    ytdlpCheckResult.textContent = 'Проверка…';
    ytdlpCheckResult.className = 'check-result';
    const result = await window.api.binaries.checkYtDlp(ytdlpPath.value.trim());
    if (!result.ok) {
      ytdlpCheckResult.textContent = result.error;
      ytdlpCheckResult.className = 'check-result error';
      return;
    }
    let text = `версия ${result.version}`;
    if (result.updateAvailable === true) text += ` — доступно обновление до ${result.latest}`;
    else if (result.updateAvailable === false) text += ' — установлена актуальная версия';
    else text += ' (не удалось проверить обновления — нет сети)';
    ytdlpCheckResult.textContent = text;
    ytdlpCheckResult.className = 'check-result ' + (result.updateAvailable ? 'warn' : 'success');
  });

  ffmpegCheckBtn.addEventListener('click', async () => {
    ffmpegCheckResult.textContent = 'Проверка…';
    ffmpegCheckResult.className = 'check-result';
    const result = await window.api.binaries.checkFfmpeg(ffmpegPath.value.trim());
    if (!result.ok) {
      ffmpegCheckResult.textContent = result.error;
      ffmpegCheckResult.className = 'check-result error';
      return;
    }
    ffmpegCheckResult.textContent = `версия ${result.version}`;
    ffmpegCheckResult.className = 'check-result success';
  });

  appUpdateCheckBtn.addEventListener('click', async () => {
    appUpdateResult.textContent = 'Проверка…';
    appUpdateResult.className = 'check-result';
    const result = await window.api.app.checkUpdate();
    if (!result.ok) {
      appUpdateResult.textContent = `Текущая версия ${result.current}. ${result.error}`;
      appUpdateResult.className = 'check-result error';
      return;
    }

    if (result.updateAvailable) {
      appUpdateDownloadUrl = result.downloadUrl || result.releaseUrl;
      appUpdateDownloadBtn.classList.remove('hidden');
      const downloadHint = result.downloadName
        ? ` Файл: ${result.downloadName}.`
        : ' Подходящий файл не найден автоматически, открою страницу релиза.';
      appUpdateResult.textContent = `Текущая версия ${result.current}. Доступно обновление ${result.latest}.${downloadHint}`;
      appUpdateResult.className = 'check-result warn';
    } else {
      appUpdateDownloadUrl = null;
      appUpdateDownloadBtn.classList.add('hidden');
      appUpdateResult.textContent = `Текущая версия ${result.current}. Установлена актуальная версия.`;
      appUpdateResult.className = 'check-result success';
    }
  });

  ytdlpGithubBtn.addEventListener('click', () => {
    window.api.shell.openExternal('https://github.com/yt-dlp/yt-dlp/releases/latest');
  });

  ffmpegGithubBtn.addEventListener('click', () => {
    window.api.shell.openExternal('https://ffmpeg.org/download.html');
  });

  appUpdateDownloadBtn.addEventListener('click', () => {
    if (appUpdateDownloadUrl) {
      window.api.shell.openExternal(appUpdateDownloadUrl);
    }
  });

  appUpdateGithubBtn.addEventListener('click', () => {
    window.api.shell.openExternal('https://github.com/git-webuser/sludgyt/releases/latest');
  });

  saveBtn.addEventListener('click', async () => {
    const partial = {
      ytDlpPath: ytdlpPath.value.trim(),
      ffmpegPath: ffmpegPath.value.trim(),
      cookiesFromBrowser: cookiesBrowser.value.trim(),
      defaultSaveDir: defaultDir.value.trim(),
      themeId: themeSelect.value,
    };
    if (themeSelect.value === 'custom') {
      partial.customTheme = workingCustomColors;
    }
    await window.api.settings.set(partial);
    dialog.close();
    onSaved?.();
  });

  return { open: openDialog };
}
