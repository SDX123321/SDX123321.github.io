/* print-mode.js — 打印优化模式 */
(function(){
'use strict';

/* ── Inject CSS ── */
var css = ''
  + '.print-fab{position:fixed;z-index:98;width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 15px rgba(0,0,0,.3);transition:all .2s;font-size:1.2em;bottom:250px;right:30px;background:var(--card2,#22263a);color:var(--text,#e8eaf0);border:1px solid var(--border,#2d3436)}'
  + '.print-fab:hover{transform:scale(1.1);border-color:var(--accent,#6c8aff)}'
  + '@media print{'
  + 'body.f2-print-mode{background:#fff!important;color:#000!important}'
  + 'body.f2-print-mode *{background:transparent!important;color:#000!important;border-color:#ccc!important;box-shadow:none!important}'
  + 'body.f2-print-mode nav,.f2-print-mode .sidebar,.f2-print-mode .sidebar-overlay,.f2-print-mode .mobile-menu-btn,.f2-print-mode .back-top,.f2-print-mode .features-fab,.f2-print-mode .rq-fab,.f2-print-mode .print-fab,.f2-print-mode .theme-toggle,.f2-print-mode [style*="position:fixed"],.f2-print-mode .f-modal,.f2-print-mode .rq-overlay,.f2-print-mode .kl-tip,.f2-print-mode .progress-bar,.f2-print-mode .sg-overlay,.f2-print-mode .guide-overlay,.f2-print-mode #busuanzi_container_site_pv,.f2-print-mode #busuanzi_container_page_pv{display:none!important}'
  + 'body.f2-print-mode .main,main{margin:0!important;padding:0!important;max-width:100%!important}'
  + 'body.f2-print-mode h1,body.f2-print-mode h2,body.f2-print-mode h3,body.f2-print-mode h4{page-break-after:avoid;break-after:avoid}'
  + 'body.f2-print-mode .card,body.f2-print-mode .quiz-container{page-break-inside:avoid;break-inside:avoid}'
  + 'body.f2-print-mode pre{white-space:pre-wrap;word-wrap:break-word}'
  + 'body.f2-print-mode table{width:100%!important}'
  + '}';

var styleEl = document.createElement('style');
styleEl.textContent = css;
document.head.appendChild(styleEl);

/* ── Helpers ── */
function ce(tag, cls, html){ var e = document.createElement(tag); if(cls) e.className = cls; if(html) e.innerHTML = html; return e; }

/* ── Print Functions ── */
function togglePrintMode(){
  var body = document.body;
  if(body.classList.contains('f2-print-mode')){
    body.classList.remove('f2-print-mode');
  } else {
    body.classList.add('f2-print-mode');
    body.style.background = '#fff';
    body.style.color = '#000';
  }
}

function printPage(){
  var wasPrintMode = document.body.classList.contains('f2-print-mode');
  if(!wasPrintMode){
    document.body.classList.add('f2-print-mode');
    document.body.style.background = '#fff';
    document.body.style.color = '#000';
  }
  setTimeout(function(){
    window.print();
    setTimeout(function(){
      if(!wasPrintMode){
        document.body.classList.remove('f2-print-mode');
        document.body.style.background = '';
        document.body.style.color = '';
      }
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
