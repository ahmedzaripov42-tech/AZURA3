/* AZURA mobile performance layer — lazy media, image-first reader, light runtime guards */
(function(){
  'use strict';
  // V9: AZURA image-first reader. PDF.js is intentionally disabled.
  window.AZURA_LOAD_PDF = function(){
    window.AZURA_PDF_DISABLED = true;
    return Promise.reject(new Error('PDF viewer o‘chirilgan. Boblarni WebP yoki JPG sifatida yuklang.'));
  };
  window.AZURA_PDF_DISABLED = true;


  window.AZURA_LOAD_SCRIPT = window.AZURA_LOAD_SCRIPT || function(src){
    var clean = String(src).split('?')[0];
    if (document.querySelector('script[data-az-dynamic="' + clean + '"],script[src^="' + clean + '"]')) return Promise.resolve();
    if (!window.__azuraDynScripts) window.__azuraDynScripts = {};
    if (window.__azuraDynScripts[clean]) return window.__azuraDynScripts[clean];
    window.__azuraDynScripts[clean] = new Promise(function(resolve, reject){
      var s = document.createElement('script');
      s.src = src;
      s.defer = true;
      s.dataset.azDynamic = clean;
      s.onload = function(){ resolve(); };
      s.onerror = function(){ reject(new Error('Script yuklanmadi: ' + src)); };
      document.body.appendChild(s);
    });
    return window.__azuraDynScripts[clean];
  };

  window.AZURA_LOAD_FEATURE = window.AZURA_LOAD_FEATURE || function(name){
    var groups = {
      admin: ['js/04-admin.js?v=17'],
      adult: ['js/07-adult.js?v=15'],
      premium: ['js/08-premium-ui.js?v=15']
    };
    var list = groups[name] || [];
    return list.reduce(function(p, src){ return p.then(function(){ return window.AZURA_LOAD_SCRIPT(src); }); }, Promise.resolve());
  };

  function optimizeImages(){
    document.querySelectorAll('img').forEach(function(img){
      if (!img.hasAttribute('loading')) img.setAttribute('loading', 'lazy');
      if (!img.hasAttribute('decoding')) img.setAttribute('decoding', 'async');
      if (!img.hasAttribute('fetchpriority')) img.setAttribute('fetchpriority', 'low');
    });
  }

  function optimizeMedia(){
    document.querySelectorAll('video,audio').forEach(function(el){
      if (!el.hasAttribute('preload')) el.setAttribute('preload', 'metadata');
    });
  }

  function run(){ optimizeImages(); optimizeMedia(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once:true });
  else run();

  var mo = new MutationObserver(function(muts){
    var needed = muts.some(function(m){ return m.addedNodes && m.addedNodes.length; });
    if (needed) requestAnimationFrame(run);
  });
  try { mo.observe(document.documentElement, { childList:true, subtree:true }); } catch(_) {}
})();
