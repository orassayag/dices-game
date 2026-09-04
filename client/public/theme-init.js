// Sets the theme class before first paint so there's no flash of the wrong theme.
// Key must match THEME_STORAGE_KEY in client/lib/theme.ts — this runs before React
// mounts, so it can't import that module. Served as a same-origin file (not inline)
// so it satisfies the default `script-src 'self'` CSP directive (server/app.ts).
(function () {
  var stored = localStorage.getItem('dices-game-theme');
  var isDark = stored === 'dark' || (stored !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', isDark);
})();
