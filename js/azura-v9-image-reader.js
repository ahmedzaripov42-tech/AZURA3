/* AZURA V9 — image-first reader for manhwa/manga/novel/komiks */
(function(){
  'use strict';
  window.AZURA_MEDIA_MODE = 'image-first';
  window.AZURA_ALLOWED_CHAPTER_FORMATS = ['webp','jpg','jpeg','png'];
  window.AZURA_PDF_DISABLED = true;

  function isImgUrl(v){ return /\.(webp|jpe?g|png)(\?.*)?$/i.test(String(v||'')); }
  function tuneImage(img, priority){
    if (!img || img.dataset.azImgTuned) return;
    img.dataset.azImgTuned = '1';
    img.decoding = 'async';
    if (!priority) img.loading = img.loading || 'lazy';
    img.setAttribute('fetchpriority', priority ? 'high' : 'auto');
  }
  function tuneAll(root){
    var imgs = (root||document).querySelectorAll('img');
    imgs.forEach(function(img, i){ tuneImage(img, i < 2); });
  }
  function preloadNearReader(){
    var pages = Array.from(document.querySelectorAll('.az-rdr-page, .reader-page, .chapter-page, img[data-page]'));
    if (!pages.length) return;
    pages.slice(0,4).forEach(function(el){
      var src = el.currentSrc || el.src || el.dataset.src;
      if (!isImgUrl(src)) return;
      var link = document.createElement('link');
      link.rel = 'preload'; link.as = 'image'; link.href = src;
      document.head.appendChild(link);
    });
  }
  function hidePdfControls(root){
    (root||document).querySelectorAll('[data-fmt="pdf"], input[accept*="pdf"], input[accept*="PDF"]').forEach(function(el){
      var box = el.closest('.az-cm-format-card,.az-cm-upload-card,.form-row,.az-ch-upload-card,.aap-form-row') || el;
      box.style.display = 'none';
      box.setAttribute('aria-hidden','true');
    });
    (root||document).querySelectorAll('.az-cm-drop-title,.az-ch-drop-title').forEach(function(el){
      if (/PDF/i.test(el.textContent)) el.textContent = 'WebP/JPG rasmlarni yuklang';
    });
    (root||document).querySelectorAll('.az-cm-subtitle,.az-ch-subtitle,.az-cm-drop-hint,.az-ch-drop-hint').forEach(function(el){
      if (/PDF/i.test(el.textContent)) el.textContent = 'Image-first reader: WebP/JPG — tez, sifatli va mobile-friendly';
    });
  }
  window.AZURA_IMAGE_READER_TUNE = function(root){ tuneAll(root); hidePdfControls(root); preloadNearReader(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ window.AZURA_IMAGE_READER_TUNE(document); });
  else window.AZURA_IMAGE_READER_TUNE(document);
  new MutationObserver(function(list){
    list.forEach(function(m){ m.addedNodes && m.addedNodes.forEach(function(n){ if(n.nodeType===1) window.AZURA_IMAGE_READER_TUNE(n); }); });
  }).observe(document.documentElement, {childList:true, subtree:true});
})();
