/* random-quiz.js — 随机组卷 */
(function(){
'use strict';

/* ── Inject CSS ── */
var css = ''
  + '.rq-overlay{display:none;position:fixed;top:0;left:0;right:0;bottom:0;z-index:10001;background:rgba(0,0,0,.55);align-items:center;justify-content:center}'
  + '.rq-overlay.show{display:flex}'
  + '.rq-box{background:var(--card,#1a1d27);border-radius:16px;padding:28px;padding-top:80px;max-width:640px;width:92vw;max-height:85vh;overflow-y:auto;border:1px solid var(--border,#2d3436);position:relative;box-shadow:0 12px 40px rgba(0,0,0,.4)}'
  + '.rq-close{position:absolute;top:12px;right:16px;cursor:pointer;font-size:1.3rem;color:var(--text3,#6b7194);background:none;border:none;line-height:1}'
  + '.rq-close:hover{color:var(--text,#e8eaf0)}'
  + '.rq-box h3{margin:0 0 20px;font-size:1.15rem;color:var(--accent2,#a78bfa)}'
  + '.rq-label{display:block;font-size:.88rem;font-weight:600;color:var(--text2,#9ba1b8);margin-bottom:6px}'
  + '.rq-radio-group{display:flex;gap:8px;margin-bottom:18px;flex-wrap:wrap}'
  + '.rq-radio-group label{display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border:1px solid var(--border,#2d3436);border-radius:8px;cursor:pointer;font-size:.88rem;color:var(--text,#e8eaf0);transition:all .2s}'
  + '.rq-radio-group label:has(input:checked){border-color:var(--accent,#6c8aff);background:var(--accent-bg,rgba(108,138,255,.1))}'
  + '.rq-radio-group input{accent-color:var(--accent,#6c8aff)}'
  + '.rq-chk-group{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;margin-bottom:18px}'
  + '.rq-chk-group label{display:flex;align-items:center;gap:6px;padding:8px 12px;border:1px solid var(--border,#2d3436);border-radius:8px;cursor:pointer;font-size:.85rem;color:var(--text,#e8eaf0);transition:all .2s}'
  + '.rq-chk-group label:has(input:checked){border-color:var(--success,#34d399);background:var(--success-bg,rgba(52,211,153,.1))}'
  + '.rq-chk-group input{accent-color:var(--success,#34d399)}'
  + '.rq-btn{padding:10px 24px;border-radius:8px;border:none;font-size:.9rem;font-weight:600;cursor:pointer;transition:all .2s}'
  + '.rq-btn-primary{background:var(--accent,#6c8aff);color:#fff}'
  + '.rq-btn-primary:hover{opacity:.85;transform:translateY(-1px)}'
  + '.rq-btn-secondary{background:var(--card2,#22263a);color:var(--text,#e8eaf0);border:1px solid var(--border,#2d3436)}'
  + '.rq-timer{position:absolute;top:0;left:0;right:0;background:var(--card,#1a1d27);padding:12px 28px;border-bottom:1px solid var(--border,#2d3436);border-radius:16px 16px 0 0;text-align:center;z-index:1;font-weight:700;font-variant-numeric:tabular-nums}'
  + '.rq-timer-text{font-size:1.4rem;font-weight:700;font-variant-numeric:tabular-nums}'
  + '.rq-timer-warn{color:var(--danger,#f87171)}'
  + '.rq-timer-ok{color:var(--success,#34d399)}'
  + '.rq-progress{display:flex;gap:5px;margin:12px 0;flex-wrap:wrap;justify-content:center}'
  + '.rq-dot{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.72rem;font-weight:700;border:2px solid var(--border,#2d3436);color:var(--text3,#6b7194);transition:all .2s}'
  + '.rq-dot.current{border-color:var(--accent,#6c8aff);color:var(--accent,#6c8aff);transform:scale(1.1)}'
  + '.rq-dot.answered{border-color:var(--success,#34d399);background:var(--success-bg,rgba(52,211,153,.15));color:var(--success,#34d399)}'
  + '.rq-qcard{background:var(--card2,#22263a);border-radius:12px;padding:20px;margin:12px 0;border:1px solid var(--border,#2d3436)}'
  + '.rq-q-text{font-weight:600;font-size:.95rem;margin-bottom:14px;color:var(--text,#e8eaf0)}'
  + '.rq-opt{display:block;padding:10px 16px;margin:6px 0;border:1px solid var(--border,#2d3436);border-radius:8px;cursor:pointer;font-size:.88rem;color:var(--text,#e8eaf0);transition:all .2s}'
  + '.rq-opt:hover{border-color:var(--accent,#6c8aff);background:var(--accent-bg,rgba(108,138,255,.06))}'
  + '.rq-opt.selected{border-color:var(--accent,#6c8aff);background:var(--accent-bg2,rgba(108,138,255,.18))}'
  + '.rq-opt.correct{border-color:var(--success,#34d399);background:var(--success-bg,rgba(52,211,153,.15));color:var(--success,#34d399)}'
  + '.rq-opt.wrong{border-color:var(--danger,#f87171);background:var(--danger-bg,rgba(248,113,113,.15));color:var(--danger,#f87171)}'
  + '.rq-score-card{text-align:center;padding:32px 20px}'
  + '.rq-score-num{font-size:3.5rem;font-weight:800;margin:16px 0 8px}'
  + '.rq-score-label{font-size:.95rem;color:var(--text2,#9ba1b8)}'
  + '.rq-nav-btns{display:flex;justify-content:space-between;margin-top:16px}'
  + '.rq-fab{position:fixed;z-index:98;width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 15px rgba(0,0,0,.3);transition:all .2s;font-size:1.2em;bottom:195px;right:30px;background:#f59e0b;color:#fff;border:none}'
  + '.rq-fab:hover{transform:scale(1.1)}'
  + '@media(max-width:900px){.rq-box{padding:20px;padding-top:72px;max-height:92vh}.rq-chk-group{grid-template-columns:repeat(auto-fill,minmax(120px,1fr))}}';

var styleEl = document.createElement('style');
styleEl.textContent = css;
document.head.appendChild(styleEl);

/* ── Helpers ── */
function getLS(k, d){ try{ var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch(e){ return d; } }
function setLS(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); } catch(e){} }
function escHtml(s){ var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
function ce(tag, cls, html){ var e = document.createElement(tag); if(cls) e.className = cls; if(html) e.innerHTML = html; return e; }

function getPageId(){
  var p = location.pathname;
  if(p.indexOf('/probability') !== -1) return 'probability';
  if(p.indexOf('/os') !== -1) return 'os';
  if(p.indexOf('/algorithm') !== -1) return 'algorithm';
  if(p.indexOf('/dsp') !== -1) return 'dsp';
  if(p.indexOf('/calculus') !== -1) return 'calculus';
  if(p.indexOf('/marxism') !== -1) return 'marxism';
  if(p.indexOf('/history') !== -1) return 'history';
  if(p.indexOf('/culture') !== -1) return 'culture';
  if(p.indexOf('/signals') !== -1) return 'signals';
  if(p.indexOf('/physics2') !== -1) return 'physics2';
  return null;
}

/* ── Quiz State ── */
var quizTimer = null;
var quizTimeLeft = 0;
var quizQuestions = [];
var quizAnswers = [];
var quizCurrentIdx = 0;
var quizSubmitted = false;

window.f2ShowRandomQuizModal = showRandomQuizModal;

/* Remove hidden KaTeX mathml annotations so innerHTML shows only rendered output */
function stripKatexMathml(el){
  var clone = el.cloneNode(true);
  var mathml = clone.getElementsByClassName('katex-mathml');
  for(var i = mathml.length - 1; i >= 0; i--) mathml[i].parentNode.removeChild(mathml[i]);
  return clone.innerHTML.trim();
}

function collectPageQuizzes(){
  var containers = document.querySelectorAll('.quiz-container[data-correct], .quiz-container[data-quiz]');
  var questions = [];
  containers.forEach(function(c){
    var qEl = c.querySelector('.quiz-q');
    if(!qEl) return;
    var qHtml = stripKatexMathml(qEl);
    if(!qHtml) return;
    var correct = parseInt(c.dataset.correct);
    if(isNaN(correct)) return;
    var opts = [];
    c.querySelectorAll('.quiz-options label').forEach(function(label){
      var clone = label.cloneNode(true);
      var inp = clone.querySelector('input');
      if(inp) inp.remove();
      opts.push(clone.textContent.trim());
    });
    if(!opts.length) return;
    var chapter = '';
    var prev = c.previousElementSibling;
    while(prev){
      if(prev.tagName === 'H2' || prev.tagName === 'H3'){
        chapter = prev.textContent.trim();
        break;
      }
      prev = prev.previousElementSibling;
    }
    if(!chapter){
      var parent = c.parentElement;
      while(parent && parent.tagName !== 'MAIN' && parent.tagName !== 'BODY'){
        var heading = parent.querySelector('h2, h3');
        if(heading){ chapter = heading.textContent.trim(); break; }
        parent = parent.parentElement;
      }
    }
    if(!chapter) chapter = '综合';
    questions.push({text: qHtml, options: opts, correct: correct, chapter: chapter});
  });
  /* Fallback: marxism-style dynamic quiz (.qq + .quiz-opts) */
  if(!questions.length){
    var mq = document.querySelector('#content .qq');
    var mo = document.querySelectorAll('#content .quiz-opts label');
    if(mq && mo.length){
      var opts = [];
      mo.forEach(function(label){
        var clone = label.cloneNode(true);
        var inp = clone.querySelector('input');
        if(inp) inp.remove();
        opts.push(clone.textContent.trim());
      });
      questions.push({text: stripKatexMathml(mq), options: opts, correct: -1, chapter: '自测'});
    }
  }
  return questions;
}

function showRandomQuizModal(){
  var allQ = collectPageQuizzes();
  if(allQ.length === 0){ alert('当前页面没有找到自测题目。'); return; }
  var chapters = [];
  var seen = {};
  allQ.forEach(function(q){
    if(!seen[q.chapter]){ seen[q.chapter] = true; chapters.push(q.chapter); }
  });

  var existing = document.getElementById('rq-overlay');
  if(existing && existing.classList.contains('show')){ existing.classList.remove('show'); return; }

  var overlay;
  if(existing){ overlay = existing; }
  else {
    overlay = ce('div','rq-overlay');
    overlay.id = 'rq-overlay';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function(e){ if(e.target === overlay) overlay.classList.remove('show'); });
  }

  var h = '<div class="rq-box">'
    + '<button class="rq-close" onclick="document.getElementById(\'rq-overlay\').classList.remove(\'show\')">&times;</button>'
    + '<h3>&#127922; 随机组卷</h3>'
    + '<p style="color:var(--text2,#9ba1b8);font-size:.88rem;margin-bottom:16px">从当前页面 <strong>' + allQ.length + '</strong> 道题中随机抽取</p>'
    + '<div class="rq-label">题目数量</div>'
    + '<div class="rq-radio-group">';
  [10, 15, 20].forEach(function(n, i){
    h += '<label><input type="radio" name="rq-count" value="' + n + '"' + (i === 0 ? ' checked' : '') + '> ' + n + ' 题</label>';
  });
  h += '</div>'
    + '<div class="rq-label">选择章节</div>'
    + '<div class="rq-chk-group">';
  chapters.forEach(function(ch){
    h += '<label><input type="checkbox" class="rq-chap" value="' + escHtml(ch) + '" checked> ' + escHtml(ch) + '</label>';
  });
  h += '</div>'
    + '<div class="rq-label">考试时长</div>'
    + '<div class="rq-radio-group">';
  [{v:10,l:'10分钟'},{v:15,l:'15分钟'},{v:20,l:'20分钟'},{v:30,l:'30分钟'}].forEach(function(t, i){
    h += '<label><input type="radio" name="rq-time" value="' + t.v + '"' + (i === 1 ? ' checked' : '') + '> ' + t.l + '</label>';
  });
  h += '</div>'
    + '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:8px">'
    + '<button class="rq-btn rq-btn-secondary" onclick="document.getElementById(\'rq-overlay\').classList.remove(\'show\')">取消</button>'
    + '<button class="rq-btn rq-btn-primary" onclick="f2StartQuiz()">开始考试</button>'
    + '</div></div>';

  overlay.innerHTML = h;
  overlay.classList.add('show');
}

window.f2StartQuiz = function(){
  var allQ = collectPageQuizzes();
  var countEl = document.querySelector('input[name="rq-count"]:checked');
  var count = countEl ? parseInt(countEl.value) : 10;
  var selectedChaps = [];
  document.querySelectorAll('.rq-chap:checked').forEach(function(cb){ selectedChaps.push(cb.value); });
  var timeEl = document.querySelector('input[name="rq-time"]:checked');
  var timeMin = timeEl ? parseInt(timeEl.value) : 15;
  var pool = allQ.filter(function(q){ return selectedChaps.indexOf(q.chapter) !== -1; });
  if(pool.length === 0){ alert('所选章节无题目'); return; }
  count = Math.min(count, pool.length);
  var shuffled = pool.slice().sort(function(){ return Math.random() - 0.5; });
  quizQuestions = shuffled.slice(0, count);
  quizAnswers = new Array(count).fill(-1);
  quizCurrentIdx = 0;
  quizSubmitted = false;
  quizTimeLeft = timeMin * 60;
  if(quizTimer) clearInterval(quizTimer);
  quizTimer = setInterval(function(){
    quizTimeLeft--;
    renderQuizTimer();
    if(quizTimeLeft <= 0){ clearInterval(quizTimer); quizTimer = null; f2SubmitQuiz(); }
  }, 1000);
  renderQuizView();
};

function renderQuizTimer(){
  var el = document.getElementById('rq-timer-text');
  if(!el) return;
  var m = Math.floor(quizTimeLeft / 60);
  var s = quizTimeLeft % 60;
  el.textContent = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  el.className = 'rq-timer-text ' + (quizTimeLeft <= 60 ? 'rq-timer-warn' : 'rq-timer-ok');
}

function renderQuizView(){
  var overlay = document.getElementById('rq-overlay');
  if(!overlay) return;
  var q = quizQuestions[quizCurrentIdx];
  var h = '<div class="rq-box" style="max-width:700px">'
    + '<div class="rq-timer" id="rq-timer-text" style="font-size:1.3rem;'
    + (quizTimeLeft <= 60 ? 'color:var(--danger,#f87171)' : 'color:var(--success,#34d399)') + '">'
    + formatTime(quizTimeLeft) + '</div>'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'
    + '<span style="font-size:.85rem;color:var(--text2,#9ba1b8)">第 ' + (quizCurrentIdx + 1) + ' / ' + quizQuestions.length + ' 题</span>'
    + '<button class="rq-close" onclick="if(confirm(\'确定交卷？\')){f2SubmitQuiz();}" style="position:static;font-size:.82rem;color:var(--accent,#6c8aff);border:1px solid var(--accent,#6c8aff);border-radius:6px;padding:4px 12px;background:transparent;cursor:pointer">&times; 交卷</button>'
    + '</div>'
    + '<div class="rq-progress">';
  for(var i = 0; i < quizQuestions.length; i++){
    var cls = 'rq-dot';
    if(i === quizCurrentIdx) cls += ' current';
    else if(quizAnswers[i] !== -1) cls += ' answered';
    h += '<div class="' + cls + '" onclick="f2GoQ(' + i + ')" style="cursor:pointer">' + (i + 1) + '</div>';
  }
  h += '</div>'
    + '<div class="rq-qcard">'
    + '<div class="rq-q-text">' + (quizCurrentIdx + 1) + '. ' + q.text + '</div>';
  q.options.forEach(function(opt, oi){
    var selCls = quizAnswers[quizCurrentIdx] === oi ? ' selected' : '';
    h += '<div class="rq-opt' + selCls + '" onclick="f2SelectOpt(' + quizCurrentIdx + ',' + oi + ')">' + escHtml(opt) + '</div>';
  });
  h += '</div>'
    + '<div class="rq-nav-btns">';
  if(quizCurrentIdx > 0)
    h += '<button class="rq-btn rq-btn-secondary" onclick="f2GoQ(' + (quizCurrentIdx - 1) + ')">&#8592; 上一题</button>';
  else
    h += '<div></div>';
  if(quizCurrentIdx < quizQuestions.length - 1)
    h += '<button class="rq-btn rq-btn-primary" onclick="f2GoQ(' + (quizCurrentIdx + 1) + ')">下一题 &#8594;</button>';
  else
    h += '<button class="rq-btn rq-btn-primary" onclick="f2SubmitQuiz()">提交答卷</button>';
  h += '</div></div>';
  overlay.innerHTML = h;
  overlay.classList.add('show');
}

function formatTime(sec){
  var m = Math.floor(sec / 60);
  var s = sec % 60;
  return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
}

window.f2GoQ = function(idx){ quizCurrentIdx = idx; renderQuizView(); };

window.f2SelectOpt = function(qi, oi){
  quizAnswers[qi] = oi;
  var dots = document.querySelectorAll('.rq-dot');
  if(dots[qi]) dots[qi].classList.add('answered');
  var opts = document.querySelectorAll('.rq-opt');
  opts.forEach(function(o, i){ o.classList.toggle('selected', i === oi); });
};

window.f2SubmitQuiz = function(){
  if(quizSubmitted) return;
  quizSubmitted = true;
  if(quizTimer){ clearInterval(quizTimer); quizTimer = null; }
  var correct = 0;
  var details = [];
  quizQuestions.forEach(function(q, i){
    var isCorrect = quizAnswers[i] === q.correct;
    if(isCorrect) correct++;
    details.push({q: q, chosen: quizAnswers[i], isCorrect: isCorrect});
  });
  var score = Math.round(correct / quizQuestions.length * 100);
  renderQuizResult(score, correct, details);
};

function renderQuizResult(score, correct, details){
  var overlay = document.getElementById('rq-overlay');
  if(!overlay) return;
  var color = score >= 80 ? 'var(--success,#34d399)' : score >= 60 ? 'var(--warning,#fbbf24)' : 'var(--danger,#f87171)';
  var h = '<div class="rq-box" style="max-width:750px">'
    + '<button class="rq-close" onclick="document.getElementById(\'rq-overlay\').classList.remove(\'show\')">&times;</button>'
    + '<div class="rq-score-card">'
    + '<div class="rq-score-num" style="color:' + color + '">' + score + '</div>'
    + '<div class="rq-score-label">正确 ' + correct + ' / ' + quizQuestions.length + ' 题</div>'
    + '</div>';
  details.forEach(function(d, i){
    var q = d.q;
    h += '<div class="rq-qcard">'
      + '<div class="rq-q-text">' + (i + 1) + '. ' + q.text + '</div>';
    q.options.forEach(function(opt, oi){
      var cls = 'rq-opt';
      if(oi === q.correct) cls += ' correct';
      else if(oi === d.chosen && !d.isCorrect) cls += ' wrong';
      h += '<div class="' + cls + '">' + escHtml(opt) + '</div>';
    });
    h += '</div>';
  });
  h += '<div style="display:flex;gap:10px;justify-content:center;margin-top:20px">'
    + '<button class="rq-btn rq-btn-primary" onclick="f2ShowRandomQuizModal()">再考一次</button>'
    + '<button class="rq-btn rq-btn-secondary" onclick="document.getElementById(\'rq-overlay\').classList.remove(\'show\')">关闭</button>'
    + '</div></div>';
  overlay.innerHTML = h;
}

/* ── Create FAB & Init ── */
function init(){
  var pageId = getPageId();
  if(!pageId) return;
  var quizFab = ce('button', 'rq-fab');
  quizFab.innerHTML = '&#127922;';
  quizFab.title = '随机组卷';
  quizFab.onclick = showRandomQuizModal;
  document.body.appendChild(quizFab);
}

if(document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', init); }
else{ init(); }

})();
