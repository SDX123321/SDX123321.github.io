// === PPTX/DOCX Preview Module ===
// Uses PPTX.js for .pptx preview, mammoth.js for .docx preview

(function(){
  // Inject modal HTML
  var modal = document.createElement('div');
  modal.id = 'previewModal';
  modal.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:1005;justify-content:center;align-items:center;padding:20px;';
  modal.innerHTML = '<div id="previewBox" style="background:var(--card,#1e293b);border-radius:16px;max-width:900px;width:95%;max-height:90vh;display:flex;flex-direction:column;border:1px solid var(--border,#334155);box-shadow:0 20px 60px rgba(0,0,0,.5);">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;padding:14px 20px;border-bottom:1px solid var(--border,#334155);">'
    + '  <span id="previewTitle" style="font-weight:600;font-size:.95rem;color:var(--text,#e2e8f0);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;margin-right:12px;"></span>'
    + '  <span onclick="closePreview()" style="cursor:pointer;color:var(--text3,#64748b);font-size:1.4rem;line-height:1;flex-shrink:0;">&times;</span>'
    + '</div>'
    + '<div id="previewContent" style="flex:1;overflow:auto;padding:16px;min-height:300px;"></div>'
    + '</div>';
  document.body.appendChild(modal);

  // Close on overlay click
  modal.addEventListener('click', function(e){
    if(e.target === modal) closePreview();
  });

  function closePreview(){
    document.getElementById('previewModal').style.display = 'none';
    document.getElementById('previewContent').innerHTML = '';
  }
  window.closePreview = closePreview;

  function showPreviewModal(title){
    document.getElementById('previewTitle').textContent = title;
    document.getElementById('previewContent').innerHTML = '<div style="text-align:center;padding:60px;color:var(--text3,#64748b);">加载中...</div>';
    document.getElementById('previewModal').style.display = 'flex';
  }

  function getFileExt(path){
    return path.split('.').pop().toLowerCase().split('?')[0];
  }

  // === PPTX Preview ===
  function previewPPTX(path, title){
    showPreviewModal(title);
    var container = document.getElementById('previewContent');
    container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3);">正在加载 PPTX...</div>';

    fetch(path)
      .then(function(r){ return r.arrayBuffer(); })
      .then(function(buffer){
        // Use PPTX.js if available
        if(typeof PPTXJS !== 'undefined'){
          container.innerHTML = '';
          PPTXJS.render(buffer, {
            container: container,
            slideWidth: 800,
            slideHeight: 600
          }).then(function(result){
            // Style the rendered slides
            var slides = container.querySelectorAll('.slide, [class*="slide"]');
            slides.forEach(function(s){
              s.style.margin = '16px auto';
              s.style.boxShadow = '0 4px 16px rgba(0,0,0,.2)';
              s.style.borderRadius = '8px';
              s.style.maxWidth = '100%';
            });
          }).catch(function(err){
            container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3);">PPTX 渲染失败: ' + err.message + '</div>';
          });
        } else {
          // Fallback: show raw content info
          container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3);">PPTX.js 未加载，无法预览。<br><br>'
            + '<a href="' + path + '" download style="padding:8px 20px;background:var(--accent,#60a5fa);color:#fff;border-radius:8px;text-decoration:none;">下载文件</a></div>';
        }
      })
      .catch(function(err){
        container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3);">加载失败: ' + err.message + '</div>';
      });
  }

  // === DOCX Preview ===
  function previewDOCX(path, title){
    showPreviewModal(title);
    var container = document.getElementById('previewContent');
    container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3);">正在加载 DOCX...</div>';

    fetch(path)
      .then(function(r){ return r.arrayBuffer(); })
      .then(function(buffer){
        if(typeof mammoth !== 'undefined'){
          mammoth.convertToHtml({arrayBuffer: buffer})
            .then(function(result){
              container.innerHTML = '<div style="padding:8px 16px;line-height:1.8;color:var(--text,#e2e8f0);font-size:14px;">' + result.value + '</div>';
              // Style tables
              container.querySelectorAll('table').forEach(function(t){
                t.style.cssText = 'width:100%;border-collapse:collapse;margin:12px 0;font-size:13px;';
              });
              container.querySelectorAll('th,td').forEach(function(c){
                c.style.cssText = 'padding:6px 10px;border:1px solid var(--border,#334155);';
              });
              container.querySelectorAll('th').forEach(function(h){
                h.style.background = 'var(--accent,#60a5fa)';
                h.style.color = '#fff';
              });
            })
            .catch(function(err){
              container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3);">DOCX 渲染失败: ' + err.message + '</div>';
            });
        } else {
          container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3);">mammoth.js 未加载，无法预览。<br><br>'
            + '<a href="' + path + '" download style="padding:8px 20px;background:var(--accent,#60a5fa);color:#fff;border-radius:8px;text-decoration:none;">下载文件</a></div>';
        }
      })
      .catch(function(err){
        container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3);">加载失败: ' + err.message + '</div>';
      });
  }

  // === Public API ===
  window.previewFile = function(path, title){
    var ext = getFileExt(path);
    if(ext === 'pptx' || ext === 'ppt'){
      previewPPTX(path, title);
    } else if(ext === 'docx' || ext === 'doc'){
      previewDOCX(path, title);
    } else {
      // For PDFs and other files, open in new tab
      window.open(path, '_blank');
    }
  };

  // Close on Escape
  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape') closePreview();
  });
})();
