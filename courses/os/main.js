// === Navigation ===
function scrollToSection(id){
  document.getElementById(id)?.scrollIntoView({behavior:'smooth'});
}
window.addEventListener('scroll',()=>{
  const btn=document.getElementById('backTop');
  btn.classList.toggle('show',window.scrollY>300);
  // Active nav
  const sections=['ch1','ch2','ch2-proc','ch2-sched','ch2-sync','ch2-deadlock','ch3','ch3-page','ch3-replace','ch4','ch4-disk','ch5','exam','quiz'];
  let current='';
  for(const s of sections){const el=document.getElementById(s);if(el&&el.getBoundingClientRect().top<200)current=s;}
  document.querySelectorAll('nav a').forEach(a=>{
    a.classList.toggle('active',a.getAttribute('href')==='#'+current);
  });
});

// === Scheduling Calculator ===
function addSchedRow(){
  const t=document.querySelector('#schedTable tbody');
  const r=t.insertRow();
  r.innerHTML='<td><input value="JOB'+t.rows.length+'" size="6"></td><td><input type="number" value="0" min="0" size="4"></td><td><input type="number" value="10" min="1" size="4"></td><td><button class="btn-secondary btn" onclick="this.closest(\'tr\').remove()">删</button></td>';
}
function loadSchedExample(){
  const t=document.querySelector('#schedTable tbody');
  t.innerHTML='';
  const data=[['JOB1','0','120'],['JOB2','50','50'],['JOB3','60','10'],['JOB4','110','20']];
  data.forEach(d=>{const r=t.insertRow();r.innerHTML=`<td><input value="${d[0]}" size="6"></td><td><input type="number" value="${d[1]}" min="0" size="4"></td><td><input type="number" value="${d[2]}" min="1" size="4"></td><td><button class="btn-secondary btn" onclick="this.closest('tr').remove()">删</button></td>`;});
}
function getJobs(){
  const rows=document.querySelectorAll('#schedTable tbody tr');
  const jobs=[];
  rows.forEach(r=>{
    const inputs=r.querySelectorAll('input');
    jobs.push({name:inputs[0].value,arrival:+inputs[1].value,burst:+inputs[2].value});
  });
  return jobs.sort((a,b)=>a.arrival-b.arrival);
}

