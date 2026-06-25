function toggleCollapse(el){el.classList.toggle('open');el.nextElementSibling.classList.toggle('show');}
window.addEventListener('scroll',()=>{const h=document.documentElement;document.getElementById('backTop').classList.toggle('show',h.scrollTop>300);});
function checkQuiz(btn){const c=btn.closest('.quiz-container'),ans=c.dataset.correct,r=c.querySelector('.quiz-result'),sel=c.querySelector('input:checked');if(!sel){r.className='quiz-result wrong';r.textContent='请先选择答案';return;}if(sel.value===ans){r.className='quiz-result correct';r.textContent='✅ 正确！';}else{r.className='quiz-result wrong';r.textContent='❌ 错误，正确答案是第 '+(parseInt(ans)+1)+' 个选项';}}
function toggleSidebar(){var s=document.getElementById('nav');var o=document.getElementById('sidebarOverlay');s.classList.toggle('open');o.classList.toggle('show');}
if(!localStorage.getItem('sg_done_calc'))document.getElementById('subGuide').style.display='flex';
