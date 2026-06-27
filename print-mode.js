/* print-mode.js — 打印优化模式 */
(function(){
'use strict';

/* ── Inject CSS ── */
var css = ''
  + '.print-fab{position:fixed;z-index:98;width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 15px rgba(0,0,0,.3);transition:all .2s;font-size:1.2em;bottom:250px;right:30px;background:var(--card2,#22263a);color:var(--text,#e8eaf0);border:1px solid var(--border,#2d3436)}'
  + '.print-fab:hover{transform:scale(1.1);border-color:var(--accent,#6c8aff)}'
  + 'body.f2-print-mode{background:#fff!important;color:#1a1a1a!important}'
  + 'body.f2-print-mode .main,main{margin:0!important;padding:16px!important;max-width:100%!important}'
  + 'body.f2-print-mode h1{color:#111!important}'
  + 'body.f2-print-mode h2,body.f2-print-mode h3,body.f2-print-mode h4{color:#1a1a1a!important;page-break-after:avoid;break-after:avoid}'
  + 'body.f2-print-mode nav,body.f2-print-mode .sidebar,body.f2-print-mode .sidebar-overlay,body.f2-print-mode .mobile-menu-btn,body.f2-print-mode .back-top,body.f2-print-mode .features-fab,body.f2-print-mode .rq-fab,body.f2-print-mode .print-fab,body.f2-print-mode .theme-toggle,body.f2-print-mode [style*="position:fixed"],body.f2-print-mode .f-modal,body.f2-print-mode .rq-overlay,body.f2-print-mode .kl-tip,body.f2-print-mode .progress-bar,body.f2-print-mode .sg-overlay,body.f2-print-mode .guide-overlay,body.f2-print-mode #busuanzi_container_site_pv,body.f2-print-mode #busuanzi_container_page_pv,body.f2-print-mode .ux-marker,body.f2-print-mode .ux-back-to-marker,body.f2-print-mode .ux-shortcut-btn,body.f2-print-mode .cross-fab,body.f2-print-mode .formula-fab,body.f2-print-mode .mastery-fab{display:none!important}'
  + 'body.f2-print-mode .card,body.f2-print-mode .section,body.f2-print-mode .quiz-container{background:#fff!important;border:1px solid #ddd!important;box-shadow:none!important;page-break-inside:avoid;break-inside:avoid}'
  + 'body.f2-print-mode .kb{background:#f7f7f7!important;border-left:4px solid #2563eb!important}'
  + 'body.f2-print-mode .kb th{background:#2563eb!important;color:#fff!important}'
  + 'body.f2-print-mode .kb td{border:1px solid #ddd!important}'
  + 'body.f2-print-mode .kb .formula{background:#f0f4ff!important;border:1px solid #c7d2fe!important}'
  + 'body.f2-print-mode .kb .example{background:#f0fdf4!important;border:1px solid #86efac!important}'
  + 'body.f2-print-mode .kb .note{background:#fffbeb!important;border-left:3px solid #f59e0b!important;color:#92400e!important}'
  + 'body.f2-print-mode .ref-card{background:#f9fafb!important;border:1px solid #ddd!important}'
  + 'body.f2-print-mode .keypoint{background:#f0f4ff!important;border:1px solid #93c5fd!important}'
  + 'body.f2-print-mode .warning{background:#fffbeb!important;border:1px solid #fbbf24!important}'
  + 'body.f2-print-mode .example{background:#f0fdf4!important;border:1px solid #86efac!important}'
  + 'body.f2-print-mode .formula{background:#f0f4ff!important;border:1px solid #c7d2fe!important}'
  + 'body.f2-print-mode .quiz-correct{background:#dcfce7!important;color:#166534!important;border:1px solid #86efac!important}'
  + 'body.f2-print-mode .quiz-wrong{background:#fef2f2!important;color:#991b1b!important;border:1px solid #fca5a5!important}'
  + 'body.f2-print-mode .tag-ch{background:#dbeafe!important;color:#1e40af!important}'
  + 'body.f2-print-mode .tag-t{background:#dcfce7!important;color:#166534!important}'
  + 'body.f2-print-mode .tag-f{background:#fef3c7!important;color:#92400e!important}'
  + 'body.f2-print-mode .tag-z{background:#ede9fe!important;color:#5b21b6!important}'
  + 'body.f2-print-mode .exam-banner{background:#eff6ff!important;border:1px solid #93c5fd!important}'
  + 'body.f2-print-mode pre{white-space:pre-wrap;word-wrap:break-word;background:#f5f5f5!important;border:1px solid #ddd!important}'
  + 'body.f2-print-mode code{background:#f0f0f0!important}'
  + 'body.f2-print-mode table{width:100%!important}'
  + 'body.f2-print-mode img,body.f2-print-mode svg{max-width:100%!important;page-break-inside:avoid}'
  + 'body.f2-print-mode a{color:#2563eb!important;text-decoration:underline!important}'
  + 'body.f2-print-mode .collapsible-content{max-height:none!important;opacity:1!important;display:block!important}'
  + 'body.f2-print-mode .section.collapsed .section-body{max-height:none!important;opacity:1!important;padding-bottom:20px!important}'
  + 'body.f2-print-mode .katex{color:#000!important}'
  + 'body.f2-print-mode .section-divider{display:none!important}'
  + '@media print{'
  + 'body.f2-print-mode .nav-toggle{display:none!important}'
  + 'body.f2-print-mode .exam-mark{border:1px solid #fca5a5!important;background:#fef2f2!important}'
  + '}';

var styleEl = document.createElement('style');
styleEl.textContent = css;
document.head.appendChild(styleEl);

/* ── Helpers ── */
function ce(tag, cls, html){ var e = document.createElement(tag); if(cls) e.className = cls; if(html) e.innerHTML = html; return e; }

/* ── Print Functions ── */
function togglePrintMode(){
  document.body.classList.toggle('f2-print-mode');
}

function printPage(){
  var body = document.body;
  var wasPrintMode = body.classList.contains('f2-print-mode');
  if(!wasPrintMode) body.classList.add('f2-print-mode');
  setTimeout(function(){
    window.print();
    setTimeout(function(){
      if(!wasPrintMode) body.classList.remove('f2-print-mode');
    }, 500);
  }, 100);
}

/* ── Create FAB & Init ── */
function init(){
  var fab = ce('button', 'print-fab');
  fab.innerHTML = '&#128424;';
  fab.title = '打印优化模式';
  fab.onclick = function(){ printPage(); };
  document.body.appendChild(fab);
}

if(document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', init); }
else{ init(); }

})();
