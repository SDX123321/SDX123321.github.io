// === Chapter Stats Module ===
// Adds word count, reading time, dwell time, visit count per chapter

(function(){
  // ---- Config ----
  var PAGE_KEY = document.title.replace(/[^a-zA-Z0-9一-鿿]/g,'_').substring(0,30);
  var CHARS_PER_MIN = 400; // Chinese reading speed

  // ---- Visit Count ----
  var visitKey = 'visits_' + PAGE_KEY;
  var visits = parseInt(localStorage.getItem(visitKey) || '0') + 1;
  localStorage.setItem(visitKey, visits);

  // ---- Dwell Time Tracking ----
  var dwellKey = 'dwell_' + PAGE_KEY;
  var dwellData = JSON.parse(localStorage.getItem(dwellKey) || '{}');
  var startTime = Date.now();
  var currentSection = null;

  // ---- Detect page type and find sections ----
  function findSections(){
    var sections = [];
    // Probability page: .section with id
    document.querySelectorAll('.section[id], .chapter-section[id], section[id]').forEach(function(el){
      var id = el.id;
      if(!id || id === 'home') return;
      var title = el.querySelector('h2, h3, .chapter-title h2');
      var titleText = title ? title.textContent.trim().replace(/[▼▸▾▶<span>].*/g,'').trim() : id;
      // Skip non-chapter sections
      if(titleText.match(/quiz|测验|练习|自测|考试|对比|补遗/i)) return;
      sections.push({el: el, id: id, title: titleText});
    });
    return sections;
  }

  // ---- Word Count ----
  function countWords(el){
    var text = el.textContent || '';
    // Remove extra whitespace
    text = text.replace(/\s+/g, ' ').trim();
    // Count Chinese characters
    var chinese = (text.match(/[一-鿿]/g) || []).length;
    // Count English words (sequences of latin chars)
    var english = (text.match(/[a-zA-Z]+/g) || []).length;
    // Count numbers
    var numbers = (text.match(/\d+/g) || []).length;
    return chinese + english + numbers;
  }

  // ---- Reading Time ----
  function readingTime(wordCount){
    var minutes = Math.ceil(wordCount / CHARS_PER_MIN);
    if(minutes < 1) return '< 1 min';
    if(minutes < 60) return minutes + ' min';
    var hours = Math.floor(minutes / 60);
    var mins = minutes % 60;
    return hours + 'h ' + mins + 'min';
  }

  // ---- Dwell Time Format ----
  function formatDwell(seconds){
    if(seconds < 60) return seconds + 's';
    var m = Math.floor(seconds / 60);
    var s = seconds % 60;
    if(m < 60) return m + 'min ' + s + 's';
    var h = Math.floor(m / 60);
    m = m % 60;
    return h + 'h ' + m + 'min';
  }

  // ---- Build Stats Panel ----
  function buildPanel(){
    var sections = findSections();
    if(sections.length === 0) return;

    // Create toggle button
    var btn = document.createElement('div');
    btn.id = 'statsToggle';
    btn.innerHTML = '&#128202;';
    btn.style.cssText = 'position:fixed;bottom:12px;right:70px;width:36px;height:36px;border-radius:50%;background:var(--primary,#2563eb);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:1rem;z-index:85;box-shadow:0 2px 8px rgba(0,0,0,.2);transition:transform .2s';
    btn.onmouseover = function(){this.style.transform='scale(1.1)';};
    btn.onmouseout = function(){this.style.transform='scale(1)';};
    document.body.appendChild(btn);

    // Create panel
    var panel = document.createElement('div');
    panel.id = 'statsPanel';
    panel.style.cssText = 'display:none;position:fixed;bottom:56px;right:16px;width:340px;max-height:70vh;overflow-y:auto;background:var(--card,#1e293b);border:1px solid var(--border,#334155);border-radius:12px;padding:16px;z-index:85;box-shadow:0 8px 30px rgba(0,0,0,.3);font-size:13px;color:var(--text,#e2e8f0)';

    // Header
    var header = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid var(--border,#334155)">';
    header += '<span style="font-weight:700;font-size:14px">&#128202; 章节统计</span>';
    header += '<span style="font-size:11px;color:var(--text2,#94a3b8)">总访问 <strong>' + visits + '</strong> 次</span>';
    header += '</div>';

    // Table
    header += '<table style="width:100%;border-collapse:collapse;font-size:12px">';
    header += '<tr style="border-bottom:1px solid var(--border,#334155)">';
    header += '<th style="text-align:left;padding:6px 4px;color:var(--text2,#94a3b8);font-weight:600">章节</th>';
    header += '<th style="text-align:right;padding:6px 4px;color:var(--text2,#94a3b8);font-weight:600">字数</th>';
    header += '<th style="text-align:right;padding:6px 4px;color:var(--text2,#94a3b8);font-weight:600">阅读</th>';
    header += '<th style="text-align:right;padding:6px 4px;color:var(--text2,#94a3b8);font-weight:600">停留</th>';
    header += '</tr>';

    var totalWords = 0;
    var totalDwell = 0;

    sections.forEach(function(s){
      var words = countWords(s.el);
      var rt = readingTime(words);
      var dwell = dwellData[s.id] || 0;
      totalWords += words;
      totalDwell += dwell;

      var shortTitle = s.title.length > 12 ? s.title.substring(0,12) + '...' : s.title;
      header += '<tr style="border-bottom:1px solid rgba(128,128,128,.08)">';
      header += '<td style="padding:5px 4px" title="' + s.title + '">' + shortTitle + '</td>';
      header += '<td style="text-align:right;padding:5px 4px;font-variant-numeric:tabular-nums">' + (words > 1000 ? (words/1000).toFixed(1) + 'k' : words) + '</td>';
      header += '<td style="text-align:right;padding:5px 4px;color:var(--accent,#60a5fa)">' + rt + '</td>';
      header += '<td style="text-align:right;padding:5px 4px;color:var(--green,#10b981)">' + formatDwell(Math.round(dwell)) + '</td>';
      header += '</tr>';
    });

    // Total row
    header += '<tr style="font-weight:700;border-top:2px solid var(--border,#334155)">';
    header += '<td style="padding:6px 4px">合计</td>';
    header += '<td style="text-align:right;padding:6px 4px">' + (totalWords > 1000 ? (totalWords/1000).toFixed(1) + 'k' : totalWords) + '</td>';
    header += '<td style="text-align:right;padding:6px 4px;color:var(--accent,#60a5fa)">' + readingTime(totalWords) + '</td>';
    header += '<td style="text-align:right;padding:6px 4px;color:var(--green,#10b981)">' + formatDwell(Math.round(totalDwell)) + '</td>';
    header += '</tr>';
    header += '</table>';

    panel.innerHTML = header;
    document.body.appendChild(panel);

    // Toggle
    var open = false;
    btn.addEventListener('click', function(){
      open = !open;
      panel.style.display = open ? 'block' : 'none';
    });

    // Close on outside click
    document.addEventListener('click', function(e){
      if(open && !panel.contains(e.target) && e.target !== btn){
        panel.style.display = 'none';
        open = false;
      }
    });

    // ---- Dwell Time Tracking with IntersectionObserver ----
    if('IntersectionObserver' in window){
      var observer = new IntersectionObserver(function(entries){
        entries.forEach(function(entry){
          var id = entry.target.id;
          if(entry.isIntersecting){
            currentSection = id;
            entry.target._dwellStart = Date.now();
          } else if(entry.target._dwellStart){
            var elapsed = (Date.now() - entry.target._dwellStart) / 1000;
            dwellData[id] = (dwellData[id] || 0) + elapsed;
            entry.target._dwellStart = null;
            localStorage.setItem(dwellKey, JSON.stringify(dwellData));
          }
        });
      }, {threshold: 0.3});

      sections.forEach(function(s){ observer.observe(s.el); });
    }

    // Save dwell on page unload
    window.addEventListener('beforeunload', function(){
      sections.forEach(function(s){
        if(s.el._dwellStart){
          var elapsed = (Date.now() - s.el._dwellStart) / 1000;
          dwellData[s.id] = (dwellData[s.id] || 0) + elapsed;
        }
      });
      localStorage.setItem(dwellKey, JSON.stringify(dwellData));
    });
  }

  // ---- Init ----
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', buildPanel);
  } else {
    buildPanel();
  }
})();