function calcScheduling(){
  const jobs=getJobs();
  if(jobs.length===0)return;

  function runFCFS(jobs){
    let time=0;const result=[];
    const sorted=[...jobs].sort((a,b)=>a.arrival-b.arrival);
    sorted.forEach(j=>{
      if(time<j.arrival)time=j.arrival;
      const start=time;const end=time+j.burst;
      result.push({...j,start,end,turnaround:end-j.arrival,weighted:(end-j.arrival)/j.burst});
      time=end;
    });
    return result;
  }

  function runSJF(jobs){
    let time=0;const result=[];const remaining=[...jobs];
    while(remaining.length){
      const available=remaining.filter(j=>j.arrival<=time);
      if(!available.length){time=Math.min(...remaining.map(j=>j.arrival));continue;}
      available.sort((a,b)=>a.burst-b.burst);
      const j=available[0];
      const start=time;const end=time+j.burst;
      result.push({...j,start,end,turnaround:end-j.arrival,weighted:(end-j.arrival)/j.burst});
      time=end;
      remaining.splice(remaining.indexOf(j),1);
    }
    return result;
  }

  function runHRRN(jobs){
    let time=0;const result=[];const remaining=[...jobs];
    while(remaining.length){
      const available=remaining.filter(j=>j.arrival<=time);
      if(!available.length){time=Math.min(...remaining.map(j=>j.arrival));continue;}
      available.forEach(j=>{j.ratio=1+(time-j.arrival)/j.burst;});
      available.sort((a,b)=>b.ratio-a.ratio);
      const j=available[0];
      const start=time;const end=time+j.burst;
      result.push({...j,start,end,turnaround:end-j.arrival,weighted:(end-j.arrival)/j.burst});
      time=end;
      remaining.splice(remaining.indexOf(j),1);
    }
    return result;
  }

  function renderTable(title,results){
    const avgT=(results.reduce((s,r)=>s+r.turnaround,0)/results.length).toFixed(2);
    const avgW=(results.reduce((s,r)=>s+r.weighted,0)/results.length).toFixed(3);
    let h=`<h4 style="margin-top:16px">${title}</h4>`;
    h+=`<table><tr><th>任务</th><th>到达</th><th>运行</th><th>开始</th><th>完成</th><th>周转</th><th>带权周转</th></tr>`;
    results.forEach(r=>{
      h+=`<tr><td>${r.name}</td><td>${r.arrival}</td><td>${r.burst}</td><td>${r.start}</td><td>${r.end}</td><td>${r.turnaround}</td><td>${r.weighted.toFixed(2)}</td></tr>`;
    });
    h+=`<tr class="result-row"><td colspan="5">平均</td><td>${avgT}</td><td>${avgW}</td></tr></table>`;

    // Gantt chart
    h+=`<div class="gantt">`;
    results.forEach((r,i)=>{
      if(i>0)h+=`<span class="gantt-arrow">→</span>`;
      const colors=['#6c5ce7','#00cec9','#fdcb6e','#ff6b6b','#74b9ff','#a29bfe'];
      h+=`<div class="gantt-bar" style="background:${colors[i%colors.length]};min-width:${Math.max(40,r.burst*2)}px" title="${r.name}: ${r.start}-${r.end}">${r.name}(${r.burst})</div>`;
    });
    h+=`</div>`;
    return h;
  }

  let html='<h4>调度算法对比结果</h4>';
  html+=renderTable('FCFS 先来先服务',runFCFS(jobs));
  html+=renderTable('SJF 最短作业优先',runSJF(jobs));
  html+=renderTable('HRRN 最高响应比优先',runHRRN(jobs));

  document.getElementById('schedResult').innerHTML=html;
}

// === Page Replacement Simulator ===
function loadPageExample(){
  document.getElementById('pgFrames').value='3';
  document.getElementById('pgSeq').value='4,3,2,1,4,3,5,4,3,2,1,5';
}

function runPageReplace(){
  const frames=+document.getElementById('pgFrames').value;
  const seq=document.getElementById('pgSeq').value.split(',').map(s=>+s.trim()).filter(n=>!isNaN(n));
  if(!frames||!seq.length)return;

  function runOPT(frames,seq){
    const mem=[];let faults=0;const log=[];
    seq.forEach((page,i)=>{
      if(mem.includes(page)){log.push({page,mem:[...mem],fault:false});return;}
      faults++;
      if(mem.length<frames){mem.push(page);}
      else{
        let farthest=-1,replaceIdx=0;
        mem.forEach((p,j)=>{
          const next=seq.indexOf(p,i+1);
          const dist=next===-1?Infinity:next;
          if(dist>farthest){farthest=dist;replaceIdx=j;}
        });
        mem[replaceIdx]=page;
      }
      log.push({page,mem:[...mem],fault:true});
    });
    return{log,faults};
  }

  function runFIFO(frames,seq){
    const mem=[];const queue=[];let faults=0;const log=[];
    seq.forEach(page=>{
      if(mem.includes(page)){log.push({page,mem:[...mem],fault:false});return;}
      faults++;
      if(mem.length<frames){mem.push(page);queue.push(page);}
      else{const out=queue.shift();mem[mem.indexOf(out)]=page;queue.push(page);}
      log.push({page,mem:[...mem],fault:true});
    });
    return{log,faults};
  }

  function runLRU(frames,seq){
    const mem=[];let faults=0;const log=[];
    seq.forEach(page=>{
      if(mem.includes(page)){
        mem.splice(mem.indexOf(page),1);
        mem.push(page);
        log.push({page,mem:[...mem],fault:false});
        return;
      }
      faults++;
      if(mem.length<frames){mem.push(page);}
      else{mem.shift();mem.push(page);}
      log.push({page,mem:[...mem],fault:true});
    });
    return{log,faults};
  }

  function renderAlgo(name,result,frames){
    const rate=(result.faults/seq.length*100).toFixed(1);
    let h=`<h4>${name}</h4>`;
    h+=`<p>缺页次数: <strong style="color:var(--red)">${result.faults}</strong> / ${seq.length}，缺页率: <strong>${rate}%</strong></p>`;
    h+=`<table><tr><th>步骤</th>`;
    for(let i=0;i<frames;i++)h+=`<th>页框${i}</th>`;
    h+=`<th>访问页</th><th>结果</th></tr>`;
    result.log.forEach((entry,i)=>{
      h+=`<tr><td>${i+1}</td>`;
      for(let j=0;j<frames;j++){
        const val=entry.mem[j]!==undefined?entry.mem[j]:'-';
        const style=entry.fault&&j===entry.mem.length-1?'background:rgba(255,107,107,.15)':'';
        h+=`<td style="${style}">${val}</td>`;
      }
      h+=`<td style="font-weight:600">${entry.page}</td>`;
      h+=`<td style="color:${entry.fault?'var(--red)':'var(--green)'}">${entry.fault?'缺页':'命中'}</td></tr>`;
    });
    h+=`</table>`;
    return h;
  }

  let html='<h4>页面置换算法对比</h4>';
  html+=renderAlgo('OPT 理想置换',runOPT(frames,seq),frames);
  html+=renderAlgo('FIFO 先进先出',runFIFO(frames,seq),frames);
  html+=renderAlgo('LRU 最近最少用',runLRU(frames,seq),frames);
  document.getElementById('pageResult').innerHTML=html;
}

