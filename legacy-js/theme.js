// ===== 全站主题切换 =====
// 自动注入切换按钮，管理 localStorage 持久化

(function(){
  var KEY = 'site_theme';

  function applyTheme(light){
    if(light){
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
    }
    // Update all toggle buttons
    document.querySelectorAll('.theme-toggle').forEach(function(btn){
      btn.textContent = light ? '☀' : '☽'; // ☀ / ☽
    });
    try { localStorage.setItem(KEY, light ? 'light' : 'dark'); } catch(e){}
  }

  function toggleTheme(){
    var isLight = document.documentElement.classList.contains('light');
    applyTheme(!isLight);
  }

  // Restore saved preference
  var saved = 'dark';
  try { saved = localStorage.getItem(KEY) || 'dark'; } catch(e){}
  applyTheme(saved === 'light');

  // Inject toggle button if not already present
  if(!document.querySelector('.theme-toggle')){
    var btn = document.createElement('button');
    btn.className = 'theme-toggle';
    btn.setAttribute('title', '切换深浅色模式');
    btn.addEventListener('click', toggleTheme);
    document.body.appendChild(btn);
    // Set initial icon
    btn.textContent = saved === 'light' ? '☀' : '☽';
  }

  // Expose globally
  window.toggleTheme = toggleTheme;
  window.applyTheme = applyTheme;
})();
