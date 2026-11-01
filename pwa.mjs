export const PWA_ROUTES = new Map([
  ['/manifest.webmanifest', ['web/pwa/manifest.webmanifest', 'application/manifest+json; charset=utf-8']],
  ['/sw.js', ['web/pwa/sw.js', 'text/javascript; charset=utf-8']],
  ['/offline.html', ['web/pwa/offline.html', 'text/html; charset=utf-8']],
  ['/assets/offline.css', ['web/pwa/offline.css', 'text/css; charset=utf-8']],
  ...['icon-192.png', 'icon-512.png', 'maskable-512.png', 'apple-touch-icon.png'].map(name => [`/icons/${name}`, [`web/pwa/icons/${name}`, 'image/png']]),
  ['/favicon.ico', ['web/pwa/icons/icon-192.png', 'image/png']],
]);
