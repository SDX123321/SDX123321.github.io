/* formula-ref.js — 公式速查 */
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
+'.f-formula-item{background:var(--card2,#232736);border-radius:10px;padding:12px 16px;margin:8px 0;border:1px solid var(--border,#2d3436)}'
+'.f-formula-name{font-weight:600;font-size:.88rem;color:var(--accent2,#a29bfe);margin-bottom:4px}'
+'.f-formula-val{font-size:1rem;color:var(--orange,#fdcb6e);font-family:monospace}'
+'.f-formula-note{font-size:.78rem;color:var(--text-dim,#8892b0);margin-top:4px}'
+'.f-search{width:100%;padding:10px 14px;border-radius:10px;border:1px solid var(--border,#2d3436);background:var(--card2,#232736);color:var(--text,#dfe6e9);font-size:.9rem;margin-bottom:12px;outline:none}'
+'.f-search:focus{border-color:var(--accent,#6c5ce7)}'
+'.f-tab-bar{display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap}'
+'.f-tab{padding:6px 16px;border-radius:8px;border:1px solid var(--border,#2d3436);background:transparent;color:var(--text-dim,#8892b0);cursor:pointer;font-size:.85rem;font-weight:600;transition:all .2s}'
+'.f-tab.active{background:var(--accent,#6c5ce7);color:#fff;border-color:var(--accent,#6c5ce7)}'
+'@media(max-width:900px){.f-modal-box{padding:20px;max-height:90vh}}';
var s=document.createElement('style');s.textContent=css;document.head.appendChild(s);

/* ── Helpers ── */
function qsa(s){return document.querySelectorAll(s)}
function ce(t,c,h){var e=document.createElement(t);if(c)e.className=c;if(h)e.innerHTML=h;return e}

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

/* ── Formula Data ── */
var FORMULAS={
  probability:[
    {name:'条件概率',f:'P(A|B) = P(AB)/P(B)',n:''},
    {name:'全概率公式',f:'P(A) = Σ P(Bᵢ)P(A|Bᵢ)',n:''},
    {name:'贝叶斯公式',f:'P(Bⱼ|A) = P(Bⱼ)P(A|Bⱼ) / Σ P(Bᵢ)P(A|Bᵢ)',n:'后验 = 先验×似然/证据'},
    {name:'二项分布',f:'P(X=k) = C(n,k)p^k(1-p)^(n-k)',n:'X~B(n,p), E=np, D=np(1-p)'},
    {name:'泊松分布',f:'P(X=k) = λ^k e^(-λ) / k!',n:'X~P(λ), E=D=λ'},
    {name:'正态分布',f:'f(x) = (1/√(2π)σ) exp(-(x-μ)²/2σ²)',n:'X~N(μ,σ²)'},
    {name:'期望',f:'E(X) = Σ xᵢpᵢ 或 ∫xf(x)dx',n:'线性: E(aX+b)=aE(X)+b'},
    {name:'方差',f:'D(X) = E(X²) - [E(X)]²',n:'D(aX+b)=a²D(X)'},
    {name:'协方差',f:'Cov(X,Y) = E(XY) - E(X)E(Y)',n:'ρ=Cov/(σₓσᵧ)'},
    {name:'中心极限定理',f:'(X̄-μ)/(σ/√n) → N(0,1)',n:'n充分大时近似正态'},
    {name:'MLE',f:'∂lnL(θ)/∂θ = 0',n:'最大似然估计'},
    {name:'卡方检验',f:'χ² = Σ(Oᵢ-Eᵢ)²/Eᵢ',n:'拟合优度检验'}
  ],
  os:[
    {name:'周转时间',f:'T = E - S (完成-到达)',n:'平均周转 T̄ = ΣT/n'},
    {name:'带权周转',f:'W = T/r (周转/运行)',n:'平均 W̄ = ΣW/n'},
    {name:'响应比',f:'H = 1 + 等待时间/运行时间',n:'HRRN调度'},
    {name:'缺页率',f:'R = F/(S+F)',n:'F=缺页次数,S=成功次数'},
    {name:'磁盘访问',f:'T = 寻道 + 旋转延迟 + 传输',n:'寻道时间影响最大'},
    {name:'银行家算法',f:'Need = Max - Allocation',n:'安全序列存在则安全'}
  ],
  algorithm:[
    {name:'Master定理',f:'T(n)=aT(n/b)+O(n^d)',n:'a≥1,b>1,d≥0'},
    {name:'归并排序',f:'T(n)=2T(n/2)+O(n)',n:'O(nlogn) 所有情况'},
    {name:'快速排序',f:'平均O(nlogn), 最坏O(n²)',n:'枢轴选择影响性能'},
    {name:'Dijkstra',f:'O((V+E)logV) 堆优化',n:'非负权图最短路径'},
    {name:'Floyd',f:'O(V³)',n:'所有顶点对最短路径'},
    {name:'0-1背包DP',f:'dp[i][w]=max(dp[i-1][w], dp[i-1][w-wᵢ]+vᵢ)',n:'O(nW)'}
  ],
  dsp:[
    {name:'DTFT',f:'X(e^jω) = Σ x(n)e^(-jωn)',n:'以2π为周期的连续频谱'},
    {name:'DFT',f:'X(k) = Σ x(n)W_N^(kn)',n:'W_N = e^(-j2π/N)'},
    {name:'IDFT',f:'x(n) = (1/N)Σ X(k)W_N^(-kn)',n:''},
    {name:'FFT运算量',f:'复乘 N/2·log₂N, 复加 N·log₂N',n:'相比DFT的N²大幅降低'},
    {name:'Z变换',f:'X(z) = Σ x(n)z^(-n)',n:'ROC决定逆变换'},
    {name:'双线性变换',f:'s = (2/T)·(1-z⁻¹)/(1+z⁻¹)',n:'无混叠但频率非线性'}
  ],
  calculus:[
    {name:'格林公式',f:'∬(∂Q/∂x-∂P/∂dxdy = ∮Pdx+Qdy',n:'平面闭曲线积分'},
    {name:'高斯公式',f:'∯F·dS = ∭divF dV',n:'散度定理'},
    {name:'柯西积分',f:'f(a) = (1/2πi)∮f(z)/(z-a)dz',n:'解析函数积分'},
    {name:'方向导数',f:'∂f/∂l = ∇f · e_l',n:'梯度方向变化率最大'},
    {name:'隐函数求导',f:'dy/dx = -Fₓ/Fᵧ',n:'F(x,y)=0'}
  ]
};

