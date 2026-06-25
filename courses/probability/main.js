// Toggle sections
function toggleSection(header) {
  header.parentElement.classList.toggle('collapsed');
}

// Progress bar
window.addEventListener('scroll', () => {
  const h = document.documentElement;
  const pct = h.scrollTop / (h.scrollHeight - h.clientHeight) * 100;
  document.getElementById('progressFill').style.width = pct + '%';
  document.getElementById('backTop').style.display = h.scrollTop > 400 ? 'flex' : 'none';
});

// Active nav link
const sections = document.querySelectorAll('.section[id], .part-title[id]');
const navLinks = document.querySelectorAll('.sidebar a[href^="#"]');
const observer = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      navLinks.forEach(l => l.classList.remove('active'));
      const link = document.querySelector(`.sidebar a[href="#${e.target.id}"]`);
      if (link) link.classList.add('active');
    }
  });
}, { rootMargin: '-20% 0px -70% 0px' });
document.querySelectorAll('[id]').forEach(s => observer.observe(s));

// Search
function filterNav(query) {
  const q = query.toLowerCase();
  navLinks.forEach(a => {
    const text = (a.textContent + ' ' + (a.dataset.keywords || '')).toLowerCase();
    a.style.display = text.includes(q) ? '' : 'none';
  });
}

// Render KaTeX on load
document.addEventListener('DOMContentLoaded', () => {
  if (typeof renderMathInElement === 'function') {
    renderMathInElement(document.body, {
      delimiters: [
        {left: '\\(', right: '\\)', display: false},
        {left: '\\[', right: '\\]', display: true},
        {left: '$$', right: '$$', display: true}
      ],
      throwOnError: false
    });
  }
});
// Fallback if auto-render loads after DOMContentLoaded
window.addEventListener('load', () => {
  if (typeof renderMathInElement === 'function') {
    renderMathInElement(document.body, {
      delimiters: [
        {left: '\\(', right: '\\)', display: false},
        {left: '\\[', right: '\\]', display: true},
        {left: '$$', right: '$$', display: true}
      ],
      throwOnError: false
    });
  }
});
function toggleSidebar(){
  var s=document.querySelector('.sidebar');
  var o=document.getElementById('sidebarOverlay');
  s.classList.toggle('open');
  o.classList.toggle('show');
}
if(!localStorage.getItem('sg_done_prob'))document.getElementById('subGuide').style.display='flex';
