/* AZURA Clean Bridge v9 — keeps stats and current user in sync via AZURA_DATA */
(function(){
  'use strict';
  function refreshCurrent(){
    if (!window.AZURA_DATA || !window.AZURA_DATA.users) return;
    Promise.resolve(window.AZURA_DATA.users.current()).then(function(user){
      if (user) {
        window.currentUser = user;
        try { currentUser = user; } catch(_){}
      }
    }).catch(function(){});
  }
  function refreshUi(){
    try { if (typeof window.renderHomeQuickStats === 'function') window.renderHomeQuickStats(); } catch(_){}
    try { if ((window.currentPage || '') === 'library' && typeof window.renderLibrary === 'function') window.renderLibrary(); } catch(_){}
    try { if (typeof window.updateUI === 'function') window.updateUI(); } catch(_){}
  }
  function bind(){
    refreshCurrent();
    ['storage','focus','visibilitychange'].forEach(function(evt){
      window.addEventListener(evt, function(){ setTimeout(function(){ refreshCurrent(); refreshUi(); }, 80); }, { passive:true });
    });
    ['addToLibrary','saveReadingProgress','openChapter'].forEach(function(name){
      if (typeof window[name] !== 'function' || window[name].__azv9) return;
      var orig = window[name];
      var wrapped = function(){
        var out = orig.apply(this, arguments);
        Promise.resolve(out).finally(function(){ setTimeout(refreshUi, 120); });
        return out;
      };
      wrapped.__azv9 = true;
      window[name] = wrapped;
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once:true });
  else bind();
})();
