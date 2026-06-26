// Chapter word count & reading time
(function addChapterMeta() {
  const sections = document.querySelectorAll('.main h2[id]');
  sections.forEach(h2 => {
    // Collect all content until next h2
    let textLen = 0;
    let el = h2.nextElementSibling;
    while (el && el.tagName !== 'H2') {
      if (el.classList && el.classList.contains('section-divider')) break;
      const txt = el.textContent || '';
      textLen += txt.length;
      el = el.nextElementSibling;
    }
    // Chinese reading speed: ~300 chars/min for technical content with formulas
    const chars = textLen;
    const readMin = Math.max(1, Math.round(chars / 300));
    const meta = document.createElement('div');
    meta.className = 'chapter-meta';
    meta.style.cssText = 'display:flex;gap:12px;margin:4px 0 12px;font-size:12px;color:var(--text-dim);flex-wrap:wrap;';
    meta.innerHTML = `<span>📝 约 ${chars.toLocaleString()} 字</span><span>⏱ 阅读约 ${readMin} 分钟</span>`;
    h2.insertAdjacentElement('afterend', meta);
  });
})();

// Toggle collapsible sections
function toggleCollapse(el) {
  el.classList.toggle('open');
  const content = el.nextElementSibling;
  if (content) content.classList.toggle('show');
}

// Quiz checking
function checkQuiz(btn) {
  const container = btn.parentElement;
  const correct = parseInt(container.dataset.correct);
  const selected = container.querySelector('input:checked');
  const resultDiv = container.querySelector('.quiz-result');

  if (!selected) {
    resultDiv.className = 'quiz-result quiz-wrong';
    resultDiv.textContent = '请先选择一个选项！';
    return;
  }

  const answer = parseInt(selected.value);
  if (answer === correct) {
    resultDiv.className = 'quiz-result quiz-correct';
    resultDiv.textContent = '✓ 回答正确！';
  } else {
    resultDiv.className = 'quiz-result quiz-wrong';
    const labels = container.querySelectorAll('label');
    resultDiv.textContent = '✗ 回答错误。正确答案是：' + labels[correct].textContent.trim();
  }
  resultDiv.style.display = 'block';
}

// Navigation
function navClick(el) {
  document.querySelectorAll('.nav a').forEach(a => a.classList.remove('active'));
  el.classList.add('active');
  // Smooth scroll to target
  const targetId = el.getAttribute('href');
  if (targetId && targetId.startsWith('#')) {
    const target = document.getElementById(targetId.slice(1));
    if (target) {
      const y = target.getBoundingClientRect().top + window.pageYOffset - 70;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  }
  // Close mobile nav
  if (window.innerWidth <= 768) {
    document.querySelector('.nav').classList.remove('open');
  }
}

// Scroll progress + improved scroll spy
(function() {
  const navLinks = document.querySelectorAll('.nav a[href^="#"]');
  const sectionIds = [];
  navLinks.forEach(a => {
    const id = a.getAttribute('href').slice(1);
    if (id) sectionIds.push(id);
  });

  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const h = document.documentElement;
      const scrollTop = h.scrollTop || document.body.scrollTop;
      const pct = (scrollTop / (h.scrollHeight - h.clientHeight)) * 100;
      document.getElementById('progress').style.width = pct + '%';

      // Scroll spy: find current section
      const offset = 80; // fixed header offset
      let currentId = sectionIds[0] || '';
      for (let i = 0; i < sectionIds.length; i++) {
        const el = document.getElementById(sectionIds[i]);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (rect.top <= offset + 10) {
          currentId = sectionIds[i];
        }
      }
      // If near bottom, highlight last section
      if (scrollTop + h.clientHeight >= h.scrollHeight - 50) {
        currentId = sectionIds[sectionIds.length - 1];
      }

      navLinks.forEach(a => {
        const isActive = a.getAttribute('href') === '#' + currentId;
        a.classList.toggle('active', isActive);
        // Auto-scroll nav to keep active link visible
        if (isActive) {
          const nav = document.querySelector('.nav');
          const linkTop = a.offsetTop - nav.offsetTop;
          if (linkTop < nav.scrollTop || linkTop > nav.scrollTop + nav.clientHeight - 40) {
            a.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          }
        }
      });
      ticking = false;
    });
  });
})();

