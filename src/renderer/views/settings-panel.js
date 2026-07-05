function initSettingsPanel() {
  const dialog = document.getElementById('settings-dialog');
  const toggleBtn = document.getElementById('settings-toggle');
  const cancelBtn = document.getElementById('settings-cancel');
  const saveBtn = document.getElementById('settings-save');

  const ytdlpPath = document.getElementById('ytdlp-path');
  const ffmpegPath = document.getElementById('ffmpeg-path');
  const defaultDir = document.getElementById('default-dir');

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

  async function openDialog() {
    const settings = await window.api.settings.get();
    ytdlpPath.value = settings.ytDlpPath || '';
    ffmpegPath.value = settings.ffmpegPath || '';
    defaultDir.value = settings.defaultSaveDir || '';
    ytdlpCheckResult.textContent = '';
    ytdlpCheckResult.className = 'check-result';
    ffmpegCheckResult.textContent = '';
    ffmpegCheckResult.className = 'check-result';

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

  cancelBtn.addEventListener('click', async () => {
    const settings = await window.api.settings.get();
    applyTheme(resolveActiveThemeColors(settings));
    dialog.close();
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

  ytdlpGithubBtn.addEventListener('click', () => {
    window.api.shell.openExternal('https://github.com/yt-dlp/yt-dlp/releases/latest');
  });

  ffmpegGithubBtn.addEventListener('click', () => {
    window.api.shell.openExternal('https://ffmpeg.org/download.html');
  });

  saveBtn.addEventListener('click', async () => {
    const partial = {
      ytDlpPath: ytdlpPath.value.trim(),
      ffmpegPath: ffmpegPath.value.trim(),
      defaultSaveDir: defaultDir.value.trim(),
      themeId: themeSelect.value,
    };
    if (themeSelect.value === 'custom') {
      partial.customTheme = workingCustomColors;
    }
    await window.api.settings.set(partial);
    dialog.close();
  });

  return { open: openDialog };
}