// === Banker's Algorithm ===
function buildBankerTable(){
  const rc=+document.getElementById('bkResCount').value;
  const pc=+document.getElementById('bkProcCount').value;
  const resLabels='ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  let h='<table><tr><th rowspan="2">进程</th><th colspan="'+rc+'">已分配 P</th><th colspan="'+rc+'">最大需求 E</th><th colspan="'+rc+'">剩余需求 N</th></tr>';
  h+='<tr>';
  for(let i=0;i<rc;i++)h+=`<th>${resLabels[i]}</th>`;
  for(let i=0;i<rc;i++)h+=`<th>${resLabels[i]}</th>`;
  for(let i=0;i<rc;i++)h+=`<th>${resLabels[i]}</th>`;
  h+='</tr>';
  for(let i=0;i<pc;i++){
    h+=`<tr><td>P${i}</td>`;
    for(let j=0;j<rc;j++)h+=`<td><input type="number" id="p_${i}_${j}" value="0" min="0" size="3" style="width:50px;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:4px;border-radius:4px;text-align:center"></td>`;
    for(let j=0;j<rc;j++)h+=`<td><input type="number" id="e_${i}_${j}" value="0" min="0" size="3" style="width:50px;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:4px;border-radius:4px;text-align:center"></td>`;
    for(let j=0;j<rc;j++)h+=`<td><span id="n_${i}_${j}" style="color:var(--orange)">0</span></td>`;
    h+='</tr>';
  }
  h+='</table>';

  h+=`<div style="margin-top:12px"><label style="color:var(--text2);font-size:.88em">可用资源向量 A：</label>`;
  for(let i=0;i<rc;i++)h+=`<input type="number" id="avail_${i}" value="0" min="0" size="3" style="width:60px;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:6px;border-radius:4px;margin:0 4px;text-align:center">`;
  h+=`</div>`;

  document.getElementById('bankerTables').innerHTML=h;

  let rq=`<div><label>请求向量（进程 ${document.getElementById('bkReqProc').value}）：</label>`;
  for(let i=0;i<rc;i++)rq+=`<input type="number" id="req_${i}" value="0" min="0" size="3" style="width:60px;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:6px;border-radius:4px;margin:0 4px;text-align:center">`;
  rq+=`</div>`;
  document.getElementById('bankerReqGroup').innerHTML=rq;

  // Update N when P or E changes
  for(let i=0;i<pc;i++){
    for(let j=0;j<rc;j++){
      const updateN=()=>{const p=+document.getElementById(`p_${i}_${j}`).value;const e=+document.getElementById(`e_${i}_${j}`).value;document.getElementById(`n_${i}_${j}`).textContent=Math.max(0,e-p);};
      document.getElementById(`p_${i}_${j}`).addEventListener('input',updateN);
      document.getElementById(`e_${i}_${j}`).addEventListener('input',updateN);
    }
  }
}

