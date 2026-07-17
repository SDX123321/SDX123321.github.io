/* cross-links.js — 跨页面知识关联 */
(function(){
'use strict';

/* ── Inject CSS ── */
var css = ''
  + '.kl-tag{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:6px;background:rgba(108,138,255,.12);color:var(--accent,#6c8aff);font-size:.75rem;font-weight:600;cursor:pointer;margin-left:6px;vertical-align:middle;text-decoration:none;transition:all .2s;border:1px solid transparent}'
  + '.kl-tag:hover{background:rgba(108,138,255,.22);border-color:var(--accent,#6c8aff)}'
  + '.kl-tip{display:none;position:fixed;z-index:10002;background:var(--card,#1a1d27);border:1px solid var(--accent,#6c8aff);border-radius:10px;padding:12px 16px;max-width:320px;width:max-content;box-shadow:0 8px 24px rgba(0,0,0,.35);font-size:.85rem;color:var(--text,#e8eaf0);pointer-events:auto}'
  + '.kl-tip.show{display:block}'
  + '.kl-tip-title{font-weight:700;margin-bottom:4px;color:var(--accent2,#a78bfa)}'
  + '.kl-tip-desc{color:var(--text2,#9ba1b8);font-size:.82rem;line-height:1.5}'
  + '.kl-tip a{display:inline-block;margin-top:8px;color:var(--accent,#6c8aff);font-weight:600;text-decoration:none}'
  + '.kl-tip a:hover{text-decoration:underline}';

var styleEl = document.createElement('style');
styleEl.textContent = css;
document.head.appendChild(styleEl);

/* ── Helpers ── */
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

/* ── Knowledge Map ── */
var KNOWLEDGE_MAP = {
  '递归':  {subject:'algorithm', chapter:'Ch2', desc:'递归与分治策略 — 算法第二章', url:'../algorithm/#ch2'},
  '分治':  {subject:'algorithm', chapter:'Ch2', desc:'分治法核心思想与Master定理 — 算法第二章', url:'../algorithm/#ch2'},
  '动态规划': {subject:'algorithm', chapter:'Ch3', desc:'动态规划设计与分析 — 算法第三章', url:'../algorithm/#ch3'},
  '贪心':  {subject:'algorithm', chapter:'Ch4', desc:'贪心算法设计与分析 — 算法第四章', url:'../algorithm/#ch4'},
  '回溯':  {subject:'algorithm', chapter:'Ch5', desc:'回溯法 — 算法第五章', url:'../algorithm/#ch5'},
  '分支限界': {subject:'algorithm', chapter:'Ch6', desc:'分支限界法 — 算法第六章', url:'../algorithm/#ch6'},
  'FFT':   {subject:'dsp', chapter:'Ch3', desc:'快速傅里叶变换 — DSP第三章', url:'../dsp/#ch3'},
  'DFT':   {subject:'dsp', chapter:'Ch3', desc:'离散傅里叶变换 — DSP第三章', url:'../dsp/#ch3'},
  '卷积':  {subject:'signals', chapter:'ch2', desc:'卷积运算 — 信号与系统核心概念', url:'../signals/'},
  '采样定理': {subject:'dsp', chapter:'Ch2', desc:'奈奎斯特采样定理 — DSP第二章', url:'../dsp/#ch2'},
  '傅里叶': {subject:'dsp', chapter:'Ch3', desc:'傅里叶变换 — DSP第三章', url:'../dsp/#ch3'},
  'Z变换':  {subject:'dsp', chapter:'Ch4', desc:'Z变换与系统函数 — DSP第四章', url:'../dsp/#ch4'},
  '概率':  {subject:'probability', chapter:'Ch1', desc:'概率论基础 — 随机事件与概率', url:'../probability/#ch1'},
  '期望':  {subject:'probability', chapter:'Ch4', desc:'数学期望与方差 — 概率论第四章', url:'../probability/#ch4'},
  '方差':  {subject:'probability', chapter:'Ch4', desc:'方差与标准差 — 概率论第四章', url:'../probability/#ch4'},
  '正态分布': {subject:'probability', chapter:'Ch2', desc:'正态分布 — 概率论第二章', url:'../probability/#ch2'},
  '贝叶斯': {subject:'probability', chapter:'Ch1', desc:'贝叶斯公式 — 概率论第一章', url:'../probability/#ch1'},
  '泊松':  {subject:'probability', chapter:'Ch2', desc:'泊松分布 — 概率论第二章', url:'../probability/#ch2'},
  '大数定律': {subject:'probability', chapter:'Ch5', desc:'大数定律与中心极限定理', url:'../probability/#ch5'},
  '中心极限': {subject:'probability', chapter:'Ch5', desc:'中心极限定理 — 概率论第五章', url:'../probability/#ch5'},
  '参数估计': {subject:'probability', chapter:'Ch7', desc:'点估计与区间估计 — 概率论第七章', url:'../probability/#ch7'},
  '假设检验': {subject:'probability', chapter:'Ch8', desc:'假设检验方法 — 概率论第八章', url:'../probability/#ch8'},
  '最优化': {subject:'algorithm', chapter:'Ch4', desc:'优化问题求解策略 — 贪心/DP/分支限界', url:'../algorithm/#ch4'},
  '进程':  {subject:'os', chapter:'Ch2', desc:'进程管理 — 操作系统第二章', url:'../os/#ch2'},
  '死锁':  {subject:'os', chapter:'Ch2', desc:'死锁的条件与处理 — 操作系统第二章', url:'../os/#ch2-deadlock'},
  '调度':  {subject:'os', chapter:'Ch2', desc:'调度算法 — 操作系统第二章', url:'../os/#ch2-sched'},
  '分页':  {subject:'os', chapter:'Ch3', desc:'分页存储管理 — 操作系统第三章', url:'../os/#ch3-page'},
  '页面置换': {subject:'os', chapter:'Ch3', desc:'页面置换算法 — 操作系统第三章', url:'../os/#ch3-replace'},
  '信号量': {subject:'os', chapter:'Ch2', desc:'PV操作与信号量 — 操作系统第二章', url:'../os/#ch2-sync'},
  '互斥':  {subject:'os', chapter:'Ch2', desc:'同步与互斥 — 操作系统第二章', url:'../os/#ch2-sync'},
  '滤波器': {subject:'dsp', chapter:'Ch4', desc:'IIR/FIR滤波器设计 — DSP第四五章', url:'../dsp/#ch4'},
  '极值':  {subject:'calculus', chapter:'ch3', desc:'多元函数极值 — 高等数学', url:'../calculus/'},
  '偏导':  {subject:'calculus', chapter:'ch2', desc:'偏导数与全微分 — 高等数学', url:'../calculus/'},
  '重积分': {subject:'calculus', chapter:'ch3', desc:'二重/三重积分 — 高等数学', url:'../calculus/'}
};

var tipEl = null;
function ensureTipEl(){
  if(tipEl) return tipEl;
  tipEl = ce('div', 'kl-tip');
  tipEl.id = 'kl-tip';
  document.body.appendChild(tipEl);
  document.addEventListener('click', function(e){
    if(!e.target.closest('.kl-tag') && !e.target.closest('.kl-tip')){
      tipEl.classList.remove('show');
    }
  });
  return tipEl;
}

function injectKnowledgeLinks(){
  var pageId = getPageId();
  if(!pageId) return;
  var targets = document.querySelectorAll('h1, h2, h3, h4, .keypoint, .card-title, .card, .formula');

  targets.forEach(function(el){
    if(el.dataset.klProcessed) return;
    el.dataset.klProcessed = '1';

    var keywords = Object.keys(KNOWLEDGE_MAP);
    keywords.forEach(function(kw){
      var info = KNOWLEDGE_MAP[kw];
      if(info.subject === pageId) return;

      var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
      var textNodes = [];
      while(walker.nextNode()){
        if(walker.currentNode.textContent.indexOf(kw) !== -1){
          textNodes.push(walker.currentNode);
        }
      }
      if(textNodes.length === 0) return;
      var node = textNodes[0];
      var text = node.textContent;
      var idx = text.indexOf(kw);
      if(idx === -1) return;

      var parent = node.parentElement;
      if(!parent || parent.tagName === 'SCRIPT' || parent.tagName === 'INPUT' || parent.tagName === 'STYLE') return;
      if(parent.classList && parent.classList.contains('kl-tag')) return;

      var before = text.substring(0, idx);
      var after = text.substring(idx + kw.length);
      var frag = document.createDocumentFragment();
      if(before) frag.appendChild(document.createTextNode(before));
      var link = ce('a', 'kl-tag');
      link.href = 'javascript:void(0)';
      link.innerHTML = kw + ' <span style="font-size:.65rem">&#128279;</span>';
      link.dataset.kw = kw;
      link.addEventListener('click', function(e){
        e.preventDefault();
        e.stopPropagation();
        showKnowledgeTip(kw, e.target);
      });
      frag.appendChild(link);
      if(after) frag.appendChild(document.createTextNode(after));
      parent.replaceChild(frag, node);
    });
  });
}

function showKnowledgeTip(kw, anchor){
  var info = KNOWLEDGE_MAP[kw];
  if(!info) return;
  var tip = ensureTipEl();
  tip.innerHTML = '<div class="kl-tip-title">&#128279; 相关知识</div>'
    + '<div class="kl-tip-desc">' + escHtml(info.desc) + ' (' + info.chapter + ')</div>'
    + '<a href="' + info.url + '">前往查看 &#8594;</a>';
  var rect = anchor.getBoundingClientRect();
  tip.style.left = Math.min(rect.left, window.innerWidth - 340) + 'px';
  tip.style.top = (rect.bottom + 8) + 'px';
  tip.classList.add('show');
}

/* ── Init ── */
function init(){
  var pageId = getPageId();
  if(!pageId) return;
  setTimeout(injectKnowledgeLinks, 800);
}

if(document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', init); }
else{ init(); }

})();
