const CACHE_NAME = 'ent-report-system-v1-gh'; // GitHub Pages Deployment Version
const FILES_TO_CACHE = [
    'index.html',
    'manifest.json',
    'nasalEndoscopy.html', 
    'laryngealEndoscopy.html',
    'settings.html',
    'function/index.js',
    'style/index.css',
    'js/lib/jspdf.umd.min.js',
    'js/lib/html2canvas.min.js',
    'js/lib/cropper.min.js',
    'css/lib/cropper.min.css',
    'image/ent-logo.webp',
    'image/rmci-logo.png',
    'image/cumc-logo.png',
    // NEW: Add FFmpeg.wasm files for in-browser video conversion
    'https://unpkg.com/@ffmpeg/ffmpeg@0.11.6/dist/ffmpeg.min.js',
    'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js',
    'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.wasm',
    'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.worker.js'
];

// Install service worker: Caches all essential files
self.addEventListener('install', (evt) => {
    evt.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[ServiceWorker] Pre-caching offline pages');
            return cache.addAll(FILES_TO_CACHE);
        })
    );
});

// Activate service worker: Removes old caches
self.addEventListener('activate', (evt) => {
    evt.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                if (key !== CACHE_NAME) {
                    console.log('[ServiceWorker] Removing old cache', key);
                    return caches.delete(key);
                }
            }));
        })
    );
    self.clients.claim();
});

// Fetch resources: Serves files from cache first
self.addEventListener('fetch', (evt) => {
    // For FFmpeg CDN files, use a stale-while-revalidate strategy
    if (evt.request.url.startsWith('https://unpkg.com/')) {
        evt.respondWith(
            caches.open(CACHE_NAME).then((cache) => {
                return cache.match(evt.request).then((cachedResponse) => {
                    const fetchPromise = fetch(evt.request).then((networkResponse) => {
                        cache.put(evt.request, networkResponse.clone());
                        return networkResponse;
                    });
                    // Return cached response immediately, while the fetch happens in the background.
                    return cachedResponse || fetchPromise;
                });
            })
        );
        return; // End execution for this request
    }

    // For all other local files, use the cache-first strategy
    evt.respondWith(
        caches.match(evt.request).then((response) => {
            return response || fetch(evt.request);
        })
    );
});

// Listen for message to skip waiting (trigger update)
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});