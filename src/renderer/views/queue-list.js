let onRetryCallback = null;
let onReorderCallback = null;
let draggedId = null;

function setQueueRetryHandler(cb) {
  onRetryCallback = cb;
}

function setQueueReorderHandler(cb) {
  onReorderCallback = cb;
}

async function handleReorderDrop(targetId) {
  const sourceId = draggedId;
  if (!sourceId || sourceId === targetId) return;

  const ids = Array.from(document.querySelectorAll('.queue-item')).map((r) => r.dataset.id);
  const fromIdx = ids.indexOf(sourceId);
  if (fromIdx === -1) return;
  ids.splice(fromIdx, 1);
  const toIdx = ids.indexOf(targetId);
  ids.splice(toIdx === -1 ? ids.length : toIdx, 0, sourceId);

  const result = await window.api.queue.reorder(ids);
  if (result.ok && onReorderCallback) {
    onReorderCallback(result.items);
  }
}

function statusLabel(status) {
  const map = {
    queued: 'в очереди',
    downloading: 'загрузка',
    sniffing: 'поиск манифеста…',
    done: 'готово',
    failed: 'ошибка',
    cancelled: 'отменено',
  };
  return map[status] || status;
}

function summaryStatusLabel(status) {
  const map = {
    downloading: 'загружается',
    sniffing: 'ищет манифест',
    queued: 'в очереди',
    failed: 'ошибка',
    done: 'готово',
    cancelled: 'отменено',
  };
  return map[status] || status;
}

const SUMMARY_STATUS_ORDER = ['downloading', 'sniffing', 'queued', 'failed', 'done', 'cancelled'];

function renderQueueSummary(items) {
  const container = document.getElementById('queue-status-badges');
  const counts = {};
  for (const item of items) {
    counts[item.status] = (counts[item.status] || 0) + 1;
  }

  container.innerHTML = '';

  if (items.length > 0) {
    const doneCount = counts.done || 0;
    const totalBadge = document.createElement('span');
    totalBadge.className = 'status-badge total';
    totalBadge.textContent = `${doneCount} из ${items.length} загружено`;
    container.appendChild(totalBadge);
  }

  for (const status of SUMMARY_STATUS_ORDER) {
    if (!counts[status]) continue;
    const badge = document.createElement('span');
    badge.className = `status-badge ${status}`;
    badge.textContent = `${counts[status]} ${summaryStatusLabel(status)}`;
    container.appendChild(badge);
  }
}

function renderQueueList(items) {
  const container = document.getElementById('queue-list');
  renderQueueSummary(items);

  container.innerHTML = '';

  if (items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'queue-empty';
    empty.textContent = 'Очередь пуста';
    container.appendChild(empty);
    return;
  }

  for (const item of items) {
    container.appendChild(buildQueueRow(item));
  }
}

function updateItemProgress(id, percent) {
  const row = document.querySelector(`.queue-item[data-id="${id}"]`);
  if (!row) return;
  const bar = row.querySelector('.progress-bar');
  if (bar) bar.textContent = renderAsciiBar(percent);
}

function buildQueueRow(item) {
  const row = document.createElement('div');
  row.className = 'queue-item';
  row.dataset.id = item.id;

  const isActive = item.status === 'downloading' || item.status === 'sniffing';
  row.draggable = !isActive;

  row.addEventListener('dragstart', () => {
    draggedId = item.id;
    row.classList.add('dragging');
  });
  row.addEventListener('dragend', () => {
    row.classList.remove('dragging');
    draggedId = null;
  });
  row.addEventListener('dragover', (event) => {
    if (!draggedId || draggedId === item.id) return;
    event.preventDefault();
    row.classList.add('drag-over');
  });
  row.addEventListener('dragleave', () => {
    row.classList.remove('drag-over');
  });
  row.addEventListener('drop', (event) => {
    event.preventDefault();
    row.classList.remove('drag-over');
    handleReorderDrop(item.id);
  });

  const openable = item.status === 'done' && item.finalPath;
  if (openable) {
    row.classList.add('clickable');
    row.onclick = () => window.api.shell.openPath(item.finalPath);
  }

  const top = document.createElement('div');
  top.className = 'queue-item-top';

  const name = document.createElement('span');
  name.className = 'queue-item-name';
  name.textContent = item.filename;

  const badge = document.createElement('span');
  badge.className = `status-badge ${item.status}`;
  badge.textContent = statusLabel(item.status);

  top.appendChild(name);
  top.appendChild(badge);
  row.appendChild(top);

  if (item.looksLikeRawManifest) {
    const flag = document.createElement('div');
    flag.className = 'manifest-flag';
    flag.textContent = 'Прямая ссылка на манифест';
    row.appendChild(flag);
  }

  if (item.status === 'downloading' || item.status === 'done') {
    const bar = document.createElement('div');
    bar.className = 'progress-bar';
    bar.textContent = renderAsciiBar(item.percent);
    row.appendChild(bar);
  }

  if (item.status === 'failed' && item.error) {
    const err = document.createElement('div');
    err.className = 'item-error';
    err.textContent = item.error;
    row.appendChild(err);
  }

  const actions = document.createElement('div');
  actions.className = 'item-actions';

  if (openable) {
    const showBtn = document.createElement('button');
    showBtn.className = 'btn btn-ghost';
    showBtn.textContent = 'Показать в папке';
    showBtn.onclick = (event) => {
      event.stopPropagation();
      window.api.shell.showInFolder(item.finalPath);
    };
    actions.appendChild(showBtn);
  }

  if (item.status === 'queued' || item.status === 'downloading' || item.status === 'sniffing') {
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-ghost';
    cancelBtn.textContent = 'Отменить';
    cancelBtn.onclick = (event) => {
      event.stopPropagation();
      window.api.queue.cancel(item.id);
    };
    actions.appendChild(cancelBtn);
  }

  if (item.status === 'done' || item.status === 'failed' || item.status === 'cancelled') {
    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn btn-ghost';
    removeBtn.textContent = 'Удалить';
    removeBtn.onclick = (event) => {
      event.stopPropagation();
      window.api.queue.remove(item.id);
    };
    actions.appendChild(removeBtn);
  }

  if (item.status === 'failed' && onRetryCallback) {
    const retryBtn = document.createElement('button');
    retryBtn.className = 'btn';
    retryBtn.textContent = 'Повторить с новой ссылкой';
    retryBtn.onclick = async (event) => {
      event.stopPropagation();
      await window.api.queue.remove(item.id);
      onRetryCallback({ filename: item.filename, saveDir: item.saveDir });
    };
    actions.appendChild(retryBtn);
  }

  row.appendChild(actions);
  return row;
}
