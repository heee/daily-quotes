// Bump VERSION to force every device to re-download the app shell.
const VERSION = 'v1';
const CACHE = 'daily-quotes-' + VERSION;
const ASSETS = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'quotes.json',
  'manifest.webmanifest',
  'fonts/newsreader-latin.woff2',
  'fonts/newsreader-latin-ext.woff2',
  'fonts/newsreader-italic-latin.woff2',
  'fonts/newsreader-italic-latin-ext.woff2',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('daily-quotes-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Serve from cache immediately; refresh the cached copy in the background so a
// redeploy (new quotes.json, app changes) shows up on the next launch.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  const key = req.mode === 'navigate' ? 'index.html' : req;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(key, { ignoreSearch: true });
      const network = fetch(req.url, { cache: 'no-cache' })
        .then((res) => {
          if (res && res.ok) cache.put(key, res.clone());
          return res;
        })
        .catch(() => cached);
      if (cached) {
        event.waitUntil(network);
        return cached;
      }
      return network;
    })
  );
});
