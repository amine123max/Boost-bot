// Runs before the stylesheet/SPA, including on refresh and direct route visits.
(function () {
  var mode = 'system';
  try {
    var saved = localStorage.getItem('boost.theme.v1');
    if (saved === 'light' || saved === 'dark' || saved === 'system') mode = saved;
  } catch (_) {}
  var dark = mode === 'dark' || (mode === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = mode;
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  var root = document.documentElement;
  root.dataset.boostRoute = /^\/bot(?:\/|$)/.test(location.pathname) ? 'bot' : 'main';
  root.style.backgroundColor = dark ? '#0e0e0e' : '#f5f5f6';
  root.style.setProperty('--bg', dark ? '#0e0e0e' : '#f5f5f6');
  root.style.setProperty('--sidebar', dark ? '#0e0e0e' : '#f5f5f6');
  root.style.setProperty('--card', dark ? '#191919' : '#ffffff');
  root.style.setProperty('--surface', dark ? '#272727' : '#f4f4f5');
  root.style.setProperty('--hover', dark ? '#333333' : '#e4e4e7');
  root.style.setProperty('--input', dark ? '#141414' : '#ffffff');
  root.style.setProperty('--dialog', dark ? '#222222' : '#ffffff');
  root.style.setProperty('--text', dark ? '#ececec' : '#3f3f46');
  root.style.setProperty('--muted', dark ? '#a1a1aa' : '#71717a');
  root.style.setProperty('--green', dark ? '#4ade80' : '#15803d');
  root.style.setProperty('--red', dark ? '#fb7185' : '#be123c');
  root.style.setProperty('--border', dark ? '#3f3f46' : '#e4e4e7');
  root.dataset.accent = 'teal';
  try {
    var raw = JSON.parse(localStorage.getItem('boost.ui.v1') || '{}');
    var colors = ['green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'pink', 'fuchsia', 'rose', 'red', 'orange', 'amber', 'yellow', 'lime'];
    root.dataset.accent = raw && colors.includes(raw.themeColor) ? raw.themeColor : 'teal';
    var version = raw && raw.typographyVersion;
    var prefs = raw && [1, 2, 3, 4].includes(version) ? raw : {};
    // Keep the allowlists and ordering aligned with ui-typography.ts so saved
    // fonts are present on the first paint, before Vue or the service loads.
    var chineseFonts = {
      system: '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC"',
      yahei: '"Microsoft YaHei", "Microsoft YaHei UI"',
      pingfang: '"PingFang SC", "Heiti SC"',
      'noto-sans': '"Noto Sans CJK SC", "Source Han Sans SC", "Noto Sans SC"',
      simsun: 'SimSun, "Songti SC", "Noto Serif CJK SC"',
      kaiti: 'KaiTi, "Kaiti SC", STKaiti',
      'noto-serif': '"Noto Serif CJK SC", "Source Han Serif SC", "Noto Serif SC"'
    };
    var englishFonts = {
      system: '"Segoe UI", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial',
      'times-new-roman': '"Times New Roman", "Liberation Serif", Times',
      arial: 'Arial, "Liberation Sans", Helvetica',
      georgia: 'Georgia, "Times New Roman", "Liberation Serif"',
      consolas: 'Consolas, "Cascadia Mono", Menlo, "Liberation Mono"'
    };
    var numberFonts = {
      inherit: '',
      'times-new-roman': '"Boost Digits Times"',
      arial: '"Boost Digits Arial"',
      consolas: '"Boost Digits Consolas"'
    };
    function fontFrom(options, key, fallback) {
      return Object.prototype.hasOwnProperty.call(options, key) ? options[key] : options[fallback];
    }
    root.style.setProperty('--ui-font-family', [
      fontFrom(numberFonts, prefs.numberFont, 'inherit'),
      fontFrom(englishFonts, prefs.englishFont, 'system'),
      fontFrom(chineseFonts, prefs.chineseFont, 'system'),
      '"Microsoft YaHei", "PingFang SC", sans-serif'
    ].filter(Boolean).join(', '));
    function bounded(value, min, max, fallback) {
      return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
    }
    var size = Math.round(bounded(prefs.fontSize, 11, 16, 13) * 2) / 2;
    var weight = [400, 500, 600].includes(Number(prefs.fontWeight)) ? Number(prefs.fontWeight) : 400;
    var spacing = Math.round(bounded(prefs.letterSpacing, -.3, 1.2, 0) * 10) / 10;
    if (version === 1 && size === 15 && weight === 400 && spacing === .5) {
      size = 13;
      spacing = 0;
    } else if (version === 2 && size === 14 && weight === 400 && spacing === 0) {
      size = 13;
    }
    root.style.setProperty('--font-scale', String(size / 14));
    root.style.setProperty('--data-font-scale', String(size / 15));
    root.style.setProperty('--ui-body-weight', String(weight));
    root.style.setProperty('--ui-heading-weight', String(Math.min(700, weight + 100)));
    root.style.setProperty('--ui-letter-spacing', spacing + 'px');
    root.dataset.density = prefs.density === 'comfortable' ? 'comfortable' : 'compact';
    root.dataset.notifications = prefs.notificationPosition === 'bottom-right' ? 'bottom-right' : 'top-right';
    root.dataset.density = raw && raw.density === 'comfortable' ? 'comfortable' : 'compact';
    root.dataset.notifications = raw && raw.notificationPosition === 'bottom-right' ? 'bottom-right' : 'top-right';
  } catch (_) {}
})();
