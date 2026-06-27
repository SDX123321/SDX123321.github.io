// === UX Enhancements Module ===
// Feature 9:  Keyboard shortcut help modal
// Feature 10: "上次学到这里" restore marker
// Feature 11: Chapter completion checkboxes + progress

(function () {
  'use strict';

  // ---- Shared helpers ----
  var PAGE_ID = document.title.replace(/[^a-zA-Z0-9一-鿿]/g, '_').substring(0, 30);
  var SCROLL_KEY = 'scroll_' + location.pathname.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 40);

  // Detect if we're on the homepage
  function isHomepage() {
    var p = location.pathname;
    return p === '/' || p === '/index.html' || p.endsWith('/site/') || p.endsWith('/site/index.html') ||
      (document.querySelector('.cards') !== null && document.querySelector('.card[href*="courses/"]') !== null);
  }

  // Detect if we're on a course page (has h2 headings with chapter content)
  function isCoursePage() {
    return document.querySelectorAll('.section h2, main h2, h2[id^="ch"], h2').length > 2 && !isHomepage();
  }

  // ---- Inject CSS ----
  var CSS = [
    /* Feature 9: Shortcut help */
    '.ux-shortcut-btn{position:fixed;bottom:80px;right:30px;width:36px;height:36px;border-radius:50%;background:var(--card,#1a1d27);border:1px solid var(--border,#2d3436);color:var(--text3,#8892b0);display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:.9rem;font-weight:700;z-index:98;transition:all .2s;user-select:none}',
    '.ux-shortcut-btn:hover{border-color:var(--accent,#6c63ff);color:var(--accent,#6c63ff);transform:scale(1.1)}',
    '.ux-modal{display:none;position:fixed;top:0;left:0;right:0;bottom:0;z-index:10001;background:rgba(0,0,0,.5);align-items:center;justify-content:center}',
    '.ux-modal.show{display:flex}',
    '.ux-modal-box{background:var(--card,#1a1d27);border-radius:16px;padding:28px;max-width:500px;width:92vw;border:1px solid var(--border,#2d3436);box-shadow:0 12px 40px rgba(0,0,0,.4);animation:uxModalIn .25s ease}',
    '@keyframes uxModalIn{from{opacity:0;transform:scale(.95) translateY(8px)}to{opacity:1;transform:scale(1) translateY(0)}}',
    '.ux-modal-box h3{margin:0 0 16px;font-size:1.05rem;color:var(--text,#e8eaf0)}',
    '.ux-shortcut-list{list-style:none;padding:0;margin:0}',
    '.ux-shortcut-list li{display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid rgba(128,128,128,.1);font-size:.88rem;color:var(--text2,#9ba1b8)}',
    '.ux-shortcut-list li:last-child{border-bottom:none}',
    '.ux-kbd{display:inline-block;padding:2px 8px;border-radius:6px;background:var(--bg3,#1e2235);border:1px solid var(--border,#2d3436);font-family:monospace;font-size:.8rem;color:var(--text,#e8eaf0);min-width:24px;text-align:center}',

    /* Feature 10: Restore marker bubble */
    '.ux-marker{position:absolute;left:20px;top:0;z-index:55;pointer-events:auto;animation:uxBubbleIn .45s cubic-bezier(.34,1.56,.64,1)}',
    '.ux-marker-inner{position:relative;display:flex;align-items:center;gap:12px;padding:12px 16px 12px 14px;background:var(--card,#1e2235);border:1px solid var(--border,#2d3436);border-left:3px solid var(--accent,#6c63ff);border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,.25),0 0 0 1px rgba(108,99,255,.08);min-width:220px;max-width:320px',
    '.ux-marker-arrow{position:absolute;left:-7px;top:50%;transform:translateY(-50%) rotate(45deg);width:12px;height:12px;background:var(--card,#1e2235);border-left:1px solid var(--border,#2d3436);border-bottom:1px solid var(--border,#2d3436)}',
    '.ux-marker-dot{width:10px;height:10px;border-radius:50%;background:var(--accent,#6c63ff);flex-shrink:0;box-shadow:0 0 8px rgba(108,99,255,.4);animation:uxDotPulse 2s ease-in-out infinite}',
    '.ux-marker-text{flex:1;font-size:.82rem;color:var(--text,#e8eaf0);line-height:1.4}',
    '.ux-marker-go{padding:5px 14px;border-radius:8px;border:none;background:var(--accent,#6c63ff);color:#fff;font-size:.78rem;font-weight:600;cursor:pointer;transition:all .2s;flex-shrink:0;white-space:nowrap}',
    '.ux-marker-go:hover{opacity:.85;transform:translateY(-1px)}',
    '.ux-marker-close{position:absolute;top:6px;right:8px;width:20px;height:20px;border-radius:50%;border:none;background:transparent;color:var(--text3,#6b7194);font-size:.85rem;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s;line-height:1}',
    '.ux-marker-close:hover{background:rgba(255,255,255,.08);color:var(--text,#e8eaf0)}',
    '@keyframes uxBubbleIn{from{opacity:0;transform:translateY(-12px) scale(.96)}to{opacity:1;transform:translateY(0) scale(1)}}',
    '@keyframes uxBubbleOut{from{opacity:1;transform:translateY(0) scale(1)}to{opacity:0;transform:translateY(-12px) scale(.96)}}',
    '@keyframes uxDotPulse{0%,100%{opacity:1;box-shadow:0 0 8px rgba(108,99,255,.4)}50%{opacity:.6;box-shadow:0 0 14px rgba(108,99,255,.6)}}',
    '.ux-back-to-marker{position:fixed;bottom:305px;right:30px;z-index:99;display:none;pointer-events:auto;animation:uxBubbleIn .35s cubic-bezier(.34,1.56,.64,1)}',
    '.ux-back-inner{display:flex;align-items:center;gap:8px;padding:8px 14px 8px 12px;background:var(--card,#1e2235);border:1px solid var(--border,#2d3436);border-left:3px solid var(--accent,#6c63ff);border-radius:20px;box-shadow:0 4px 16px rgba(0,0,0,.25);cursor:pointer;transition:all .2s;white-space:nowrap;font-size:.8rem;color:var(--accent,#6c63ff);font-weight:600}',
    '.ux-back-inner:hover{border-color:var(--accent,#6c63ff);box-shadow:0 4px 20px rgba(108,99,255,.2);transform:translateY(-1px)}',
    '.ux-back-inner:hover .ux-back-icon{color:var(--accent,#6c63ff)}',
    '.ux-back-icon{font-size:.9rem;transition:color .2s;color:var(--text3,#6b7194)}',

    /* Feature 11: Chapter checkboxes */
    '.ux-chapter-check{display:inline-flex;align-items:center;gap:6px;margin-left:8px;cursor:pointer;vertical-align:middle;user-select:none}',
    '.ux-chapter-check input[type=checkbox]{width:16px;height:16px;accent-color:var(--success,#2ecc71);cursor:pointer}',
    '.ux-chapter-done{opacity:.5;text-decoration:line-through}',
    '.ux-progress-bar{position:fixed;top:3px;left:280px;right:0;height:3px;background:var(--border,#2d3436);z-index:99}',
    '.ux-progress-fill{height:100%;background:linear-gradient(90deg,var(--success,#2ecc71),var(--accent2,#00d2ff));transition:width .3s;border-radius:0 2px 2px 0}',
    '.ux-progress-label{position:fixed;top:7px;left:280px;font-size:.72rem;color:var(--text3,#6b7194);z-index:99;pointer-events:none;transition:opacity .3s}',
    '@media(max-width:768px){.ux-progress-bar,.ux-progress-label{left:0}}',

    /* Homepage progress badge */
    '.ux-home-progress{display:block;font-size:.78rem;color:var(--success,#2ecc71);margin-top:4px;font-weight:600}'
  ].join('\n');

  var style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  // =========================================================================
  //  FEATURE 9: Keyboard Shortcut Help
  // =========================================================================
  function initShortcutHelp() {
    // Create ? button
    var btn = document.createElement('div');
    btn.className = 'ux-shortcut-btn';
    btn.textContent = '?';
    btn.title = '键盘快捷键 (?)';
    btn.setAttribute('aria-label', 'Show keyboard shortcuts');
    document.body.appendChild(btn);

    // Create modal
    var modal = document.createElement('div');
    modal.className = 'ux-modal';
    modal.innerHTML =
      '<div class="ux-modal-box">' +
        '<h3>键盘快捷键</h3>' +
        '<ul class="ux-shortcut-list">' +
          '<li><span>聚焦搜索</span><span><span class="ux-kbd">Ctrl</span> + <span class="ux-kbd">K</span> &nbsp;/&nbsp; <span class="ux-kbd">/</span></span></li>' +
          '<li><span>上一章节</span><span><span class="ux-kbd">&larr;</span></span></li>' +
          '<li><span>下一章节</span><span><span class="ux-kbd">&rarr;</span></span></li>' +
          '<li><span>翻转闪卡</span><span><span class="ux-kbd">Space</span></span></li>' +
          '<li><span>切换深浅色</span><span><span class="ux-kbd">T</span></span></li>' +
          '<li><span>关闭弹窗</span><span><span class="ux-kbd">Esc</span></span></li>' +
          '<li><span>显示此帮助</span><span><span class="ux-kbd">?</span></span></li>' +
        '</ul>' +
        '<div style="text-align:right;margin-top:16px">' +
          '<button class="ux-modal-close-btn" style="padding:8px 20px;border-radius:8px;border:1px solid var(--border,#2d3436);background:transparent;color:var(--text2,#9ba1b8);font-size:.85rem;cursor:pointer;transition:all .2s">关闭</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);

    function showModal() { modal.classList.add('show'); }
    function hideModal() { modal.classList.remove('show'); }

    btn.addEventListener('click', showModal);
    modal.addEventListener('click', function (e) {
      if (e.target === modal) hideModal();
    });
    modal.querySelector('.ux-modal-close-btn').addEventListener('click', hideModal);

    // Keyboard shortcuts
    document.addEventListener('keydown', function (e) {
      var tag = (e.target.tagName || '').toLowerCase();
      var isInput = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;

      // ? or Shift+/ — show help (only when not typing)
      if (!isInput && (e.key === '?' || (e.key === '/' && e.shiftKey))) {
        e.preventDefault();
        if (modal.classList.contains('show')) { hideModal(); } else { showModal(); }
        return;
      }

      // Escape — close modals
      if (e.key === 'Escape') {
        hideModal();
        // Also close any other .ux-modal that might be open
        return;
      }

      // Skip remaining shortcuts when typing in an input
      if (isInput) return;

      // Ctrl+K or / — focus search
      if (e.key === 'k' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        var search = document.getElementById('globalSearch') || document.getElementById('searchInput') || document.querySelector('input[type="text"][placeholder*="搜索"]');
        if (search) { search.focus(); search.select(); }
        return;
      }
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault();
        var search2 = document.getElementById('globalSearch') || document.getElementById('searchInput') || document.querySelector('input[type="text"][placeholder*="搜索"]');
        if (search2) { search2.focus(); search2.select(); }
        return;
      }

      // T — toggle theme
      if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        var toggle = document.querySelector('.theme-toggle');
        if (toggle) toggle.click();
        return;
      }

      // Space — flip flashcard (let the page's own handler do it if present)
      // Left/Right arrows — navigate sections
      // These are left to page-specific JS to handle; we only provide the ? help.
    });
  }

  // =========================================================================
  //  FEATURE 10: Last Position Restore Marker
  // =========================================================================
  function initRestoreMarker() {
    var saved = parseInt(localStorage.getItem(SCROLL_KEY));
    if (!saved || saved <= 200) return;

    var markerShown = false;
    var markerEl = null;
    var backBtn = null;
    var markerY = saved;

    function createMarker() {
      if (markerShown) return;
      markerShown = true;

      // Find the element closest to saved scroll position
      var allEls = document.querySelectorAll('h2, h3, .card, .section, p, li, div');
      var bestEl = null;
      var bestDist = Infinity;
      for (var i = 0; i < allEls.length; i++) {
        var rect = allEls[i].getBoundingClientRect();
        var absTop = rect.top + window.scrollY;
        var dist = Math.abs(absTop - saved);
        if (dist < bestDist) {
          bestDist = dist;
          bestEl = allEls[i];
        }
      }

      // Build bubble
      markerEl = document.createElement('div');
      markerEl.className = 'ux-marker';

      var inner = document.createElement('div');
      inner.className = 'ux-marker-inner';

      var arrow = document.createElement('div');
      arrow.className = 'ux-marker-arrow';
      inner.appendChild(arrow);

      var dot = document.createElement('div');
      dot.className = 'ux-marker-dot';
      inner.appendChild(dot);

      var txt = document.createElement('div');
      txt.className = 'ux-marker-text';
      txt.textContent = '上次学到这里';
      inner.appendChild(txt);

      var goBtn = document.createElement('button');
      goBtn.className = 'ux-marker-go';
      goBtn.textContent = '跳转';
      inner.appendChild(goBtn);

      var closeBtn = document.createElement('button');
      closeBtn.className = 'ux-marker-close';
      closeBtn.innerHTML = '&times;';
      closeBtn.title = '关闭';
      inner.appendChild(closeBtn);

      markerEl.appendChild(inner);

      // Place bubble in the nearest positioned container
      if (bestEl && bestEl.parentNode) {
        var container = bestEl.closest('.section, main, .container, article, .content, .main') || document.body;
        if (getComputedStyle(container).position === 'static') {
          container.style.position = 'relative';
        }
        markerEl.style.top = (saved - container.getBoundingClientRect().top - window.scrollY + container.scrollTop) + 'px';
        container.appendChild(markerEl);
      } else {
        markerEl.style.position = 'fixed';
        markerEl.style.top = '80px';
        markerEl.style.left = '20px';
        document.body.appendChild(markerEl);
      }

      // Interaction: jump to saved position
      goBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        window.scrollTo({ top: markerY - 80, behavior: 'smooth' });
      });
      inner.addEventListener('click', function () {
        window.scrollTo({ top: markerY - 80, behavior: 'smooth' });
      });

      // Dismiss helpers
      function removeBubble() {
        if (!markerEl) return;
        markerEl.style.animation = 'uxBubbleOut .35s ease forwards';
        setTimeout(function () {
          if (markerEl && markerEl.parentNode) markerEl.parentNode.removeChild(markerEl);
          markerEl = null;
        }, 350);
      }
      closeBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        clearTimeout(hideTimeout);
        removeBubble();
      });

      // Auto-hide after 6 seconds
      var hideTimeout = setTimeout(removeBubble, 6000);

      // Create floating "back to marker" FAB
      backBtn = document.createElement('div');
      backBtn.className = 'ux-back-to-marker';
      var backInner = document.createElement('div');
      backInner.className = 'ux-back-inner';
      var backIcon = document.createElement('span');
      backIcon.className = 'ux-back-icon';
      backIcon.textContent = '📍';
      backInner.appendChild(backIcon);
      var backText = document.createElement('span');
      backText.textContent = '上次学到这里';
      backInner.appendChild(backText);
      backBtn.appendChild(backInner);
      document.body.appendChild(backBtn);

      backBtn.addEventListener('click', function () {
        window.scrollTo({ top: markerY - 80, behavior: 'smooth' });
      });

      // Show/hide back button based on scroll distance
      var scrollHandler = function () {
        if (!backBtn) return;
        var dist = Math.abs(window.scrollY - markerY);
        if (dist > 600) {
          backBtn.style.display = 'block';
        } else {
          backBtn.style.display = 'none';
        }
      };
      window.addEventListener('scroll', scrollHandler, { passive: true });
    }


    // Wait for scroll restoration (remember.js does it at 100ms and 800ms)
    setTimeout(createMarker, 1200);
  }

  // =========================================================================
  //  FEATURE 11: Chapter Completion Checkboxes
  // =========================================================================

  // Chapter count map for homepage progress display
  var COURSE_CHAPTERS = {
    'courses/probability/': { name: '概率论', total: 8 },
    'courses/os/':          { name: '操作系统', total: 6 },
    'courses/algorithm/':   { name: '算法', total: 6 },
    'courses/dsp/':         { name: '数字信号', total: 4 },
    'courses/marxism/':     { name: '马克思', total: 7 },
    'courses/calculus/':    { name: '高数', total: 5 }
  };

  var DONE_KEY = 'chapter_done_' + PAGE_ID;

  function getDoneState() {
    try { return JSON.parse(localStorage.getItem(DONE_KEY) || '{}'); } catch (e) { return {}; }
  }

  function saveDoneState(state) {
    try { localStorage.setItem(DONE_KEY, JSON.stringify(state)); } catch (e) { /* quota */ }
  }

  // ---- Course page: add checkboxes + progress bar ----
  function initChapterCheckboxes() {
    // Scope to main content to avoid sidebar/nav headings
    var headings = document.querySelectorAll('main h2, .section h2');
    if (headings.length < 2) {
      // Fallback: try all h2 but exclude known non-content areas
      headings = document.querySelectorAll('h2');
    }
    if (headings.length < 2) return; // probably not a course page

    // Filter to only chapter headings
    var chapters = [];
    for (var i = 0; i < headings.length; i++) {
      var h = headings[i];
      // Skip headings inside sidebar, nav, or utility elements
      if (h.closest('nav, aside, .sidebar, .footer, .migrateNotice, .sg-overlay')) continue;
      var text = h.textContent.trim();
      if (text.length < 3) continue;
      // Accept headings with chapter markers OR substantial content
      if (text.match(/第.*章|chapter|ch\d|考[试题]|题型|练习|自测/i) || text.length > 5) {
        chapters.push(h);
      }
    }
    if (chapters.length < 2) return;

    var state = getDoneState();
    var totalChapters = chapters.length;
    var doneCount = 0;

    chapters.forEach(function (h, idx) {
      // Use heading ID if available (stable), otherwise derive from text
      var rawText = h.textContent.trim().replace(/\s+/g, ' ');
      var key = h.id ? ('id_' + h.id) : ('h' + idx + '_' + rawText.substring(0, 30).replace(/\s+/g, ''));
      var isDone = !!state[key];
      if (isDone) doneCount++;

      // Create checkbox
      var label = document.createElement('label');
      label.className = 'ux-chapter-check';

      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = isDone;
      if (isDone) h.classList.add('ux-chapter-done');

      cb.addEventListener('change', (function (heading, storageKey) {
        return function () {
          var st = getDoneState();
          if (cb.checked) {
            st[storageKey] = true;
            heading.classList.add('ux-chapter-done');
          } else {
            delete st[storageKey];
            heading.classList.remove('ux-chapter-done');
          }
          saveDoneState(st);
          refreshProgress();
        };
      })(h, key));

      label.appendChild(cb);
      h.appendChild(label);
    });

    // ---- Progress bar at top ----
    var barWrap = document.createElement('div');
    barWrap.className = 'ux-progress-bar';
    barWrap.innerHTML = '<div class="ux-progress-fill" style="width:' + (totalChapters > 0 ? Math.round(doneCount / totalChapters * 100) : 0) + '%"></div>';
    document.body.appendChild(barWrap);

    /* progress label removed — only the bar is shown */

    function refreshProgress() {
      var st = getDoneState();
      var done = 0;
      chapters.forEach(function (h, idx) {
        var rawText = h.textContent.trim().replace(/\s+/g, ' ');
        var k = h.id ? ('id_' + h.id) : ('h' + idx + '_' + rawText.substring(0, 30).replace(/\s+/g, ''));
        if (st[k]) done++;
      });
      var pct = totalChapters > 0 ? Math.round(done / totalChapters * 100) : 0;
      barWrap.querySelector('.ux-progress-fill').style.width = pct + '%';
      /* progress label removed */
    }
  }

  // ---- Homepage: show per-subject progress ----
  function initHomepageProgress() {
    var cards = document.querySelectorAll('.card[href*="courses/"]');
    if (cards.length === 0) return;

    cards.forEach(function (card) {
      var href = card.getAttribute('href') || '';
      // Normalize href to match COURSE_CHAPTERS keys
      var slug = href.replace(/^\.\.?\//, '').replace(/^\/+/, '');
      if (!slug.endsWith('/')) slug += '/';

      var info = COURSE_CHAPTERS[slug];
      if (!info) return;

      // Try to read the actual done state for this course
      var coursePageId = info.name; // Use subject name as approximate page ID
      var doneKey = 'chapter_done_' + info.name;
      // We need a more reliable way to get the page ID for each course.
      // Try multiple possible page ID patterns.
      var possibleKeys = [
        'chapter_done_' + info.name + '_' + '期末复习',
        'chapter_done_' + info.name
      ];

      // Scan all localStorage keys that start with 'chapter_done_' and contain the course name
      var doneCount = 0;
      var courseName = info.name;
      try {
        for (var k = 0; k < localStorage.length; k++) {
          var lk = localStorage.key(k);
          if (lk && lk.indexOf('chapter_done_') === 0) {
            // Check if this key belongs to this course by matching the course title
            var pageTitle = lk.replace('chapter_done_', '');
            // Course pages have titles like "操作系统期末复习", "概率论与数理统计期末复习"
            if (pageTitle.indexOf(courseName) !== -1 || courseName.indexOf(pageTitle.replace(/期末复习/g, '').replace(/复习/g, '')) !== -1) {
              var st = {};
              try { st = JSON.parse(localStorage.getItem(lk) || '{}'); } catch (e) { st = {}; }
              var count = Object.keys(st).length;
              if (count > doneCount) doneCount = count;
            }
          }
        }
      } catch (e) { /* ignore */ }

      // Show progress
      if (doneCount > 0) {
        var badge = document.createElement('span');
        badge.className = 'ux-home-progress';
        badge.textContent = courseName + ': ' + doneCount + '/' + info.total + ' 章已复习';
        var tags = card.querySelector('.tags');
        if (tags) {
          tags.parentNode.insertBefore(badge, tags.nextSibling);
        } else {
          card.appendChild(badge);
        }
      }
    });
  }

  // =========================================================================
  //  INIT
  // =========================================================================
  function init() {
    // Feature 9: always show
    initShortcutHelp();

    // Feature 10: only on course pages (not homepage)
    if (!isHomepage()) {
      initRestoreMarker();
    }

    // Feature 11: course pages get checkboxes, homepage gets progress badges
    if (isHomepage()) {
      initHomepageProgress();
    } else {
      initChapterCheckboxes();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
