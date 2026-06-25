// === Page Search Module ===
// Adds in-page search with highlighting for static HTML pages

(function(){
  var SIDEBAR_W = 260;
  // Detect sidebar width from CSS variable
  try {
    var v = getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w');
    if(v) SIDEBAR_W = parseInt(v) || 260;
  } catch(e){}

  // Create search UI
  var container = document.createElement('div');
  container.id = 'pageSearch';
  container.style.cssText = 'position:fixed;top:8px;left:calc(' + SIDEBAR_W + 'px + 12px);z-index:95;display:none;align-items:center;gap:6px;background:var(--card,#1e293b);border:1px solid var(--border,#334155);border-radius:10px;padding:6px 10px;box-shadow:0 4px 16px rgba(0,0,0,.2);';
  container.innerHTML = '<input type="text" id="pageSearchInput" placeholder="搜索本页..." style="border:none;background:transparent;color:var(--text,#e2e8f0);font-size:13px;outline:none;width:180px;padding:2px 0;">'
    + '<span id="pageSearchCount" style="font-size:11px;color:var(--text2,#94a3b8);white-space:nowrap;"></span>'
    + '<button onclick="pageSearchPrev()" style="background:none;border:none;color:var(--text2,#94a3b8);cursor:pointer;font-size:14px;padding:2px;" title="上一个">&#9650;</button>'
    + '<button onclick="pageSearchNext()" style="background:none;border:none;color:var(--text2,#94a3b8);cursor:pointer;font-size:14px;padding:2px;" title="下一个">&#9660;</button>'
    + '<button onclick="pageSearchClear()" style="background:none;border:none;color:var(--text2,#94a3b8);cursor:pointer;font-size:14px;padding:2px;" title="关闭">&times;</button>';
  document.body.appendChild(container);

  var _matches = [];
  var _current = -1;
  var _query = '';

  document.getElementById('pageSearchInput').addEventListener('input', function(e){
    pageSearch(e.target.value);
  });
  document.getElementById('pageSearchInput').addEventListener('keydown', function(e){
    if(e.key === 'Enter'){ e.shiftKey ? pageSearchPrev() : pageSearchNext(); }
  });

  function pageSearch(q){
    pageSearchClearHighlights();
    _matches = [];
    _current = -1;
    _query = q;
    if(!q || q.length < 1){
      document.getElementById('pageSearchCount').textContent = '';
      return;
    }
    // Search through main content only (skip sidebar/nav)
    var main = document.querySelector('.main, .content, main, #content') || document.body;
    var tree = document.createTreeWalker(main, NodeFilter.SHOW_TEXT, null, false);
    var lcq = q.toLowerCase();
    while(tree.nextNode()){
      var node = tree.currentNode;
      var lc = node.textContent.toLowerCase();
      var idx = lc.indexOf(lcq);
      if(idx >= 0){
        // Split text node and wrap match in <mark>
        var before = node.splitText(idx);
        var after = before.splitText(q.length);
        var mark = document.createElement('mark');
        mark.className = 'psm';
        mark.style.cssText = 'background:#fbbf24;color:#000;border-radius:2px;padding:0 1px;';
        mark.textContent = before.textContent;
        before.parentNode.replaceChild(mark, before);
        _matches.push(mark);
      }
    }
    document.getElementById('pageSearchCount').textContent = _matches.length > 0 ? (_matches.length + ' 个结果') : '无结果';
    if(_matches.length > 0){ _current = 0; highlightCurrent(); }
  }

  function pageSearchNext(){
    if(_matches.length === 0) return;
    _current = (_current + 1) % _matches.length;
    highlightCurrent();
  }
  function pageSearchPrev(){
    if(_matches.length === 0) return;
    _current = (_current - 1 + _matches.length) % _matches.length;
    highlightCurrent();
  }

  function highlightCurrent(){
    _matches.forEach(function(m, i){
      m.style.background = i === _current ? '#f97316' : '#fbbf24';
      m.style.outline = i === _current ? '2px solid #f97316' : 'none';
    });
    _matches[_current].scrollIntoView({behavior:'smooth', block:'center'});
    document.getElementById('pageSearchCount').textContent = (_current+1) + '/' + _matches.length;
  }

  function pageSearchClearHighlights(){
    document.querySelectorAll('mark.psm').forEach(function(m){
      var text = document.createTextNode(m.textContent);
      m.parentNode.replaceChild(text, m);
    });
    // Normalize merged text nodes
    document.querySelectorAll('.main, .content, main, #content').forEach(function(el){ el.normalize(); });
    _matches = [];
    _current = -1;
  }

  function pageSearchClear(){
    pageSearchClearHighlights();
    document.getElementById('pageSearch').style.display = 'none';
    document.getElementById('pageSearchInput').value = '';
    document.getElementById('pageSearchCount').textContent = '';
  }

  // Expose globally
  window.pageSearchNext = pageSearchNext;
  window.pageSearchPrev = pageSearchPrev;
  window.pageSearchClear = pageSearchClear;

  // Keyboard shortcut: Ctrl+F or / to open search
  document.addEventListener('keydown', function(e){
    if((e.ctrlKey && e.key === 'f') || (e.key === '/' && !e.target.matches('input,textarea'))){
      e.preventDefault();
      document.getElementById('pageSearch').style.display = 'flex';
      document.getElementById('pageSearchInput').focus();
    }
    if(e.key === 'Escape') pageSearchClear();
  });
})();
