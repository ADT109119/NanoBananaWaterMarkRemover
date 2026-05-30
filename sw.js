/**
 * Nano Banana Watermark Remover - Service Worker
 * 提供離線支援和快取策略
 */

const CACHE_NAME = 'banana-remover-v1.4.5';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/styles.css',
    '/app.js',
    '/worker.js',
    '/assets/mask_18.png',
    '/assets/mask_48.png',
    '/assets/mask_96.png',
    '/assets/banana.png'
];

// 安裝事件 - 快取資源
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('🍌 Caching assets...');
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .then(() => self.skipWaiting())
    );
});

// 啟動事件 - 清理舊快取
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            );
        }).then(() => self.clients.claim())
    );
});

// 請求攔截 - 快取優先策略
self.addEventListener('fetch', (event) => {
    // 只處理 GET 請求
    if (event.request.method !== 'GET') return;
    
    // 忽略外部請求
    if (!event.request.url.startsWith(self.location.origin)) return;
    
    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                if (cachedResponse) {
                    return cachedResponse;
                }
                
                return fetch(event.request).then((response) => {
                    // 不快取非成功的請求
                    if (!response || response.status !== 200) {
                        return response;
                    }
                    
                    // 快取新資源
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                    
                    return response;
                });
            })
    );
});
