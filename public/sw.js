'use strict';

var VERSION = 'v4';
var HTML_CACHE = 'exam-review-html-' + VERSION;
var ASSET_CACHE = 'exam-review-asset-' + VERSION;

self.addEventListener('install', function (event) {
  // 不预缓存任何东西。跳过 waiting 让新 SW 尽快接管。
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', function (event) {
  var keep = [HTML_CACHE, ASSET_CACHE];
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(
        names.filter(function (n) {
          return n.indexOf('exam-review-') === 0 && keep.indexOf(n) === -1;
        })
             .map(function (n) { return caches.delete(n); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  if (url.origin !== location.origin || req.headers.has('range')) return;
  if (/^\/(?:api|health|metrics)(?:\/|$)/.test(url.pathname)) return;

  var isHTML = req.headers.get('accept') || '';
  if (req.mode === 'navigate' || isHTML.indexOf('text/html') !== -1) {
    event.respondWith(networkFirst(event));
    return;
  }

  if (/^\/assets\/[^/]+-[\w-]{8}\.[^/]+$/.test(url.pathname)) {
    event.respondWith(cacheFirst(event));
    return;
  }

  if (isStaticAsset(url.pathname)) {
    event.respondWith(staleWhileRevalidate(event));
    return;
  }

  // 其余同源 GET（如 search_index.json）：Network-First 落缓存
  event.respondWith(networkFirst(event));
});

function isStaticAsset(pathname) {
  var ext = pathname.split('.').pop().toLowerCase();
  return ['js', 'css', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'ico',
          'woff', 'woff2', 'ttf', 'eot', 'webp', 'avif'].indexOf(ext) !== -1;
}

async function fetchAndCache(event, cacheName) {
  var response = await fetch(event.request);
  var policy = response.headers.get('cache-control') || '';
  if (response.status === 200 && response.type === 'basic' && !/\b(no-store|private)\b/i.test(policy)) {
    var copy = response.clone();
    event.waitUntil(caches.open(cacheName).then(function (cache) {
      return cache.put(event.request, copy);
    }).catch(function () {}));
  }
  return response;
}

function matchCache(cacheName, request) {
  return caches.match(request, { cacheName: cacheName }).catch(function () {});
}

async function cacheFirst(event) {
  return (await matchCache(ASSET_CACHE, event.request)) || fetchAndCache(event, ASSET_CACHE);
}

async function staleWhileRevalidate(event) {
  var cached = await matchCache(ASSET_CACHE, event.request);
  var update = fetchAndCache(event, ASSET_CACHE);
  if (!cached) return update;
  event.waitUntil(update.catch(function () {}));
  return cached;
}

async function networkFirst(event) {
  try {
    return await fetchAndCache(event, HTML_CACHE);
  } catch (_) {
    var cached = await matchCache(HTML_CACHE, event.request);
    if (cached) return cached;
    if (event.request.mode === 'navigate') return generateOfflinePage();
    return new Response('离线状态，该内容暂不可用', {
      status: 503,
      headers: new Headers({ 'Content-Type': 'text/plain; charset=utf-8' }),
    });
  }
}

function generateOfflinePage() {
  return new Response(
    '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1.0">'
    + '<title>离线 - 期末复习</title>'
    + '<style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;'
    + 'display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;'
    + 'background:#0c0e1a;color:#e8eaf0;text-align:center;padding:20px}'
    + '.box{max-width:420px}h1{font-size:3rem;margin-bottom:16px}'
    + 'p{color:#9ba1b8;font-size:1rem;line-height:1.7}'
    + 'a{display:inline-block;margin-top:22px;padding:11px 30px;background:#6c8aff;color:#fff;'
    + 'border-radius:10px;text-decoration:none;font-weight:600}</style></head>'
    + '<body><div class="box"><h1>&#128268;</h1>'
    + '<h2 style="margin:0 0 14px">暂无网络连接</h2>'
    + '<p>当前处于离线状态，该页面尚未缓存。<br>已访问过的页面仍可正常浏览。</p>'
    + '<a href="./">返回首页</a></div></body></html>',
    { status: 200, headers: new Headers({ 'Content-Type': 'text/html; charset=utf-8' }) }
  );
}
