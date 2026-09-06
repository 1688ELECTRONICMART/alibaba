const CACHE_NAME = '1688-mart-v3';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './manifest.json',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css'
];

// Install Service Worker
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
});

// Activate Service Worker
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
            );
        })
    );
});

// Fetch Assets
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            return cachedResponse || fetch(event.request);
        })
    );
});

// Hot Update Handling
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'HOT_PATCH') {
        const newCacheName = '1688-mart-v' + event.data.version;
        caches.open(newCacheName).then((cache) => {
            return cache.addAll(ASSETS).then(() => {
                // Delete old caches
                return caches.keys().then((keys) => {
                    return Promise.all(
                        keys.filter((key) => key !== newCacheName).map((key) => caches.delete(key))
                    );
                });
            });
        });
    }
});
