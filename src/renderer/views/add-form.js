const RAW_MANIFEST_PATTERNS_CLIENT = [
  /\.m3u8(\?|$)/i,
  /\.mpd(\?|$)/i,
  /[?&]expires=/i,
  /[?&]Policy=/i,
  /[?&]Signature=/i,
  /[?&]hdnts=/i,
];

function looksLikeRawManifestClient(url) {
  return RAW_MANIFEST_PATTERNS_CLIENT.some((re) => re.test(url));
}

function initAddForm() {
  const urlInput = document.getElementById('url-input');
  const filenameInput = document.getElementById('filename-input');
  const dirDisplay = document.getElementById('dir-display');
  const dirBrowseBtn = document.getElementById('dir-browse');
  const qualitySelect = document.getElementById('quality-select');
  const addBtn = document.getElementById('add-btn');
  const warningBanner = document.getElementById('manifest-warning');
  const errorBanner = document.getElementById('add-error');

  const urlPasteBtn = document.getElementById('url-paste');
  const urlClearBtn = document.getElementById('url-clear');
  const filenamePasteBtn = document.getElementById('filename-paste');
  const filenameClearBtn = document.getElementById('filename-clear');

  let selectedDir = '';

  window.api.settings.get().then((settings) => {
    if (settings.defaultSaveDir) {
      selectedDir = settings.defaultSaveDir;
      dirDisplay.value = selectedDir;
    }
  });

  urlInput.addEventListener('input', () => {
    warningBanner.classList.toggle('hidden', !looksLikeRawManifestClient(urlInput.value.trim()));
  });

  urlPasteBtn.addEventListener('click', async () => {
    const text = await window.api.clipboard.readText();
    urlInput.value = text;
    urlInput.dispatchEvent(new Event('input'));
    urlInput.focus();
  });

  urlClearBtn.addEventListener('click', () => {
    urlInput.value = '';
    urlInput.dispatchEvent(new Event('input'));
    urlInput.focus();
  });

  filenamePasteBtn.addEventListener('click', async () => {
    const text = await window.api.clipboard.readText();
    filenameInput.value = text;
    filenameInput.focus();
  });

  filenameClearBtn.addEventListener('click', () => {
    filenameInput.value = '';
    filenameInput.focus();
  });

  dirBrowseBtn.addEventListener('click', async () => {
    const picked = await window.api.dialog.pickDirectory(selectedDir || undefined);
    if (picked) {
      selectedDir = picked;
      dirDisplay.value = picked;
    }
  });

  addBtn.addEventListener('click', async () => {
    errorBanner.classList.add('hidden');
    const url = urlInput.value.trim();
    const filename = filenameInput.value.trim();

    if (!url || !selectedDir) {
      errorBanner.textContent = 'Заполните ссылку и папку сохранения.';
      errorBanner.classList.remove('hidden');
      return;
    }

    const result = await window.api.queue.add({ url, filename, saveDir: selectedDir, quality: qualitySelect.value });
    if (!result.ok) {
      errorBanner.textContent = result.error;
      errorBanner.classList.remove('hidden');
      return;
    }

    urlInput.value = '';
    filenameInput.value = '';
    warningBanner.classList.add('hidden');
  });

  function prefill({ filename, saveDir }) {
    filenameInput.value = filename || '';
    if (saveDir) {
      selectedDir = saveDir;
      dirDisplay.value = saveDir;
    }
    urlInput.value = '';
    warningBanner.classList.add('hidden');
    urlInput.focus();
  }

  return { prefill };
}
