const CACHE_NAME = 'aquarun-v2'

// Install
self.addEventListener('install', event => {
  console.log('SW installing')
  self.skipWaiting()
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.add('/')
    })
  )
})

// Activate
self.addEventListener('activate', event => {
  console.log('SW activating')
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// Fetch
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)

  // Never intercept Supabase calls
  if (url.hostname.includes('supabase.co')) return

  // Never intercept Chrome extension calls
  if (url.protocol === 'chrome-extension:') return

  // For page navigation — network first, fall back to cache
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone()
          caches.open(CACHE_NAME).then(cache => cache.put('/', clone))
          return response
        })
        .catch(() => caches.match('/'))
    )
    return
  }

  // For all other requests (JS, CSS, images) — network first, cache fallback
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok && event.request.method === 'GET') {
          const clone = response.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone))
        }
        return response
      })
      .catch(() => caches.match(event.request))
  )
})