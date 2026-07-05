const MAXIMIZE_ICON = `
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor"/>
  </svg>
`;

const RESTORE_ICON = `
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="2.5" y="0.5" width="7" height="7" stroke="currentColor"/>
    <path d="M0.5 2.5V9.5H7.5" stroke="currentColor"/>
  </svg>
`;

function initTitlebar() {
  const { windowControls } = window.api;
  const minimizeBtn = document.getElementById('titlebar-minimize');
  const maximizeBtn = document.getElementById('titlebar-maximize');
  const closeBtn = document.getElementById('titlebar-close');
  const dragRegion = document.querySelector('.titlebar-drag');

  document.body.classList.add(`platform-${windowControls.platform}`);

  function setMaximizedIcon(isMaximized) {
    maximizeBtn.innerHTML = isMaximized ? RESTORE_ICON : MAXIMIZE_ICON;
    maximizeBtn.title = isMaximized ? 'Восстановить' : 'Развернуть';
    maximizeBtn.setAttribute('aria-label', maximizeBtn.title);
  }

  minimizeBtn.addEventListener('click', () => windowControls.minimize());
  maximizeBtn.addEventListener('click', () => windowControls.toggleMaximize());
  closeBtn.addEventListener('click', () => windowControls.close());
  dragRegion.addEventListener('dblclick', () => windowControls.toggleMaximize());

  windowControls.isMaximized().then(setMaximizedIcon);
  windowControls.onMaximizeChange(setMaximizedIcon);
}

initTitlebar();
