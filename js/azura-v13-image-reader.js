// AZURA V13 — image-first reader helper for manhwa/manga/komiks and lightweight novel pages.
(function(){
  'use strict';
  function tune(img, i){
    if (!img || img.dataset.azImgTuned) return;
    img.dataset.azImgTuned = '1';
    img.loading = i < 2 ? 'eager' : 'lazy';
    img.decoding = 'async';
    img.fetchPriority = i < 1 ? 'high' : 'auto';
    img.referrerPolicy = 'no-referrer';
  }
  function optimize(){
    var imgs = Array.prototype.slice.call(document.querySelectorAll('img'));
    imgs.forEach(tune);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', optimize, {once:true}); else optimize();
  var mo = new MutationObserver(function(list){
    var n=0;
    list.forEach(function(m){ Array.prototype.forEach.call(m.addedNodes || [], function(node){
      if (node.nodeType !== 1) return;
      if (node.tagName === 'IMG') tune(node, n++);
      if (node.querySelectorAll) Array.prototype.forEach.call(node.querySelectorAll('img'), function(img){ tune(img, n++); });
    }); });
  });
  mo.observe(document.documentElement, {childList:true, subtree:true});
  window.AZURA_IMAGE_READER = { optimize: optimize };
})();
