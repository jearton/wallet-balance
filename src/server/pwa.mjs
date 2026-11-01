export const PWA_ROUTES = new Map([
  ['/manifest.webmanifest', ['public/manifest.webmanifest', 'application/manifest+json; charset=utf-8']],
  ['/sw.js', ['public/sw.js', 'text/javascript; charset=utf-8']],
  ['/offline.html', ['public/offline.html', 'text/html; charset=utf-8']],
  ['/assets/offline.css', ['public/offline.css', 'text/css; charset=utf-8']],
  ...['icon-192.png', 'icon-512.png', 'maskable-512.png', 'apple-touch-icon.png'].map(name => [`/icons/${name}`, [`public/icons/${name}`, 'image/png']]),
  ['/favicon.ico', ['public/icons/icon-192.png', 'image/png']],
]);
