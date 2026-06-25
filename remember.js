// === Scroll Position Memory ===
// Saves scroll position periodically and on page unload.
// Restores position on page load.

(function(){
  var KEY = 'scroll_' + location.pathname.replace(/[^a-zA-Z0-9]/g,'_').substring(0,40);
  var INTERVAL = 10000; // save every 10 seconds

  // Restore position on load
  var saved = parseInt(localStorage.getItem(KEY));
  if(saved && saved > 200){
    // Delay restore to let page render
    setTimeout(function(){ window.scrollTo(0, saved); }, 100);
    // Second restore for pages with async content (KaTeX, MathJax)
    setTimeout(function(){
      var s = parseInt(localStorage.getItem(KEY));
      if(s) window.scrollTo(0, s);
    }, 800);
  }

  // Save periodically
  setInterval(function(){
    if(window.scrollY > 100) localStorage.setItem(KEY, window.scrollY);
  }, INTERVAL);

  // Save on page unload
  window.addEventListener('beforeunload', function(){
    if(window.scrollY > 100) localStorage.setItem(KEY, window.scrollY);
  });

  // Save on visibility change (tab switch / minimize)
  document.addEventListener('visibilitychange', function(){
    if(document.hidden && window.scrollY > 100){
      localStorage.setItem(KEY, window.scrollY);
    }
  });

  // Show restore indicator briefly
  if(saved && saved > 200){
    var el = document.createElement('div');
    el.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);background:rgba(30,41,59,.9);color:#e2e8f0;padding:6px 16px;border-radius:20px;font-size:.78rem;z-index:9999;pointer-events:none;opacity:0;transition:opacity .4s';
    el.textContent = '↪ 已恢复上次阅读位置'; // ↩ 已恢复上次阅读位置
    document.body.appendChild(el);
    setTimeout(function(){ el.style.opacity = '1'; }, 200);
    setTimeout(function(){ el.style.opacity = '0'; }, 2200);
    setTimeout(function(){ el.remove(); }, 2600);
  }
})();
