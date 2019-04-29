self.addEventListener('fetch', function(event) {
  const req = event.request
  event.respondWith(
    fetch(req).then(resp => {
      if (req.method === "GET" && req.url.startsWith("http") && !req.headers.get("authorization")) {
        const forStorage = resp.clone()
        caches.open('v1').
          then(cache => cache.put(req, forStorage)).
          catch(console.log)
      }

      return resp;
    }).catch(e => caches.match(req))
  )
});