// Save quiz progress to localStorage
function saveProgress() {
  const checks = {};
  document.querySelectorAll('.quiz-container').forEach((c, i) => {
    const sel = c.querySelector('input:checked');
    if (sel) checks[i] = sel.value;
  });
  localStorage.setItem('dsp-quiz-progress', JSON.stringify(checks));
}

document.querySelectorAll('.quiz-options input').forEach(input => {
  input.addEventListener('change', saveProgress);
});

// Load saved progress
(function loadProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem('dsp-quiz-progress') || '{}');
    Object.entries(saved).forEach(([i, v]) => {
      const container = document.querySelectorAll('.quiz-container')[i];
      if (container) {
        const radio = container.querySelector(`input[value="${v}"]`);
        if (radio) radio.checked = true;
      }
    });
  } catch(e) {}
})();

if(!localStorage.getItem('sg_done_dsp'))document.getElementById('subGuide').style.display='flex';

// ========== Signal Flow Graph Renderer ==========
function renderFlowGraph(containerId, cfg) {
  const c = document.getElementById(containerId);
  if (!c) return;
  const W = cfg.w || 700, H = cfg.h || 220;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.style.cssText = 'width:100%;max-width:'+W+'px;display:block;margin:0 auto;';

  // Arrow marker
  const defs = document.createElementNS(ns, 'defs');
  defs.innerHTML = '<marker id="ah-'+containerId+'" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="var(--text,#aaa)"/></marker>';
  svg.appendChild(defs);

  // Draw branches
  (cfg.branches || []).forEach(b => {
    const n1 = cfg.nodes[b.from], n2 = cfg.nodes[b.to];
    if (!n1 || !n2) return;
    const x1 = n1.x, y1 = n1.y, x2 = n2.x, y2 = n2.y;
    const path = document.createElementNS(ns, 'path');
    let d;
    if (b.dy) {
      // Curved path
      const mx = (x1+x2)/2, my = (y1+y2)/2 + b.dy;
      d = `M${x1},${y1} Q${mx},${my} ${x2},${y2}`;
    } else {
      d = `M${x1},${y1} L${x2},${y2}`;
    }
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'var(--text-dim,#666)');
    path.setAttribute('stroke-width', '1.5');
    path.setAttribute('marker-end', `url(#ah-${containerId})`);
    svg.appendChild(path);

    // Label
    if (b.label) {
      const lx = (x1+x2)/2 + (b.lx||0);
      const ly = (y1+y2)/2 + (b.ly||0) + (b.dy ? b.dy/2 : 0);
      const txt = document.createElementNS(ns, 'text');
      txt.setAttribute('x', lx);
      txt.setAttribute('y', ly);
      txt.setAttribute('text-anchor', 'middle');
      txt.setAttribute('fill', b.color || 'var(--accent2,#00d2ff)');
      txt.setAttribute('font-size', '13');
      txt.setAttribute('font-weight', '600');
      txt.textContent = b.label;
      svg.appendChild(txt);
    }
  });

  // Draw nodes
  Object.values(cfg.nodes).forEach(n => {
    if (n.type === 'port') {
      // Input/output circle
      const cir = document.createElementNS(ns, 'circle');
      cir.setAttribute('cx', n.x); cir.setAttribute('cy', n.y);
      cir.setAttribute('r', 14);
      cir.setAttribute('fill', n.color || 'var(--accent,#6c63ff)');
      cir.setAttribute('stroke', 'none');
      svg.appendChild(cir);
      if (n.label) {
        const txt = document.createElementNS(ns, 'text');
        txt.setAttribute('x', n.x); txt.setAttribute('y', n.y + (n.labelY || 30));
        txt.setAttribute('text-anchor', 'middle');
        txt.setAttribute('fill', 'var(--text,#ccc)');
        txt.setAttribute('font-size', '14'); txt.setAttribute('font-weight', '600');
        txt.textContent = n.label;
        svg.appendChild(txt);
      }
    } else if (n.type === 'delay') {
      // Rectangle for z^{-1}
      const rect = document.createElementNS(ns, 'rect');
      rect.setAttribute('x', n.x - 25); rect.setAttribute('y', n.y - 16);
      rect.setAttribute('width', 50); rect.setAttribute('height', 32);
      rect.setAttribute('rx', 5);
      rect.setAttribute('fill', 'var(--card,#1a1d2e)');
      rect.setAttribute('stroke', 'var(--accent,#6c63ff)');
      rect.setAttribute('stroke-width', '1.5');
      svg.appendChild(rect);
      const txt = document.createElementNS(ns, 'text');
      txt.setAttribute('x', n.x); txt.setAttribute('y', n.y + 5);
      txt.setAttribute('text-anchor', 'middle');
      txt.setAttribute('fill', 'var(--accent,#6c63ff)');
      txt.setAttribute('font-size', '13');
      txt.textContent = n.label || 'z⁻¹';
      svg.appendChild(txt);
    } else if (n.type === 'sum') {
      // Circle with + for adder
      const cir = document.createElementNS(ns, 'circle');
      cir.setAttribute('cx', n.x); cir.setAttribute('cy', n.y);
      cir.setAttribute('r', 14);
      cir.setAttribute('fill', 'var(--card,#1a1d2e)');
      cir.setAttribute('stroke', 'var(--orange,#f39c12)');
      cir.setAttribute('stroke-width', '1.5');
      svg.appendChild(cir);
      const txt = document.createElementNS(ns, 'text');
      txt.setAttribute('x', n.x); txt.setAttribute('y', n.y + 5);
      txt.setAttribute('text-anchor', 'middle');
      txt.setAttribute('fill', 'var(--orange,#f39c12)');
      txt.setAttribute('font-size', '14'); txt.setAttribute('font-weight', '700');
      txt.textContent = '+';
      svg.appendChild(txt);
    } else if (n.type === 'junction') {
      // Small dot for signal tap
      const cir = document.createElementNS(ns, 'circle');
      cir.setAttribute('cx', n.x); cir.setAttribute('cy', n.y);
      cir.setAttribute('r', 4);
      cir.setAttribute('fill', 'var(--text-dim,#888)');
      svg.appendChild(cir);
    } else if (n.type === 'block') {
      // Generic labeled block (for cascade/parallel sections)
      const rect = document.createElementNS(ns, 'rect');
      rect.setAttribute('x', n.x - (n.w||60)/2); rect.setAttribute('y', n.y - 22);
      rect.setAttribute('width', n.w||60); rect.setAttribute('height', 44);
      rect.setAttribute('rx', 8);
      rect.setAttribute('fill', 'var(--card,#1a1d2e)');
      rect.setAttribute('stroke', n.color || 'var(--accent2,#00d2ff)');
      rect.setAttribute('stroke-width', '2');
      svg.appendChild(rect);
      if (n.label) {
        const lines = n.label.split('\n');
        lines.forEach((line, i) => {
          const txt = document.createElementNS(ns, 'text');
          txt.setAttribute('x', n.x);
          txt.setAttribute('y', n.y + 5 - (lines.length-1)*8 + i*16);
          txt.setAttribute('text-anchor', 'middle');
          txt.setAttribute('fill', 'var(--text,#ccc)');
          txt.setAttribute('font-size', '12');
          txt.textContent = line;
          svg.appendChild(txt);
        });
      }
    }
  });
  c.appendChild(svg);
}

