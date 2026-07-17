/* pwa.js — PWA 离线支持 */
(function(){
'use strict';

/* ── Helpers ── */
function ce(tag, cls, html){ var e = document.createElement(tag); if(cls) e.className = cls; if(html) e.innerHTML = html; return e; }

/* ── Service Worker Registration ── */
function registerServiceWorker(){
  if(!('serviceWorker' in navigator)) return;
  var swPath = detectSWPath();
  navigator.serviceWorker.register(swPath, {scope: detectSWScope()})
    .then(function(reg){
      console.log('[PWA] Service Worker registered, scope:', reg.scope);
      reg.addEventListener('updatefound', function(){
        var newWorker = reg.installing;
        if(newWorker){
          newWorker.addEventListener('statechange', function(){
            if(newWorker.state === 'activated'){
              showUpdateToast();
            }
          });
        }
      });
    })
    .catch(function(err){
      console.warn('[PWA] SW registration failed:', err);
    });

  var deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', function(e){
    e.preventDefault();
    deferredPrompt = e;
    showInstallButton(deferredPrompt);
  });
  window.addEventListener('appinstalled', function(){
    deferredPrompt = null;
    console.log('[PWA] App installed');
  });
}

function detectSWPath(){
  var depth = location.pathname.split('/').length - 2;
  var prefix = '';
  for(var i = 0; i < depth; i++) prefix += '../';
  return prefix + 'sw.js';
}

function detectSWScope(){
  var path = location.pathname;
  var idx = path.indexOf('/site/');
  if(idx !== -1) return path.substring(0, idx + 6);
  return '/';
}

function showUpdateToast(){
  var toast = ce('div');
  toast.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:10003;'
    + 'background:var(--accent,#6c8aff);color:#fff;padding:12px 24px;border-radius:12px;'
    + 'font-size:.88rem;box-shadow:0 8px 24px rgba(0,0,0,.3);cursor:pointer;display:flex;align-items:center;gap:10px;';
  toast.innerHTML = '&#128260; 新版本已就绪，点击刷新页面';
  toast.onclick = function(){ location.reload(); };
  document.body.appendChild(toast);
  setTimeout(function(){ if(toast.parentNode) toast.parentNode.removeChild(toast); }, 8000);
}

function showInstallButton(prompt){
  if(window.matchMedia('(display-mode: standalone)').matches) return;
  var btn = ce('button');
  btn.style.cssText = 'position:fixed;bottom:12px;right:80px;z-index:99;'
    + 'padding:8px 18px;border-radius:10px;border:1px solid var(--accent,#6c8aff);'
    + 'background:var(--card,#1a1d27);color:var(--accent,#6c8aff);font-size:.85rem;font-weight:600;'
    + 'cursor:pointer;box-shadow:0 4px 15px rgba(0,0,0,.25);transition:all .2s;';
  btn.innerHTML = '&#128229; 安装应用';
  btn.onmouseover = function(){ btn.style.transform = 'scale(1.05)'; };
  btn.onmouseout = function(){ btn.style.transform = ''; };
  btn.onclick = function(){
    prompt.prompt();
    prompt.userChoice.then(function(choice){
      if(choice.outcome === 'accepted'){
        btn.parentNode.removeChild(btn);
      }
    });
  };
  document.body.appendChild(btn);
  setTimeout(function(){ if(btn.parentNode) btn.parentNode.removeChild(btn); }, 15000);
}

/* ── Init ── */
function init(){
  /* Inject PWA manifest link if missing */
  if(!document.querySelector('link[rel="manifest"]')){
    var depth = location.pathname.split('/').length - 2;
    var prefix = '';
    for(var i = 0; i < depth; i++) prefix += '../';
    var link = document.createElement('link');
    link.rel = 'manifest';
    link.href = prefix + 'manifest.json';
    document.head.appendChild(link);
  }
  registerServiceWorker();
}

if(document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', init); }
else{ init(); }

})();
