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
