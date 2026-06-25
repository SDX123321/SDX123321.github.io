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
  // Close mobile nav
  if (window.innerWidth <= 768) {
    document.querySelector('.nav').classList.remove('open');
  }
}

// Scroll progress
window.addEventListener('scroll', () => {
  const h = document.documentElement;
  const pct = (h.scrollTop / (h.scrollHeight - h.clientHeight)) * 100;
  document.getElementById('progress').style.width = pct + '%';

  // Update active nav link
  const sections = document.querySelectorAll('[id]');
  let current = '';
  sections.forEach(s => {
    if (s.getBoundingClientRect().top <= 120) current = s.id;
  });
  document.querySelectorAll('.nav a').forEach(a => {
    a.classList.toggle('active', a.getAttribute('href') === '#' + current);
  });
});

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

// Theme toggle
function applyTheme(dark){document.documentElement.classList.toggle('light',!dark);document.getElementById('themeBtn').innerHTML=dark?'&#9790;':'&#9789;';localStorage.setItem('theme',dark?'dark':'light');}
function toggleTheme(){applyTheme(document.documentElement.classList.contains('light'));}
(function(){var t=localStorage.getItem('theme');if(t==='light')applyTheme(false);else applyTheme(true);})();
if(!localStorage.getItem('sg_done_dsp'))document.getElementById('subGuide').style.display='flex';
