const CACHE_NAME = 'aquarun-v1'

const STATIC_ASSETS = [
  '/',
  '/index.html',
]

// Install — cache the app shell
self.addEventListener('install', event => {
  console.log('Service Worker installing...')
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS)
    })
  )
  self.skipWaiting()
})

// Activate — clean old caches
self.addEventListener('activate', event => {
  console.log('Service Worker activating...')
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    )
  )
  self.clients.claim()
})

// Fetch — serve from cache when offline
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)

  // Skip Supabase API calls — never cache these
  if (url.hostname.includes('supabase.co')) return

  // For navigation requests (page loads) — serve index.html from cache
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // If online — update cache and return response
          const clone = response.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone))
          return response
        })
        .catch(() => {
          // If offline — serve from cache
          return caches.match('/index.html')
        })
    )
    return
  }

  // For JS/CSS/assets — cache first, then network
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached
      return fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone))
        }
        return response
      }).catch(() => cached)
    })
  )
})