/* mastery.js — 知识点掌握度热力图 */
(function(){
'use strict';

/* ── Inject CSS ── */
var css='.f-heatmap{display:grid;gap:4px;margin:12px 0}'
+'.f-hm-cell{width:28px;height:28px;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:.65rem;font-weight:600;cursor:default;transition:transform .15s}'
+'.f-hm-cell:hover{transform:scale(1.2)}'
+'.f-hm-gray{background:#2d3436;color:#636e72}'
+'.f-hm-light{background:#2ecc71;color:#fff;opacity:.4}'
+'.f-hm-green{background:#2ecc71;color:#fff}'
+'.f-hm-red{background:#ff6b6b;color:#fff}'
+'.f-hm-label{font-size:.75rem;color:var(--text-dim,#8892b0);display:flex;align-items:center}';
var s=document.createElement('style');s.textContent=css;document.head.appendChild(s);

/* ── Helpers ── */
var LS_MASTERY='mastery_data';
function getLS(k,d){try{var v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}}
function setLS(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
function qsa(s){return document.querySelectorAll(s)}

function getPageId(){
  var p=location.pathname;
  if(p.indexOf('/probability')!==-1)return'probability';
  if(p.indexOf('/os')!==-1)return'os';
  if(p.indexOf('/algorithm')!==-1)return'algorithm';
  if(p.indexOf('/dsp')!==-1)return'dsp';
  if(p.indexOf('/calculus')!==-1)return'calculus';
  if(p.indexOf('/marxism')!==-1)return'marxism';
  return null;
}

/* ── Chapter Data ── */
var CHAPTERS={
  probability:['Ch1随机事件','Ch2随机变量','Ch3多维变量','Ch4数字特征','Ch5大数定律','Ch6抽样分布','Ch7参数估计','Ch8假设检验'],
  os:['Ch1概述','Ch2处理器','Ch3存储','Ch4设备','Ch5文件'],
  algorithm:['Ch1概述','Ch2分治','Ch3DP','Ch4贪心','Ch5回溯','Ch6分支限界','Ch7随机'],
  dsp:['Ch1信号系统','Ch2采样重建','Ch3 DFT/FFT','Ch4 IIR','Ch5 FIR','Ch6实现'],
  calculus:['ODE','多元微分','多元积分','复变函数'],
  marxism:['Ch1唯物论','Ch2认识论','Ch3唯物史观','Ch4资本主义','Ch5帝国主义','Ch6社会主义']
};

/* ── Track Mastery from checkQuiz ── */
var _origCheck=window.checkQuiz;
window.checkQuiz=function(btn){
  if(_origCheck)_origCheck(btn);
  var isCorrect=false,tracked=false;
  if(btn){
    var c=btn.closest('.quiz-container');
    if(c&&c.dataset.correct!==undefined){
      var sel=c.querySelector('input:checked');
      if(sel){
        isCorrect=parseInt(sel.value)===parseInt(c.dataset.correct);
        var sec=c.closest('[id]');
        if(sec){trackMastery(sec.id,isCorrect);tracked=true;}
      }
    }
  }else{
    var r=document.getElementById('qr');
    if(r){
      isCorrect=r.className.indexOf('ok')!==-1;
      trackMastery('quiz',isCorrect);
      tracked=true;
    }
  }
  if(tracked){} // tracking complete
};

function trackMastery(sectionId,correct){
  var data=getLS(LS_MASTERY,{});
  var pageId=getPageId();
  if(!pageId)return;
  if(!data[pageId])data[pageId]={};
  if(!data[pageId][sectionId])data[pageId][sectionId]={visits:0,correct:0,wrong:0};
  data[pageId][sectionId].visits++;
  if(correct)data[pageId][sectionId].correct++;
  else data[pageId][sectionId].wrong++;
  setLS(LS_MASTERY,data);
}

/* ── Render Heatmap ── */
function renderHeatmap(){
  var el=document.getElementById('f-heatmap');
  if(!el)return;
  var data=getLS(LS_MASTERY,{});
  var h='<h4 style="margin-bottom:12px;color:var(--text,#dfe6e9)">📊 学习进度</h4>';
  var subjects=Object.keys(CHAPTERS);
  subjects.forEach(function(sub){
    var chapters=CHAPTERS[sub];
    var label={probability:'概率论',os:'操作系统',algorithm:'算法',dsp:'DSP',calculus:'高数',marxism:'马克思'}[sub]||sub;
    h+='<div style="display:flex;align-items:center;gap:8px;margin:6px 0"><div class="f-hm-label" style="width:60px">'+label+'</div><div style="display:flex;gap:3px">';
    chapters.forEach(function(ch,i){
      var d=data[sub]&&data[sub][ch];
      var cls='f-hm-gray';
      if(d){
        if(d.wrong>0)cls='f-hm-red';
        else if(d.correct>0)cls='f-hm-green';
        else if(d.visits>0)cls='f-hm-light';
      }
      h+='<div class="f-hm-cell '+cls+'" title="'+ch+(d?' ('+d.visits+'次)':'')+'">'+(i+1)+'</div>';
    });
    h+='</div></div>';
  });
  h+='<div style="display:flex;gap:12px;margin-top:12px;font-size:.75rem;color:var(--text-dim,#8892b0)">'
    +'<span><span class="f-hm-cell f-hm-gray" style="display:inline-flex;width:16px;height:16px;font-size:.5rem">1</span> 未访问</span>'
    +'<span><span class="f-hm-cell f-hm-light" style="display:inline-flex;width:16px;height:16px;font-size:.5rem">2</span> 已访问</span>'
    +'<span><span class="f-hm-cell f-hm-green" style="display:inline-flex;width:16px;height:16px;font-size:.5rem">3</span> 已掌握</span>'
    +'<span><span class="f-hm-cell f-hm-red" style="display:inline-flex;width:16px;height:16px;font-size:.5rem">4</span> 薄弱</span></div>';
  el.innerHTML=h;
}

/* ── Track section visits via IntersectionObserver ── */
function initMasteryTracking(){
  var sections=qsa('h2[id], h3[id]');
  if(!sections.length)return;
  var observer=new IntersectionObserver(function(entries){
    entries.forEach(function(e){
      if(e.isIntersecting){
        var data=getLS(LS_MASTERY,{});
        var pageId=getPageId();
        var secId=e.target.id;
        if(!pageId||!secId)return;
        if(!data[pageId])data[pageId]={};
        if(!data[pageId][secId])data[pageId][secId]={visits:0,correct:0,wrong:0};
        data[pageId][secId].visits++;
        setLS(LS_MASTERY,data);
      }
    });
  },{threshold:0.5});
  sections.forEach(function(s){observer.observe(s)});
}

/* ── Init ── */
function init(){
  initMasteryTracking();
  renderHeatmap();
}

if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',init)}
else{init()}
})();
