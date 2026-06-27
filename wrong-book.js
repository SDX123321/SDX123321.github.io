/* wrong-book.js — 错题本功能 */
(function(){
'use strict';

/* ── Inject CSS ── */
var css='.features-fab{position:fixed;z-index:98;width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 15px rgba(0,0,0,.3);transition:all .2s;font-size:1.2em}'
+'.features-fab:hover{transform:scale(1.1)}'
+'.f-modal{display:none;position:fixed;top:0;left:0;right:0;bottom:0;z-index:10000;background:rgba(0,0,0,.5);align-items:center;justify-content:center}'
+'.f-modal.show{display:flex}'
+'.f-modal-box{background:var(--card,#1a1d27);border-radius:16px;padding:28px;max-width:720px;width:92vw;max-height:80vh;overflow-y:auto;border:1px solid var(--border,#2d3436);position:relative}'
+'.f-modal-close{position:absolute;top:12px;right:16px;cursor:pointer;font-size:1.3rem;color:var(--text-dim,#8892b0);background:none;border:none;line-height:1}'
+'.f-modal-close:hover{color:var(--text,#dfe6e9)}'
+'.f-modal h3{margin:0 0 16px;font-size:1.15rem;color:var(--accent2,#a29bfe)}'
+'.f-wrong-item{background:var(--card2,#232736);border-radius:10px;padding:14px 16px;margin:8px 0;border:1px solid var(--border,#2d3436)}'
+'.f-wrong-q{font-weight:600;margin-bottom:6px;font-size:.92rem}'
+'.f-wrong-ans{font-size:.85rem;color:var(--text-dim,#8892b0)}'
+'.f-wrong-ans .correct{color:var(--green,#00cec9)}'
+'.f-wrong-ans .wrong{color:var(--red,#ff6b6b)}'
+'.f-tab-bar{display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap}'
+'.f-tab{padding:6px 16px;border-radius:8px;border:1px solid var(--border,#2d3436);background:transparent;color:var(--text-dim,#8892b0);cursor:pointer;font-size:.85rem;font-weight:600;transition:all .2s}'
+'.f-tab.active{background:var(--accent,#6c5ce7);color:#fff;border-color:var(--accent,#6c5ce7)}'
+'.f-badge{display:inline-block;min-width:20px;height:20px;border-radius:10px;background:var(--red,#ff6b6b);color:#fff;font-size:.7rem;font-weight:700;text-align:center;line-height:20px;padding:0 6px;position:absolute;top:-4px;right:-4px}'
+'@media(max-width:900px){.f-modal-box{padding:20px;max-height:90vh}}';
var s=document.createElement('style');s.textContent=css;document.head.appendChild(s);

/* ── Helpers ── */
var LS_WRONG='wrong_answers';
function getLS(k,d){try{var v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}}
function setLS(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
function qsa(s){return document.querySelectorAll(s)}
function ce(t,c,h){var e=document.createElement(t);if(c)e.className=c;if(h)e.innerHTML=h;return e}
function escHtml(s){var d=document.createElement('div');d.textContent=s||'';return d.innerHTML;}

/* ── Hook checkQuiz for wrong answers ── */
var _origCheck=window.checkQuiz;
window.checkQuiz=function(btn){
  if(_origCheck)_origCheck(btn);
  var qText='',userAnswer='',correctAnswer='',isWrong=false;
  if(btn){
    /* Standard quiz: .quiz-container[data-correct] */
    var c=btn.closest('.quiz-container');
    if(c&&c.dataset.correct!==undefined){
      var sel=c.querySelector('input:checked');
      var res=c.querySelector('.quiz-result');
      if(sel&&res){
        var correct=parseInt(c.dataset.correct);
        var chosen=parseInt(sel.value);
        if(chosen!==correct){
          isWrong=true;
          var qEl=c.querySelector('.quiz-q');
          var labels=c.querySelectorAll('.quiz-options label');
          qText=qEl?qEl.textContent.trim():'';
          userAnswer=labels[chosen]?labels[chosen].textContent.trim():'';
          correctAnswer=labels[correct]?labels[correct].textContent.trim():'';
        }
      }
    }
  }else{
    /* Dynamic quiz (marxism): no btn, quiz rendered into #content */
    var r=document.getElementById('qr');
    if(r&&(r.className.indexOf('ng')!==-1||r.className.indexOf('wrong')!==-1)){
      isWrong=true;
      var qq=document.querySelector('#content .qq');
      var opts=document.querySelectorAll('#content .quiz-opts label');
      var selRadio=document.querySelector('input[name="qz"]:checked');
      qText=qq?qq.textContent.trim():'';
      if(selRadio){
        var ci=parseInt(selRadio.value);
        userAnswer=opts[ci]?opts[ci].textContent.trim():'';
      }
      var m=r.textContent.match(/正确答案[：:]\s*(.+)/);
      correctAnswer=m?m[1].trim():'';
    }
  }
  if(isWrong){
    var wrongs=getLS(LS_WRONG,[]);
    wrongs.push({
      page:document.title,
      question:qText,
      userAnswer:userAnswer,
      correctAnswer:correctAnswer,
      time:Date.now()
    });
    setLS(LS_WRONG,wrongs);
    updateWrongBadge();
  }
};

/* ── Wrong Answer Book ── */
function updateWrongBadge(){
  var b=document.getElementById('f-wrong-badge');
  if(!b)return;
  var n=getLS(LS_WRONG,[]).length;
  b.textContent=n;b.style.display=n>0?'inline-block':'none';
}

function showWrongModal(){
  var m=document.getElementById('f-wrong-modal');
  if(m){m.classList.toggle('show');return;}
  m=ce('div','f-modal','id="f-wrong-modal"');
  var box=ce('div','f-modal-box');
  var closeBtn=ce('button','f-modal-close','&times;');
  closeBtn.addEventListener('click',function(e){e.stopPropagation();m.classList.remove('show')});
  box.appendChild(closeBtn);
  var title=ce('h3','','📝 错题本');
  box.appendChild(title);
  var content=ce('div','','id="f-wrong-content"');
  box.appendChild(content);
  m.appendChild(box);
  document.body.appendChild(m);
  renderWrongList();
  m.classList.add('show');
  m.addEventListener('click',function(e){if(e.target===m)m.classList.remove('show')});
}

function renderWrongList(){
  var el=document.getElementById('f-wrong-content');
  if(!el)return;
  var wrongs=getLS(LS_WRONG,[]);
  if(!wrongs.length){el.innerHTML='<p style="color:var(--text-dim,#8892b0)">暂无错题，继续加油！</p>';return;}
  var grouped={};
  wrongs.forEach(function(w){
    var p=w.page||'未知';
    if(!grouped[p])grouped[p]=[];
    grouped[p].push(w);
  });
  var h='<div class="f-tab-bar">';
  var pages=Object.keys(grouped);
  h+='<button class="f-tab active" onclick="fFilterWrong(\'all\',this)">全部 ('+wrongs.length+')</button>';
  pages.forEach(function(p,i){h+='<button class="f-tab" onclick="fFilterWrong(\''+p.replace(/'/g,"\\'")+'\',this)">'+p+' ('+grouped[p].length+')</button>';});
  h+='</div><div id="f-wrong-list">';
  wrongs.slice().reverse().forEach(function(w,i){
    h+='<div class="f-wrong-item" data-page="'+(w.page||'')+'">'
      +'<div class="f-wrong-q">'+escHtml(w.question)+'</div>'
      +'<div class="f-wrong-ans"><span class="wrong">✗ 你的答案: '+escHtml(w.userAnswer)+'</span><br><span class="correct">✓ 正确答案: '+escHtml(w.correctAnswer)+'</span></div>'
      +'<div style="font-size:.72rem;color:var(--text-dim,#8892b0);margin-top:4px">'+new Date(w.time).toLocaleString()+'</div></div>';
  });
  h+='</div><div style="margin-top:16px;display:flex;gap:8px">'
    +'<button class="btn" style="background:var(--red,#ff6b6b);font-size:.82rem" onclick="fClearWrong()">清空错题</button>'
    +'<button class="btn btn-secondary" style="font-size:.82rem" onclick="fExportWrong()">导出为文本</button></div>';
  el.innerHTML=h;
}
window.fFilterWrong=function(page,btn){
  qsa('.f-wrong-item').forEach(function(el){el.style.display=(page==='all'||el.dataset.page===page)?'':'none'});
  qsa('#f-wrong-modal .f-tab').forEach(function(t){t.classList.remove('active')});
  if(btn)btn.classList.add('active');
};
window.fClearWrong=function(){if(confirm('确定清空所有错题？')){setLS(LS_WRONG,[]);renderWrongList();updateWrongBadge();}};
window.fExportWrong=function(){
  var wrongs=getLS(LS_WRONG,[]);
  var t='错题本导出 - '+new Date().toLocaleDateString()+'\n'+'='.repeat(40)+'\n\n';
  wrongs.forEach(function(w,i){t+=(i+1)+'. ['+w.page+'] '+w.question+'\n   你的答案: '+w.userAnswer+'\n   正确答案: '+w.correctAnswer+'\n\n';});
  var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([t],{type:'text/plain;charset=utf-8'}));a.download='错题本.txt';a.click();
};

/* ── Create FAB button ── */
function init(){
  var fab1=ce('button','features-fab');
  fab1.style.cssText='bottom:140px;right:30px;background:var(--red,#ff6b6b);color:#fff;border:none;';
  fab1.innerHTML='📝<span class="f-badge" id="f-wrong-badge" style="display:none">0</span>';
  fab1.title='错题本';fab1.onclick=showWrongModal;
  document.body.appendChild(fab1);
  updateWrongBadge();
}

if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',init)}
else{init()}
})();