function loadBankerExample(){
  document.getElementById('bkResCount').value='1';
  document.getElementById('bkProcCount').value='3';
  document.getElementById('bkReqProc').value='P0';
  buildBankerTable();
  // P1: alloc 25 max 70, P2: alloc 40 max 60, P3: alloc 45 max 60
  const data=[[25,70],[40,60],[45,60]];
  data.forEach((d,i)=>{
    document.getElementById(`p_${i}_0`).value=d[0];
    document.getElementById(`e_${i}_0`).value=d[1];
    document.getElementById(`p_${i}_0`).dispatchEvent(new Event('input'));
  });
  document.getElementById('avail_0').value='40'; // remaining after allocating P0's request
  document.getElementById('req_0').value='25';
}

function runBanker(){
  const rc=+document.getElementById('bkResCount').value;
  const pc=+document.getElementById('bkProcCount').value;
  const procName=document.getElementById('bkReqProc').value;

  const alloc=[],maxm=[],need=[];
  for(let i=0;i<pc;i++){
    alloc[i]=[];maxm[i]=[];need[i]=[];
    for(let j=0;j<rc;j++){
      alloc[i][j]=+document.getElementById(`p_${i}_${j}`).value;
      maxm[i][j]=+document.getElementById(`e_${i}_${j}`).value;
      need[i][j]=maxm[i][j]-alloc[i][j];
    }
  }

  const avail=[];
  for(let j=0;j<rc;j++)avail[j]=+document.getElementById(`avail_${j}`).value;

  const request=[];
  for(let j=0;j<rc;j++)request[j]=+document.getElementById(`req_${j}`).value;

  const procIdx=procName.replace('P','');
  let html=`<h4>银行家算法检查</h4>`;

  // Check request <= need
  const pi=+procIdx;
  if(pi>=pc){html+=`<p style="color:var(--red)">错误：进程 ${procName} 不存在</p>`;document.getElementById('bankerResult').innerHTML=html;return;}
  for(let j=0;j<rc;j++){
    if(request[j]>need[pi][j]){
      html+=`<p style="color:var(--red)">错误：请求超过最大需求！request[${j}]=${request[j]} > need[${j}]=${need[pi][j]}</p>`;
      document.getElementById('bankerResult').innerHTML=html;return;
    }
  }
  for(let j=0;j<rc;j++){
    if(request[j]>avail[j]){
      html+=`<p style="color:var(--orange)">资源不足，进程 ${procName} 必须等待。request[${j}]=${request[j]} > available[${j}]=${avail[j]}</p>`;
      document.getElementById('bankerResult').innerHTML=html;return;
    }
  }

  // Try allocation
  const alloc2=alloc.map(a=>[...a]);const need2=need.map(n=>[...n]);const avail2=[...avail];
  for(let j=0;j<rc;j++){
    alloc2[pi][j]+=request[j];
    need2[pi][j]-=request[j];
    avail2[j]-=request[j];
  }
  html+=`<p style="color:var(--blue)">尝试分配后，剩余资源: [${avail2.join(', ')}]</p>`;

  // Find safe sequence
  const work=[...avail2];const finish=Array(pc).fill(false);const safeSeq=[];let found=true;
  while(found){
    found=false;
    for(let i=0;i<pc;i++){
      if(finish[i])continue;
      let canRun=true;
      for(let j=0;j<rc;j++){if(need2[i][j]>work[j]){canRun=false;break;}}
      if(canRun){
        for(let j=0;j<rc;j++)work[j]+=alloc2[i][j];
        finish[i]=true;
        safeSeq.push('P'+i);
        found=true;
      }
    }
  }

  if(finish.every(f=>f)){
    html+=`<p style="color:var(--green);font-size:1.1em;font-weight:600">✅ 安全状态！安全序列: ${safeSeq.join(' → ')}</p>`;
    html+=`<p>可以将资源分配给 ${procName}</p>`;
  }else{
    html+=`<p style="color:var(--red);font-size:1.1em;font-weight:600">❌ 不安全状态！无法找到安全序列</p>`;
    html+=`<p>应拒绝 ${procName} 的资源请求</p>`;
  }

  document.getElementById('bankerResult').innerHTML=html;
}