// ========== IIR & FIR Diagram Data ==========
function renderDiagrams() {
  // --- IIR Direct I ---
  renderFlowGraph('iir-direct1', {
    w: 680, h: 210,
    nodes: {
      x: {x:40,y:90,type:'port',label:'x(n)'},
      d1: {x:200,y:90,type:'delay'}, d2: {x:360,y:90,type:'delay'},
      s1: {x:520,y:90,type:'sum'}, j1: {x:140,y:90,type:'junction'},
      j2: {x:300,y:90,type:'junction'}, j3: {x:460,y:90,type:'junction'},
      y: {x:640,y:90,type:'port',label:'y(n)'}
    },
    branches: [
      {from:'x',to:'j1',label:''},
      {from:'j1',to:'d1',label:''},
      {from:'d1',to:'j2',label:''},
      {from:'j2',to:'d2',label:''},
      {from:'d2',to:'j3',label:''},
      {from:'j3',to:'s1',label:'b₂=1',ly:-8},
      // Feedforward (top)
      {from:'j1',to:'s1',label:'b₀=1',dy:-50,lx:30,ly:-8,color:'var(--green,#2ecc71)'},
      {from:'j2',to:'s1',label:'b₁=2.5',dy:-50,lx:20,ly:-8,color:'var(--green,#2ecc71)'},
      {from:'s1',to:'y',label:''},
      // Feedback (bottom)
      {from:'s1',to:'j3',label:'-a₁=0.75',dy:55,lx:40,ly:18,color:'var(--red,#e74c3c)'},
      {from:'j3',to:'j2',label:'',dy:0},
      {from:'s1',to:'j2',label:'-a₂=-0.125',dy:65,lx:-10,ly:18,color:'var(--red,#e74c3c)'},
    ]
  });

  // --- IIR Direct II ---
  renderFlowGraph('iir-direct2', {
    w: 680, h: 210,
    nodes: {
      x: {x:40,y:90,type:'port',label:'x(n)'},
      s1: {x:140,y:90,type:'sum'},
      d1: {x:280,y:90,type:'delay'}, d2: {x:420,y:90,type:'delay'},
      j1: {x:350,y:90,type:'junction'}, j2: {x:490,y:90,type:'junction'},
      s2: {x:560,y:90,type:'sum'},
      y: {x:650,y:90,type:'port',label:'y(n)'}
    },
    branches: [
      {from:'x',to:'s1',label:''},
      // Feedback (bottom, left side)
      {from:'j1',to:'s1',label:'-a₁=0.75',dy:60,lx:30,ly:18,color:'var(--red,#e74c3c)'},
      {from:'j2',to:'s1',label:'-a₂=-0.125',dy:65,lx:-10,ly:18,color:'var(--red,#e74c3c)'},
      // Delay chain
      {from:'s1',to:'d1',label:''},
      {from:'d1',to:'j1',label:''},
      {from:'j1',to:'d2',label:''},
      {from:'d2',to:'j2',label:''},
      // Feedforward (top, right side)
      {from:'j1',to:'s2',label:'b₁=2.5',dy:-50,lx:20,ly:-8,color:'var(--green,#2ecc71)'},
      {from:'j2',to:'s2',label:'b₂=1',dy:-50,lx:30,ly:-8,color:'var(--green,#2ecc71)'},
      // Direct feedforward
      {from:'s1',to:'s2',label:'b₀=1',dy:-50,lx:0,ly:-8,color:'var(--green,#2ecc71)'},
      {from:'s2',to:'y',label:''},
    ]
  });

  // --- IIR Cascade ---
  renderFlowGraph('iir-cascade', {
    w: 680, h: 180,
    nodes: {
      x: {x:40,y:80,type:'port',label:'x(n)'},
      h1: {x:250,y:80,type:'block',w:180,label:'第一阶节\nb=[1,1], a=[1,-0.25]',color:'var(--accent,#6c63ff)'},
      h2: {x:530,y:80,type:'block',w:180,label:'第二阶节\nb=[1,1], a=[1,-0.25]',color:'var(--accent,#6c63ff)'},
      y: {x:660,y:80,type:'port',label:'y(n)'}
    },
    branches: [
      {from:'x',to:'h1',label:''},
      {from:'h1',to:'h2',label:''},
      {from:'h2',to:'y',label:''},
    ]
  });

  // --- IIR Parallel ---
  renderFlowGraph('iir-parallel', {
    w: 680, h: 230,
    nodes: {
      x: {x:40,y:100,type:'port',label:'x(n)'},
      j1: {x:120,y:100,type:'junction'},
      h0: {x:250,y:40,type:'block',w:80,label:'C=24',color:'var(--orange,#f39c12)'},
      h1: {x:250,y:100,type:'block',w:180,label:'A/(1-0.25z⁻¹)\nA=-15',color:'var(--accent,#6c63ff)'},
      h2: {x:250,y:170,type:'block',w:200,label:'Bz⁻¹/(1-0.25z⁻¹)²\nB=96',color:'var(--accent,#6c63ff)'},
      s1: {x:520,y:100,type:'sum'},
      y: {x:640,y:100,type:'port',label:'y(n)'}
    },
    branches: [
      {from:'x',to:'j1',label:''},
      {from:'j1',to:'h0',label:'',dy:-20},
      {from:'j1',to:'h1',label:''},
      {from:'j1',to:'h2',label:'',dy:20},
      {from:'h0',to:'s1',label:'',dy:-20},
      {from:'h1',to:'s1',label:''},
      {from:'h2',to:'s1',label:'',dy:20},
      {from:'s1',to:'y',label:''},
    ]
  });

  // --- FIR Transversal ---
  renderFlowGraph('fir-trans', {
    w: 680, h: 200,
    nodes: {
      x: {x:30,y:80,type:'port',label:'x(n)'},
      d1: {x:150,y:80,type:'delay'}, d2: {x:270,y:80,type:'delay'},
      d3: {x:390,y:80,type:'delay'}, d4: {x:510,y:80,type:'delay'},
      j0: {x:60,y:80,type:'junction'}, j1: {x:180,y:80,type:'junction'},
      j2: {x:300,y:80,type:'junction'}, j3: {x:420,y:80,type:'junction'},
      j4: {x:540,y:80,type:'junction'},
      s1: {x:610,y:80,type:'sum'},
      y: {x:660,y:80,type:'port',label:'y(n)'}
    },
    branches: [
      {from:'x',to:'j0',label:''},
      {from:'j0',to:'d1',label:''},{from:'d1',to:'j1',label:''},
      {from:'j1',to:'d2',label:''},{from:'d2',to:'j2',label:''},
      {from:'j2',to:'d3',label:''},{from:'d3',to:'j3',label:''},
      {from:'j3',to:'d4',label:''},{from:'d4',to:'j4',label:''},
      {from:'j4',to:'s1',label:'h(4)=1',ly:-8},
      {from:'j0',to:'s1',label:'h(0)=1',dy:-50,lx:20,ly:-8,color:'var(--green,#2ecc71)'},
      {from:'j1',to:'s1',label:'h(1)=2',dy:-50,lx:10,ly:-8,color:'var(--green,#2ecc71)'},
      {from:'j2',to:'s1',label:'h(2)=3',dy:-50,lx:0,ly:-8,color:'var(--green,#2ecc71)'},
      {from:'j3',to:'s1',label:'h(3)=2',dy:-50,lx:-10,ly:-8,color:'var(--green,#2ecc71)'},
      {from:'s1',to:'y',label:''},
    ]
  });

  // --- FIR Linear Phase ---
  renderFlowGraph('fir-linphase', {
    w: 680, h: 230,
    nodes: {
      x: {x:30,y:100,type:'port',label:'x(n)'},
      d1: {x:160,y:100,type:'delay'}, d2: {x:310,y:100,type:'delay'},
      j0: {x:70,y:100,type:'junction'}, j1: {x:210,y:100,type:'junction'},
      j2: {x:360,y:100,type:'junction'},
      s0: {x:110,y:40,type:'sum'}, s1: {x:260,y:40,type:'sum'},
      s2: {x:420,y:40,type:'sum'},
      m0: {x:110,y:20,type:'junction'}, m1: {x:260,y:20,type:'junction'},
      m2: {x:420,y:20,type:'junction'},
      s_out: {x:540,y:100,type:'sum'},
      y: {x:650,y:100,type:'port',label:'y(n)'}
    },
    branches: [
      {from:'x',to:'j0',label:''},
      {from:'j0',to:'d1',label:''},{from:'d1',to:'j1',label:''},
      {from:'j1',to:'d2',label:''},{from:'d2',to:'j2',label:''},
      // Top: add symmetric pairs
      {from:'j0',to:'s0',label:'',dy:-30},
      {from:'j2',to:'s0',label:'',dy:-30,lx:60},
      {from:'s0',to:'m0',label:'×h(0)=1',ly:-8,color:'var(--green,#2ecc71)'},
      {from:'j1',to:'s1',label:'',dy:-30},
      {from:'j1',to:'s1',label:'',dy:-30,lx:10},
      {from:'s1',to:'m1',label:'×h(1)=2',ly:-8,color:'var(--green,#2ecc71)'},
      // Middle tap
      {from:'j2',to:'s2',label:'h(2)=3',dy:-30,ly:-8,color:'var(--green,#2ecc71)'},
      // All to output
      {from:'m0',to:'s_out',label:'',dy:-35},
      {from:'m1',to:'s_out',label:'',dy:-35,lx:20},
      {from:'s2',to:'s_out',label:'',dy:-35,lx:-20},
      {from:'s_out',to:'y',label:''},
    ]
  });
}

document.addEventListener('DOMContentLoaded', renderDiagrams);
