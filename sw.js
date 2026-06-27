/* sw.js — Service Worker for 期末复习 PWA */
'use strict';

var CACHE_NAME = 'exam-review-v1';
var STATIC_CACHE = 'exam-review-static-v1';
var HTML_CACHE = 'exam-review-html-v1';

/* Static assets to pre-cache on install */
var PRECACHE_URLS = [
  './',
  './theme.css',
  './index.css',
  './index.js',
  './wrong-book.js',
  './formula-ref.js',
  './mastery.js',
  './random-quiz.js',
  './cross-links.js',
  './print-mode.js',
  './pwa.js',
  './stats.js',
  './search.js',
  './remember.js',
  './preview.js',
  './exam.js',
  './manifest.json'
];

/* Install: pre-cache static assets */
self.addEventListener('install', function(event){
  event.waitUntil(
    caches.open(STATIC_CACHE).then(function(cache){
      console.log('[SW] Pre-caching static assets');
      return cache.addAll(PRECACHE_URLS);
    }).then(function(){
      return self.skipWaiting();
    })
  );
});

/* Activate: clean up old caches */
self.addEventListener('activate', function(event){
  var currentCaches = [STATIC_CACHE, HTML_CACHE];
  event.waitUntil(
    caches.keys().then(function(cacheNames){
      return Promise.all(
        cacheNames.filter(function(name){
          return currentCaches.indexOf(name) === -1;
        }).map(function(name){
          console.log('[SW] Deleting old cache:', name);
          return caches.delete(name);
        })
      );
    }).then(function(){
      return self.clients.claim();
    })
  );
});

/* Fetch strategy:
   - HTML pages: Network First (try network, fall back to cache)
   - Static assets (JS, CSS, images): Cache First (use cache, update in background)
   - PDFs and other resources: Cache First with fallback
*/
self.addEventListener('fetch', function(event){
  var url = new URL(event.request.url);

  /* Skip non-GET requests */
  if(event.request.method !== 'GET') return;

  /* Skip cross-origin requests (CDN resources like KaTeX, busuanzi, GTM) */
  if(url.origin !== location.origin) return;

  /* HTML pages: Network First */
  if(event.request.headers.get('accept') &&
     event.request.headers.get('accept').indexOf('text/html') !== -1){
    event.respondWith(networkFirst(event.request));
    return;
  }

  /* Static assets: Cache First */
  if(isStaticAsset(url.pathname)){
    event.respondWith(cacheFirst(event.request));
    return;
  }

  /* Everything else: Cache First */
  event.respondWith(cacheFirst(event.request));
});

function isStaticAsset(pathname){
  var ext = pathname.split('.').pop().toLowerCase();
  var staticExts = ['js','css','png','jpg','jpeg','gif','svg','ico','woff','woff2','ttf','eot','json','webp'];
  return staticExts.indexOf(ext) !== -1;
}

/* Cache First strategy */
function cacheFirst(request){
  return caches.match(request).then(function(cachedResponse){
    if(cachedResponse){
      /* Update cache in background (stale-while-revalidate) */
      var fetchPromise = fetch(request).then(function(networkResponse){
        if(networkResponse && networkResponse.status === 200){
          caches.open(STATIC_CACHE).then(function(cache){
            cache.put(request, networkResponse);
          });
        }
      }).catch(function(){});
      return cachedResponse;
    }
    /* Not in cache, fetch from network */
    return fetch(request).then(function(response){
      if(!response || response.status !== 200) return response;
      var responseClone = response.clone();
      caches.open(STATIC_CACHE).then(function(cache){
        cache.put(request, responseClone);
      });
      return response;
    }).catch(function(){
      /* Offline and not in cache — return fallback */
      return new Response('离线状态，该内容暂不可用', {
        status: 503,
        statusText: 'Service Unavailable',
        headers: new Headers({'Content-Type': 'text/plain; charset=utf-8'})
      });
    });
  });
}

/* Network First strategy */
function networkFirst(request){
  return fetch(request).then(function(response){
    if(!response || response.status !== 200) return response;
    var responseClone = response.clone();
    caches.open(HTML_CACHE).then(function(cache){
      cache.put(request, responseClone);
    });
    return response;
  }).catch(function(){
    return caches.match(request).then(function(cachedResponse){
      if(cachedResponse) return cachedResponse;
      /* Return offline page */
      return new Response(generateOfflinePage(), {
        status: 200,
        headers: new Headers({'Content-Type': 'text/html; charset=utf-8'})
      });
    });
  });
}

function generateOfflinePage(){
  return '<!DOCTYPE html>'
    + '<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">'
    + '<title>离线 - 期末复习</title>'
    + '<style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;display:flex;align-items:center;justify-content:center;'
    + 'min-height:100vh;margin:0;background:#0c0e1a;color:#e8eaf0;text-align:center;padding:20px}'
    + '.box{max-width:400px}h1{font-size:3rem;margin-bottom:16px}p{color:#9ba1b8;font-size:1rem;line-height:1.6}'
    + 'a{display:inline-block;margin-top:20px;padding:10px 28px;background:#6c8aff;color:#fff;border-radius:10px;text-decoration:none;font-weight:600}</style></head>'
    + '<body><div class="box"><h1>&#128268;</h1><h2 style="margin:0 0 12px">暂无网络连接</h2>'
    + '<p>当前处于离线状态，该页面尚未缓存。<br>已缓存的页面仍可正常访问。</p>'
    + '<a href="./">返回首页</a></div></body></html>';
}
