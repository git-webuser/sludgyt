const BUILTIN_THEMES = {
  'vscode-dark': {
    name: 'VS Code Dark',
    colors: {
      bg: '#1e1e1e',
      bgElevated: '#252526',
      fg: '#d4d4d4',
      fgMuted: '#858585',
      accent: '#007acc',
      accentStrong: '#0e639c',
      border: '#3c3c3c',
      warn: '#cca700',
      error: '#f14c4c',
      success: '#89d185',
      onAccent: '#ffffff',
    },
  },
  'mono-day': {
    name: 'Монохром (день)',
    colors: {
      bg: '#ffffff',
      bgElevated: '#f2f2f2',
      fg: '#141414',
      fgMuted: '#6e6e6e',
      accent: '#141414',
      accentStrong: '#141414',
      border: '#d4d4d4',
      warn: '#4a4a4a',
      error: '#000000',
      success: '#5a5a5a',
      onAccent: '#ffffff',
    },
  },
  'mono-night': {
    name: 'Монохром (ночь)',
    colors: {
      bg: '#141414',
      bgElevated: '#1e1e1e',
      fg: '#e8e8e8',
      fgMuted: '#8f8f8f',
      accent: '#e8e8e8',
      accentStrong: '#e0e0e0',
      border: '#3a3a3a',
      warn: '#c4c4c4',
      error: '#ffffff',
      success: '#b0b0b0',
      onAccent: '#000000',
    },
  },
};

const COLOR_LABELS = {
  bg: 'Фон',
  bgElevated: 'Фон панелей',
  fg: 'Текст',
  fgMuted: 'Приглушённый текст',
  accent: 'Акцент',
  accentStrong: 'Акцент (кнопки)',
  border: 'Рамки',
  warn: 'Предупреждение',
  error: 'Ошибка',
  success: 'Успех',
  onAccent: 'Текст на кнопках',
};

const THEME_VAR_MAP = {
  bg: '--bg',
  bgElevated: '--bg-elevated',
  fg: '--fg',
  fgMuted: '--fg-muted',
  accent: '--accent',
  accentStrong: '--accent-strong',
  border: '--border',
  warn: '--warn',
  error: '--error',
  success: '--success',
  onAccent: '--on-accent',
};

function lightenColor(hex, amount) {
  const num = parseInt(hex.replace('#', ''), 16);
  const clamp = (c) => Math.max(0, Math.min(255, c));
  const r = clamp((num >> 16) + amount);
  const g = clamp(((num >> 8) & 0xff) + amount);
  const b = clamp((num & 0xff) + amount);
  return '#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('');
}

function applyTheme(colors) {
  const root = document.documentElement.style;
  for (const [key, cssVar] of Object.entries(THEME_VAR_MAP)) {
    if (colors[key]) root.setProperty(cssVar, colors[key]);
  }
  if (colors.accentStrong) {
    root.setProperty('--accent-strong-hover', lightenColor(colors.accentStrong, 24));
  }
}

function resolveActiveThemeColors(settings) {
  if (settings.themeId === 'custom' && settings.customTheme) {
    return settings.customTheme;
  }
  const builtin = BUILTIN_THEMES[settings.themeId] || BUILTIN_THEMES['vscode-dark'];
  return builtin.colors;
}
