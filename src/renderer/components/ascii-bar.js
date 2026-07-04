function renderAsciiBar(percent, width = 24) {
  const clamped = Math.max(0, Math.min(100, percent || 0));
  const filled = Math.round((clamped / 100) * width);
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
  return `[${bar}] ${clamped.toFixed(1)}%`;
}