/* ── Formula Modal ── */
function showFormulaModal(){
  var m=document.getElementById('f-formula-modal');
  if(m){m.classList.toggle('show');return;}
  m=ce('div','f-modal','id="f-formula-modal"');
  var box=ce('div','f-modal-box');
  var pageId=getPageId();
  var h='<button class="f-modal-close" onclick="document.getElementById(\'f-formula-modal\').classList.remove(\'show\')">&times;</button>'
    +'<h3>📐 公式速查</h3>'
    +'<input class="f-search" id="f-formula-search" placeholder="搜索公式..." oninput="fSearchFormula(this.value)">'
    +'<div class="f-tab-bar">';
  var keys=Object.keys(FORMULAS);
  keys.forEach(function(k,i){
    var label={probability:'概率论',os:'操作系统',algorithm:'算法',dsp:'DSP',calculus:'高数'}[k]||k;
    h+='<button class="f-tab'+(k===pageId?' active':'')+'" onclick="fShowFormulaTab(\''+k+'\',this)">'+label+'</button>';
  });
  h+='</div><div id="f-formula-list"></div>';
  box.innerHTML=h;m.appendChild(box);document.body.appendChild(m);
  fShowFormulaTab(pageId||'probability',null);
  m.classList.add('show');
  m.addEventListener('click',function(e){if(e.target===m)m.classList.remove('show')});
}
window.fShowFormulaTab=function(key,btn){
  qsa('#f-formula-modal .f-tab').forEach(function(t){t.classList.remove('active')});
  if(btn)btn.classList.add('active');
  var list=document.getElementById('f-formula-list');
  if(!list)return;
  var formulas=FORMULAS[key]||[];
  var h='';
  formulas.forEach(function(f){
    h+='<div class="f-formula-item"><div class="f-formula-name">'+f.name+'</div>'
      +'<div class="f-formula-val">'+f.f+'</div>'
      +(f.n?'<div class="f-formula-note">'+f.n+'</div>':'')+'</div>';
  });
  list.innerHTML=h;
};
window.fSearchFormula=function(q){
  q=q.toLowerCase();
  var items=document.querySelectorAll('#f-formula-list .f-formula-item');
  items.forEach(function(el){
    var text=el.textContent.toLowerCase();
    el.style.display=text.indexOf(q)!==-1?'':'none';
  });
};

/* ── Create FAB button ── */
function init(){
  var fab2=ce('button','features-fab');
  fab2.style.cssText='bottom:195px;right:30px;background:var(--accent,#6c5ce7);color:#fff;border:none;';
  fab2.innerHTML='📐';fab2.title='公式速查';fab2.onclick=showFormulaModal;
  document.body.appendChild(fab2);
}

if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',init)}
else{init()}
})();