// === Disk Scheduling ===
function loadDiskExample(){
  document.getElementById('dkTotal').value='200';
  document.getElementById('dkCurrent').value='143';
  document.getElementById('dkQueue').value='86,147,91,177,94,150,102,175,130';
  document.getElementById('dkDir').value='up';
}

function runDiskSched(){
  const total=+document.getElementById('dkTotal').value;
  const current=+document.getElementById('dkCurrent').value;
  const queue=document.getElementById('dkQueue').value.split(',').map(s=>+s.trim()).filter(n=>!isNaN(n));
  const dir=document.getElementById('dkDir').value;
  if(!queue.length)return;

  function fcfs(cur,q){
    const path=[cur,...q];
    let move=0;
    for(let i=1;i<path.length;i++)move+=Math.abs(path[i]-path[i-1]);
    return{path,move};
  }
  function sstf(cur,q){
    const remaining=[...q];const path=[cur];let pos=cur;let move=0;
    while(remaining.length){
      remaining.sort((a,b)=>Math.abs(a-pos)-Math.abs(b-pos));
      const next=remaining.shift();
      move+=Math.abs(next-pos);
      pos=next;
      path.push(pos);
    }
    return{path,move};
  }
  function scan(cur,q,d,total){
    const sorted=[...q].sort((a,b)=>a-b);const path=[cur];let move=0;let pos=cur;
    const left=sorted.filter(x=>x<cur);const right=sorted.filter(x=>x>=cur);
    if(d==='up'){
      right.forEach(x=>{move+=Math.abs(x-pos);pos=x;path.push(pos);});
      if(left.length){move+=Math.abs(total-1-pos);pos=total-1;path.push(pos);}
      left.reverse().forEach(x=>{move+=Math.abs(x-pos);pos=x;path.push(pos);});
    }else{
      left.reverse().forEach(x=>{move+=Math.abs(x-pos);pos=x;path.push(pos);});
      if(right.length){move+=Math.abs(pos-0);pos=0;path.push(pos);}
      right.forEach(x=>{move+=Math.abs(x-pos);pos=x;path.push(pos);});
    }
    return{path,move};
  }
  function look(cur,q,d){
    const sorted=[...q].sort((a,b)=>a-b);const path=[cur];let move=0;let pos=cur;
    const left=sorted.filter(x=>x<cur);const right=sorted.filter(x=>x>=cur);
    if(d==='up'){
      right.forEach(x=>{move+=Math.abs(x-pos);pos=x;path.push(pos);});
      left.reverse().forEach(x=>{move+=Math.abs(x-pos);pos=x;path.push(pos);});
    }else{
      left.reverse().forEach(x=>{move+=Math.abs(x-pos);pos=x;path.push(pos);});
      right.forEach(x=>{move+=Math.abs(x-pos);pos=x;path.push(pos);});
    }
    return{path,move};
  }
  function cscan(cur,q,total){
    const sorted=[...q].sort((a,b)=>a-b);const path=[cur];let move=0;let pos=cur;
    const right=sorted.filter(x=>x>=cur);const left=sorted.filter(x=>x<cur);
    right.forEach(x=>{move+=Math.abs(x-pos);pos=x;path.push(pos);});
    if(left.length){
      move+=Math.abs(total-1-pos);pos=total-1;path.push(pos);
      move+=Math.abs(pos-0);pos=0;path.push(pos);
      left.forEach(x=>{move+=Math.abs(x-pos);pos=x;path.push(pos);});
    }
    return{path,move};
  }

  const algos=[
    {name:'FCFS 先来先服务',result:fcfs(current,[...queue])},
    {name:'SSTF 最短查找时间优先',result:sstf(current,[...queue])},
    {name:'LOOK 电梯调度',result:look(current,[...queue],dir)},
    {name:'SCAN 扫描算法',result:scan(current,[...queue],dir,total)},
    {name:'C-SCAN 单向扫描',result:cscan(current,[...queue],total)},
  ];

  let html='<h4>磁盘调度算法对比</h4>';
  html+=`<table><tr><th>算法</th><th>移动路径</th><th>总移动磁道数</th></tr>`;
  const colors=['#6c5ce7','#00cec9','#fdcb6e','#ff6b6b','#74b9ff'];
  algos.forEach((a,i)=>{
    html+=`<tr><td style="font-weight:600">${a.name}</td><td style="text-align:left;font-size:.88em">${a.result.path.join(' → ')}</td><td style="font-weight:700;color:${colors[i]}">${a.result.move}</td></tr>`;
  });
  html+=`</table>`;

  // Visual path for each algorithm
  algos.forEach((a,i)=>{
    html+=`<div style="margin:12px 0"><strong>${a.name}</strong><div class="gantt">`;
    a.result.path.forEach((p,j)=>{
      if(j>0)html+=`<span class="gantt-arrow">→</span>`;
      html+=`<div class="gantt-bar" style="background:${colors[i]};min-width:${Math.max(32,Math.abs(j>0?a.result.path[j]-a.result.path[j-1]:0)*0.5+20)}px;font-size:.75em">${p}</div>`;
    });
    html+=`</div></div>`;
  });

  document.getElementById('diskResult').innerHTML=html;
}

