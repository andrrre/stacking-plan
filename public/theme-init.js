// Before the first paint: put the stored light/dark choice on the root, so a dark choice never flashes light.
// Only the exact values src/features/theme/themeStorage.ts saves are read; anything else is left to the app,
// whose theme store stays the source of truth (it sets data-theme again, and follows the system without a choice).
try {
  var stored = window.localStorage.getItem('stackmatch.v1.theme')
  if (stored === '"light"' || stored === '"dark"') document.documentElement.setAttribute('data-theme', JSON.parse(stored))
} catch (e) {
  // unreadable storage: the app decides
}
