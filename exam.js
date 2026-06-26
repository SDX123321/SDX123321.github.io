// ===== 考试安排查询模块 =====
// 从 files/exam-schedule.json 加载数据，按班级 ID 查询，localStorage 持久化

(function () {
  var LS_KEY = 'exam_class_id';
  var LS_DELETED = 'exam_deleted';
  var data = null;
  var dataUrlCandidates = null;
  var refreshTimer = null;
  var currentClassId = '';

  function getEmbeddedData() {
    try {
      if (window.EXAM_SCHEDULE_DATA && typeof window.EXAM_SCHEDULE_DATA === 'object') return window.EXAM_SCHEDULE_DATA;
    } catch (e) {}
    return null;
  }

  var $section, $input, $result;

  // ─── Deleted exams management ───
  function getDeletedExams() {
    try { var r = localStorage.getItem(LS_DELETED); return r ? JSON.parse(r) : {}; }
    catch (e) { return {}; }
  }
  function markDeleted(classId, courseKey) {
    var d = getDeletedExams();
    if (!d[classId]) d[classId] = [];
    if (d[classId].indexOf(courseKey) === -1) d[classId].push(courseKey);
    try { localStorage.setItem(LS_DELETED, JSON.stringify(d)); } catch (e) {}
  }
  function isDeleted(classId, courseKey) {
    var d = getDeletedExams();
    return d[classId] && d[classId].indexOf(courseKey) !== -1;
  }
  function getCourseKey(exam) { return exam.course + '|' + exam.date + '|' + exam.start; }

  // Auto-clean deleted entries older than 30 days
  function cleanOldDeleted(classId) {
    var d = getDeletedExams();
    if (!d[classId]) return;
    var now = new Date(), kept = [];
    for (var i = 0; i < d[classId].length; i++) {
      var parts = d[classId][i].split('|');
      if (parts.length >= 2) {
        var diff = now.getTime() - new Date(parts[1]).getTime();
        if (diff < 30 * 86400000) kept.push(d[classId][i]);
      }
    }
    if (kept.length === 0) delete d[classId]; else d[classId] = kept;
    try { localStorage.setItem(LS_DELETED, JSON.stringify(d)); } catch (e) {}
  }

  function getDataUrlCandidates() {
    if (dataUrlCandidates) return dataUrlCandidates;
    var cands = [], scripts = document.getElementsByTagName('script');
    for (var i = 0; i < scripts.length; i++) {
      var src = scripts[i].getAttribute('src') || '';
      if (src.indexOf('exam.js') !== -1) {
        try { cands.push(new URL('files/exam-schedule.json', new URL(src, window.location.href)).toString()); }
        catch (e) { cands.push(src.replace(/exam\.js.*$/, 'files/exam-schedule.json')); }
        break;
      }
    }
    if (cands.length === 0) cands.push('files/exam-schedule.json');
    cands.push('./files/exam-schedule.json', 'files/exam-schedule.json', '/files/exam-schedule.json');
    var u = [];
    for (var j = 0; j < cands.length; j++) { if (u.indexOf(cands[j]) === -1) u.push(cands[j]); }
    dataUrlCandidates = u;
    return dataUrlCandidates;
  }

  function parseExamData(text) {
    if (typeof text !== 'string') throw new Error('empty');
    var t = text.replace(/^﻿/, '').trim();
    if (!t) throw new Error('empty');
    return JSON.parse(t);
  }

  function loadData(cb) {
    if (data) return cb(data);
    var emb = getEmbeddedData();
    if (emb) { data = emb; cb(data); return; }
    var cands = getDataUrlCandidates(), attempt = 0;
    function tryLoad() {
      if (attempt >= cands.length) { showMsg('加载考试数据失败，请稍后再试。', 'error'); return; }
      var xhr = new XMLHttpRequest(), url = cands[attempt++];
      xhr.open('GET', url, true);
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        if (xhr.status === 200 || xhr.status === 0) {
          try { data = parseExamData(xhr.responseText); cb(data); }
          catch (e) { attempt < cands.length ? tryLoad() : showMsg('考试数据解析失败。', 'error'); }
        } else { attempt < cands.length ? tryLoad() : showMsg('加载失败（HTTP ' + xhr.status + '）。', 'error'); }
      };
      xhr.onerror = function () { attempt < cands.length ? tryLoad() : showMsg('加载考试数据失败。', 'error'); };
      xhr.send();
    }
    tryLoad();
  }

  // ─── Query ───
  function query(classId) {
    classId = classId.trim().toUpperCase();
    if (!classId) return;
    if (!data) return loadData(function () { query(classId); });
    var exams = data[classId];
    if (!exams) {
      var matches = [];
      for (var k in data) { if (k.indexOf(classId) !== -1) matches.push(k); }
      if (matches.length === 1) { exams = data[matches[0]]; classId = matches[0]; }
      else if (matches.length > 1) { showMsg('多个匹配：' + matches.slice(0, 8).join('、') + '，请输入完整 ID。', 'warn'); return; }
      else { showMsg('未找到班级「' + classId + '」的考试安排。', 'warn'); return; }
    }
    currentClassId = classId;
    try { localStorage.setItem(LS_KEY, classId); } catch (e) {}
    cleanOldDeleted(classId);
    renderExams(classId, exams);
    startRefreshTimer();
  }

  // ─── Render ───
  function renderExams(classId, exams) {
    var now = new Date(), visible = [], deletedCount = 0;
    for (var i = 0; i < exams.length; i++) {
      var e = exams[i], key = getCourseKey(e);
      if (new Date(e.iso) < now) continue;
      if (isDeleted(classId, key)) { deletedCount++; continue; }
      visible.push(e);
    }
    var html = '<div class="exam-header">'
      + '<div class="exam-title"><span class="exam-class-badge">' + esc(classId) + '</span> 考试安排 <span class="exam-count">' + visible.length + ' 门</span></div>'
      + '<div class="exam-header-btns">'
      + (deletedCount > 0 ? '<button class="exam-reset" onclick="ExamQuery.resetDeleted()">恢复 ' + deletedCount + ' 门</button>' : '')
      + '<button class="exam-switch" onclick="ExamQuery.clear()">切换班级</button></div></div>';

    if (visible.length === 0) {
      html += '<div class="exam-msg">所有考试已结束或已清除，切换班级可重新查询。</div>';
      $result.innerHTML = html; $result.style.display = 'block'; $input.style.display = 'none';
      return;
    }

    html += '<div class="exam-scroll-window"><div class="exam-list">';
    for (var j = 0; j < visible.length; j++) {
      var ev = visible[j], cd = getCountdown(new Date(ev.iso), now), ck = getCourseKey(ev);
      html += '<div class="exam-card" data-key="' + esc(ck) + '">'
        + '<button class="exam-del" onclick="ExamQuery.remove(this)" title="移除">&times;</button>'
        + '<div class="exam-card-top"><div class="exam-course">' + esc(ev.course) + '</div>'
        + '<span class="exam-type-tag exam-type-' + ev.type + '">' + (ev.type === 'school' ? '校考' : '院考') + '</span></div>'
        + '<div class="exam-card-grid">'
        + '<div class="exam-info"><span class="exam-label">日期</span><span class="exam-value">' + formatDate(ev.date) + '</span></div>'
        + '<div class="exam-info"><span class="exam-label">时间</span><span class="exam-value">' + ev.start + ' - ' + ev.end + '</span></div>'
        + '<div class="exam-info"><span class="exam-label">教室</span><span class="exam-value">' + esc(ev.room) + '</span></div>'
        + '<div class="exam-info"><span class="exam-label">教师</span><span class="exam-value">' + esc(ev.teacher) + '</span></div>'
        + '</div>';
      if (cd) html += '<div class="exam-countdown">' + cd + '</div>';
      html += '</div>';
    }
    html += '</div></div>';
    if (visible.length > 1) html += '<div class="exam-scroll-hint">左右滑动查看更多</div>';
    $result.innerHTML = html; $result.style.display = 'block'; $input.style.display = 'none';
  }

  // ─── Countdown refresh every hour ───
  function startRefreshTimer() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(function () {
      if (currentClassId && data && data[currentClassId]) renderExams(currentClassId, data[currentClassId]);
    }, 3600000);
  }

  // ─── Helpers ───
  function formatDate(ds) {
    var p = ds.split('-'), m = parseInt(p[1], 10), d = parseInt(p[2], 10);
    var wd = ['日','一','二','三','四','五','六'][new Date(ds).getDay()];
    return m + '月' + d + '日 周' + wd;
  }
  function getCountdown(ed, now) {
    var diff = ed.getTime() - now.getTime();
    if (diff <= 0) return '';
    var days = Math.floor(diff / 86400000), hours = Math.floor((diff % 86400000) / 3600000);
    if (days > 0) return '距考试还有 ' + days + ' 天 ' + hours + ' 小时';
    if (hours > 0) return '距考试还有 ' + hours + ' 小时';
    return '距考试还有 ' + Math.floor((diff % 3600000) / 60000) + ' 分钟';
  }
  function showMsg(msg, type) {
    $result.innerHTML = '<div class="exam-msg exam-msg-' + type + '">' + esc(msg) + '</div>';
    $result.style.display = 'block'; $input.style.display = 'block';
  }
  function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  // ─── Public API ───
  window.ExamQuery = {
    search: function () { var el = document.getElementById('examClassInput'); if (el) query(el.value); },
    clear: function () {
      try { localStorage.removeItem(LS_KEY); } catch (e) {}
      if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
      currentClassId = '';
      $result.style.display = 'none'; $result.innerHTML = ''; $input.style.display = 'block';
      var el = document.getElementById('examClassInput');
      if (el) { el.value = ''; el.focus(); }
    },
    remove: function (btn) {
      var card = btn.closest('.exam-card');
      if (!card) return;
      var key = card.getAttribute('data-key');
      if (key && currentClassId) markDeleted(currentClassId, key);
      card.style.transition = 'opacity .25s, transform .25s';
      card.style.opacity = '0'; card.style.transform = 'scale(0.9)';
      setTimeout(function () {
        card.remove();
        var countEl = $result.querySelector('.exam-count');
        var rem = $result.querySelectorAll('.exam-card').length;
        if (countEl) countEl.textContent = rem + ' 门';
        if (rem === 0 && data && currentClassId) renderExams(currentClassId, data[currentClassId]);
      }, 280);
    },
    resetDeleted: function () {
      if (!currentClassId) return;
      var d = getDeletedExams();
      delete d[currentClassId];
      try { localStorage.setItem(LS_DELETED, JSON.stringify(d)); } catch (e) {}
      if (data && data[currentClassId]) renderExams(currentClassId, data[currentClassId]);
    },
    init: function () {
      $section = document.getElementById('examSection');
      $input = document.getElementById('examInput');
      $result = document.getElementById('examResult');
      if (!$section) return;
      var el = document.getElementById('examClassInput');
      if (el) el.addEventListener('keydown', function (e) { if (e.key === 'Enter') ExamQuery.search(); });
      $result.addEventListener('wheel', function (e) {
        var sw = $result.querySelector('.exam-scroll-window');
        if (sw && Math.abs(e.deltaY) > Math.abs(e.deltaX)) { e.preventDefault(); sw.scrollLeft += e.deltaY; }
      }, { passive: false });
      var saved = '';
      try { saved = localStorage.getItem(LS_KEY) || ''; } catch (e) {}
      if (saved) loadData(function () { query(saved); });
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ExamQuery.init);
  else ExamQuery.init();
})();
