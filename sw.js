/* eslint-env serviceworker */
/* eslint no-restricted-globals: 1 */

const PATHS = (process.env.FILE_LIST || []).map(p => `/brain/${p}`);

addEventListener('install', e => {
  e.waitUntil(
    (async () => {
      const cache = await self.caches.open('v1');
      await cache.addAll(PATHS).then(skipWaiting);
    })()
  );
});

addEventListener('activate', e => {
  e.waitUntil(
    (async () => {
      await clients.claim();

      if (registration.navigationPreload) {
        await registration.navigationPreload.enable();
      }

      const cache = await self.caches.open('v1');
      const keys = await cache.keys();

      await Promise.all(
        keys.map(async reqKey => {
          if (!PATHS.some(path => reqKey.url.endsWith(path))) {
            await cache.delete(reqKey);
          }
        })
      );
    })()
  );
});

addEventListener('fetch', e => {
  e.respondWith(
    (async () => {
      let response;

      if (e.request.url.startsWith('http')) {
        if (!navigator.onLine || e.request.cache !== 'no-cache') {
          response = await caches.match(e.request);
          if (response) {
            return response;
          }
        }
      }

      response = await e.preloadResponse;
      if (!response) {
        response = await fetch(e.request);
      }

      if (
        e.request.url.startsWith('http') &&
        e.request.method === 'GET' &&
        !e.request.headers.get('authorization')
      ) {
        const forStorage = response.clone();
        caches
          .open('v1')
          .then(cache => cache.put(e.request, forStorage))
          .catch(console.log);
      }

      return response;
    })()
  );
});
