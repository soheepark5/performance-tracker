/*
 * Offline support.
 *
 * The app is a single document plus a couple of hashed assets and has no server
 * to talk to, so a runtime cache is enough: serve from cache instantly, refresh
 * in the background, and fall back to the cached shell when the network is gone.
 * Your data never passes through here — it lives in localStorage, not the cache.
 */
const CACHE = 'capacity-v3'

self.addEventListener('install', (e) => {
  self.skipWaiting()
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './index.html']).catch(() => {})))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return

  /*
   * The page itself is network-first. A deploy gives every asset a new hashed
   * name, so a cached index.html points at files that no longer exist — serving
   * it would break the app until the next reload. Falling back to the cache
   * keeps the app fully usable offline.
   */
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copy))
          return res
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html'))),
    )
    return
  }

  e.respondWith(
    caches.match(req).then((hit) => {
      const fresh = fetch(req)
        .then((res) => {
          // Never cache an HTML fallback under an asset URL: a server that is
          // mid-deploy (or misconfigured) answers /assets/x.js with index.html,
          // and caching that would keep the app broken after the fix lands.
          const type = res && res.headers.get('content-type')
          const looksLikeFallback =
            /\.(js|css|json|png|svg|webmanifest)$/.test(new URL(req.url).pathname) &&
            type && type.includes('text/html')
          if (res && res.status === 200 && !looksLikeFallback) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
          }
          return res
        })
        .catch(() => hit || caches.match('./index.html'))
      return hit || fresh
    }),
  )
})
