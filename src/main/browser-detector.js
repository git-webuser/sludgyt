const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const BUNDLE_ID_TO_BROWSER = {
  'com.apple.safari': 'safari',
  'com.google.chrome': 'chrome',
  'org.mozilla.firefox': 'firefox',
  'com.microsoft.edgemac': 'edge',
  'com.brave.browser': 'brave',
  'org.chromium.chromium': 'chromium',
  'com.vivaldi.vivaldi': 'vivaldi',
  'com.operasoftware.opera': 'opera',
  'ru.yandex.desktop.yandex-browser': 'yandex',
};

// Windows stores browser profiles under these roots; both env vars are unset on
// non-Windows platforms, so `local`/`roaming` fall back to '' and the resulting
// paths simply never match `fs.existsSync` there (no platform check needed).
const local = process.env.LOCALAPPDATA || '';
const roaming = process.env.APPDATA || '';

const COOKIE_BROWSERS = [
  {
    id: 'safari',
    label: 'Safari',
    paths: [
      '/Applications/Safari.app',
      '/System/Applications/Safari.app',
      '/System/Cryptexes/App/System/Applications/Safari.app',
      path.join(os.homedir(), 'Library/Safari'),
    ],
  },
  {
    id: 'chrome',
    label: 'Google Chrome',
    paths: [
      '/Applications/Google Chrome.app',
      path.join(os.homedir(), 'Applications/Google Chrome.app'),
      path.join(os.homedir(), 'Library/Application Support/Google/Chrome'),
      path.join(local, 'Google/Chrome/User Data'),
    ],
  },
  {
    id: 'firefox',
    label: 'Firefox',
    paths: [
      '/Applications/Firefox.app',
      path.join(os.homedir(), 'Applications/Firefox.app'),
      path.join(os.homedir(), 'Library/Application Support/Firefox/Profiles'),
      path.join(roaming, 'Mozilla/Firefox/Profiles'),
    ],
  },
  {
    id: 'edge',
    label: 'Microsoft Edge',
    paths: [
      '/Applications/Microsoft Edge.app',
      path.join(os.homedir(), 'Applications/Microsoft Edge.app'),
      path.join(os.homedir(), 'Library/Application Support/Microsoft Edge'),
      path.join(local, 'Microsoft/Edge/User Data'),
    ],
  },
  {
    id: 'brave',
    label: 'Brave',
    paths: [
      '/Applications/Brave Browser.app',
      path.join(os.homedir(), 'Applications/Brave Browser.app'),
      path.join(os.homedir(), 'Library/Application Support/BraveSoftware/Brave-Browser'),
      path.join(local, 'BraveSoftware/Brave-Browser/User Data'),
    ],
  },
  {
    id: 'chromium',
    label: 'Chromium',
    paths: [
      '/Applications/Chromium.app',
      path.join(os.homedir(), 'Applications/Chromium.app'),
      path.join(os.homedir(), 'Library/Application Support/Chromium'),
      path.join(local, 'Chromium/User Data'),
    ],
  },
  {
    id: 'vivaldi',
    label: 'Vivaldi',
    paths: [
      '/Applications/Vivaldi.app',
      path.join(os.homedir(), 'Applications/Vivaldi.app'),
      path.join(os.homedir(), 'Library/Application Support/Vivaldi'),
      path.join(local, 'Vivaldi/User Data'),
    ],
  },
  {
    id: 'opera',
    label: 'Opera',
    supported: true,
    paths: [
      '/Applications/Opera.app',
      path.join(os.homedir(), 'Applications/Opera.app'),
      path.join(os.homedir(), 'Library/Application Support/com.operasoftware.Opera'),
      path.join(roaming, 'Opera Software/Opera Stable'),
    ],
  },
  {
    id: 'yandex',
    label: 'Yandex Browser',
    supported: false,
    paths: [
      '/Applications/Yandex.app',
      path.join(os.homedir(), 'Applications/Yandex.app'),
      path.join(os.homedir(), 'Library/Application Support/Yandex/YandexBrowser'),
      path.join(local, 'Yandex/YandexBrowser/User Data'),
    ],
  },
];

function listCookieBrowsers() {
  const browsers = COOKIE_BROWSERS
    .filter((browser) => browser.paths.some((candidate) => fs.existsSync(candidate)))
    .map(({ id, label, supported }) => ({ id, label, supported: supported !== false }));
  const systemDefault = systemDefaultBrowser();
  const defaultBrowser = browsers.find((candidate) => candidate.id === systemDefault) || browsers[0];
  return browsers.map((browser) => ({
    ...browser,
    isDefault: Boolean(defaultBrowser && browser.id === defaultBrowser.id),
  }));
}

function systemDefaultBrowser() {
  if (process.platform !== 'darwin') return '';

  const result = spawnSync('defaults', [
    'read',
    'com.apple.LaunchServices/com.apple.launchservices.secure',
    'LSHandlers',
  ], { encoding: 'utf8' });

  if (result.status !== 0 || !result.stdout) return '';

  const blocks = result.stdout.split('},');
  for (const scheme of ['https', 'http']) {
    const block = blocks.find((entry) => entry.includes(`LSHandlerURLScheme = ${scheme};`));
    if (!block) continue;
    const matches = Array.from(block.matchAll(/LSHandlerRole(?:All|Viewer)\s*=\s*"?([^";\s]+)"?/g));
    const bundleId = matches.map((match) => match[1]).filter((value) => value !== '-').pop();
    if (!bundleId) continue;
    const browser = BUNDLE_ID_TO_BROWSER[bundleId.toLowerCase()];
    if (browser) return browser;
  }

  return '';
}

module.exports = { listCookieBrowsers };