// === Quiz ===
function checkQuiz(btn){
  var container=btn.closest('.quiz-container');
  var correct=parseInt(container.dataset.correct);
  var selected=container.querySelector('input:checked');
  var result=container.querySelector('.quiz-result');
  if(!selected){result.textContent='请先选择答案';result.className='quiz-result quiz-wrong';return;}
  if(parseInt(selected.value)===correct){
    result.textContent='✓ 正确！';result.className='quiz-result quiz-correct';
  }else{
    result.textContent='✗ 错误，正确答案是 '+container.querySelectorAll('.quiz-options label')[correct].textContent;
    result.className='quiz-result quiz-wrong';
  }
}

// Fill-in-the-blank check
function checkFill(btn) {
  var c = btn.closest('.quiz-container');
  var input = c.querySelector('.fill-input');
  var result = c.querySelector('.quiz-result');
  var answer = c.querySelector('.fill-answer');
  if (!input.value.trim()) { result.textContent = '请填写答案'; result.className = 'quiz-result quiz-wrong'; return; }
  answer.style.display = 'block';
  result.textContent = '已显示参考答案，请自行对照';
  result.className = 'quiz-result quiz-correct';
}

// Essay answer toggle
function toggleAnswer(btn) {
  var c = btn.closest('.quiz-container');
  var answer = c.querySelector('.essay-answer');
  answer.style.display = answer.style.display === 'none' ? 'block' : 'none';
  btn.textContent = answer.style.display === 'none' ? '查看参考答案' : '隐藏参考答案';
}

// Init
buildBankerTable();
function toggleSidebar(){var s=document.getElementById('sidebar');var o=document.getElementById('sidebarOverlay');s.classList.toggle('open');o.classList.toggle('show');}
if(!localStorage.getItem('sg_done_os'))document.getElementById('subGuide').style.display='flex';
