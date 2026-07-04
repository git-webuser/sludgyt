(function () {
  window.api.settings.get().then((settings) => {
    applyTheme(resolveActiveThemeColors(settings));
  });

  const addForm = initAddForm();
  initSettingsPanel();
  setQueueRetryHandler((prefillData) => addForm.prefill(prefillData));

  let currentItems = [];

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
