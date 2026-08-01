const CACHE = 'crown-breaker-v3.7.1';
const FILES = Object.freeze([
  './',
  './index.html',
  './styles.css',
  './i18n.js',
  './game.js',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './manifest.webmanifest',
  './manifest.zh-CN.webmanifest',
  './manifest.ja.webmanifest',
  './assets/catalog.json',
  './previews/assets.html',
  './previews/assets.css',
  './previews/assets.js',
  './previews/assets-sheet.png',
  './assets/acts/gallery-particles.svg',
  './assets/acts/gallery.svg',
  './assets/acts/outer-particles.svg',
  './assets/acts/outer.svg',
  './assets/acts/throne-particles.svg',
  './assets/acts/throne.svg',
  './assets/bosses/iron-bastion.svg',
  './assets/bosses/pawnstorm.svg',
  './assets/bosses/twin-queens.svg',
  './assets/brand/app-icon.svg',
  './assets/brand/logo.svg',
  './assets/formations/fortress.svg',
  './assets/formations/lance.svg',
  './assets/formations/phalanx.svg',
  './assets/formations/pincer.svg',
  './assets/formations/scatter.svg',
  './assets/formations/vanguard.svg',
  './assets/pieces/black-bishop.svg',
  './assets/pieces/black-king.svg',
  './assets/pieces/black-knight.svg',
  './assets/pieces/black-pawn.svg',
  './assets/pieces/black-queen.svg',
  './assets/pieces/black-rook.svg',
  './assets/pieces/white-bishop.svg',
  './assets/pieces/white-king.svg',
  './assets/pieces/white-knight.svg',
  './assets/pieces/white-pawn.svg',
  './assets/pieces/white-queen.svg',
  './assets/pieces/white-rook.svg',
  './assets/traits/berserk.svg',
  './assets/traits/chains.svg',
  './assets/traits/echo.svg',
  './assets/traits/gravity.svg',
  './assets/traits/guarded.svg',
  './assets/traits/hex.svg',
  './assets/traits/lockstep.svg',
  './assets/traits/mist.svg',
  './assets/traits/phantom.svg',
  './assets/traits/possession.svg',
  './assets/traits/rampart.svg',
  './assets/traits/summoner.svg',
  './assets/traits/swift.svg',
  './assets/traits/thorns.svg',
  './assets/traits/tithe.svg',
  './assets/ui/combo.svg',
  './assets/ui/crown.svg',
  './assets/ui/energy.svg',
  './assets/ui/relic.svg',
  './assets/ui/shield.svg',
  './assets/ui/turns.svg',
]);

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(FILES))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith('crown-breaker-') && key !== CACHE)
          .map(key => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(event.request);
    if (cached) return cached;

    try {
      const response = await fetch(event.request);
      const requestUrl = new URL(event.request.url);
      if (requestUrl.origin === self.location.origin && response.ok) {
        await cache.put(event.request, response.clone());
      }
      return response;
    } catch (error) {
      if (event.request.mode === 'navigate') {
        const fallback = await cache.match('./index.html');
        if (fallback) return fallback;
      }
      throw error;
    }
  })());
});
