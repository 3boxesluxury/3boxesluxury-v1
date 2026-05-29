// 3 BOXES LUXURY - Service Worker for PWA offline support
// Cache version - increment this when deploying updates
const CACHE_VERSION = 'v4';
const CACHE_NAME = '3boxes-luxury-' + CACHE_VERSION;
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-192.png',
  '/icons/icon-maskable-512.png',
];

// Maximum age for cached static assets (1 hour in milliseconds)
const MAX_CACHE_AGE = 60 * 60 * 1000;

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('SW: Some assets failed to cache during install:', err);
        return Promise.resolve();
      });
    })
  );
  self.skipWaiting();
});

// Handle messages from the page (e.g., SKIP_WAITING)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Helper: check if cached response is stale
function isStale(cachedResponse) {
  if (!cachedResponse) return true;
  const dateHeader = cachedResponse.headers.get('sw-cache-time');
  if (!dateHeader) return true;
  const cacheTime = parseInt(dateHeader, 10);
  return (Date.now() - cacheTime) > MAX_CACHE_AGE;
}

// Helper: fetch and cache with timestamp
function fetchAndCache(request, cache) {
  return fetch(request).then((response) => {
    if (response.ok) {
      // Clone and add timestamp header before caching
      const headers = new Headers(response.headers);
      headers.set('sw-cache-time', Date.now().toString());
      const body = response.clone().body;
      const timestampedResponse = new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: headers,
      });
      cache.put(request, timestampedResponse);
    }
    return response;
  });
}

// Fetch event
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip API calls - always go to network
  if (url.pathname.startsWith('/api/')) return;

  // Skip chrome-extension and other non-http
  if (!url.protocol.startsWith('http')) return;

  // Skip service worker itself - always fetch fresh
  if (url.pathname === '/sw.js') return;

  // For navigation requests (HTML pages) - network first, cache fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const cloned = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, cloned);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(request).then((cached) => {
            return cached || caches.match('/');
          });
        })
    );
    return;
  }

  // For static assets - STALE-WHILE-REVALIDATE strategy
  // Serve cached version immediately (if available), but also fetch fresh version in background
  if (
    url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|gif|ico|woff2?|ttf)$/) ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/images/') ||
    url.pathname.startsWith('/_next/static/')
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match(request).then((cached) => {
          // Always try to fetch fresh version in the background
          const fetchPromise = fetchAndCache(request, cache).catch(() => {
            // Network failed - that's okay, we may have cached version
          });

          if (cached) {
            // If cached version is stale, wait for network response instead
            if (isStale(cached)) {
              return fetchPromise.then((networkResponse) => {
                return networkResponse || cached;
              }).catch(() => cached);
            }
            // Return cached immediately, update in background
            return cached;
          }

          // No cache - wait for network
          return fetchPromise.then((networkResponse) => {
            return networkResponse || new Response('', { status: 404 });
          }).catch(() => {
            // Offline fallback for images
            if (url.pathname.match(/\.(png|jpg|jpeg|gif|svg)$/)) {
              return new Response(
                '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect fill="#1c1917" width="200" height="200"/><text fill="#d4a437" font-size="14" x="50%" y="50%" text-anchor="middle" dy=".3em">3 BOXES</text></svg>',
                { headers: { 'Content-Type': 'image/svg+xml' } }
              );
            }
            return new Response('', { status: 404 });
          });
        });
      })
    );
    return;
  }

  // For everything else - network first
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, cloned);
          });
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
