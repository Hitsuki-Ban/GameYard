const SCOPE_ID = encodeURIComponent(new URL(self.registration.scope).pathname);
const CACHE_PREFIX = `pulse-link-overdrive-${SCOPE_ID}-`;
const CACHE = `${CACHE_PREFIX}v1.1.0-r1`;
const APP_SHELL_URL = new URL('./index.html', self.registration.scope).href;
const ASSETS = [
  './', './index.html', './styles.css',
  './manifest.zh-CN.webmanifest', './manifest.ja.webmanifest', './manifest.en.webmanifest',
  './src/config.js', './src/i18n.js', './src/audio.js', './src/input.js',
  './src/model.js', './src/render.js', './src/app.js',
  './assets/icon.svg', './assets/icon-192.png', './assets/icon-512.png'
];
const ASSET_URLS = new Set(ASSETS.map(asset => new URL(asset, self.registration.scope).href));

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE)
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .catch(async () => {
          const cache = await caches.open(CACHE);
          return (await cache.match(request, { ignoreSearch:true })) || cache.match(APP_SHELL_URL);
        })
    );
    return;
  }

  const canonicalUrl = new URL(url.pathname, self.location.origin).href;
  if (!ASSET_URLS.has(canonicalUrl)) return;

  event.respondWith(
    caches.open(CACHE).then(cache => cache.match(canonicalUrl).then(cached => cached || fetch(request).then(async response => {
      if (response.ok) {
        await cache.put(canonicalUrl, response.clone());
      }
      return response;
    })))
  );
});
