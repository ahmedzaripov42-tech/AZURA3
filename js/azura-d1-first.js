/* AZURA D1-first bootstrap: D1 is primary, localStorage is cache/fallback only */
(function(){
  'use strict';
  if (window.__AZURA_D1_FIRST__) return;
  window.__AZURA_D1_FIRST__ = true;


  const RAW_LOCAL_STORAGE = window.localStorage;
  const D1_KEYS = /^(azura_user|azura_current_user|azura_library|azura_history|azura_views|azura_chapters|azura_comments|azura_notifications|azura_profile)/;
  function safeGet(k){ try { return RAW_LOCAL_STORAGE ? RAW_LOCAL_STORAGE.getItem(k) : null; } catch(_) { return null; } }
  function safeSet(k,v){ try { if (RAW_LOCAL_STORAGE) RAW_LOCAL_STORAGE.setItem(k,v); } catch(_) {} }
  function safeRemove(k){ try { if (RAW_LOCAL_STORAGE) RAW_LOCAL_STORAGE.removeItem(k); } catch(_) {} }
  window.AZURA_STORE = window.AZURA_STORE || {
    getItem: function(key){ return safeGet(String(key)); },
    setItem: function(key, value){
      key = String(key);
      safeSet(key, String(value));
      if (D1_KEYS.test(key) && window.AZURA_API && !window.__AZURA_LOCAL_ONLY__) {
        try { window.dispatchEvent(new CustomEvent('azura:cache:set', { detail:{ key:key } })); } catch(_) {}
      }
    },
    removeItem: function(key){ safeRemove(String(key)); },
    clear: function(){ try { if (RAW_LOCAL_STORAGE) RAW_LOCAL_STORAGE.clear(); } catch(_) {} },
    key: function(i){ try { return RAW_LOCAL_STORAGE ? RAW_LOCAL_STORAGE.key(i) : null; } catch(_) { return null; } },
    get length(){ try { return RAW_LOCAL_STORAGE ? RAW_LOCAL_STORAGE.length : 0; } catch(_) { return 0; } }
  };

  function cacheSet(key, value){
    try { window.AZURA_STORE.setItem(key, JSON.stringify(value)); } catch(_) {}
  }



  window.AZURA_CACHE = window.AZURA_CACHE || {
    get: function(key, fallback){
      try { var v = window.AZURA_STORE.getItem(key); return v == null ? fallback : JSON.parse(v); } catch(_) { return fallback; }
    },
    set: function(key, value){ cacheSet(key, value); return value; },
    remove: function(key){ try { window.AZURA_STORE.removeItem(key); } catch(_) {} }
  };

  async function apiJson(url, options){
    var res = await fetch(url, Object.assign({ credentials:'include', cache:'no-store', headers:{'Accept':'application/json'} }, options || {}));
    if (!res.ok) throw new Error(url + ' -> ' + res.status);
    return res.json();
  }

  window.AZURA_API = window.AZURA_API || {
    get: apiJson,
    post: function(url, body){ return apiJson(url, { method:'POST', headers:{'Content-Type':'application/json','Accept':'application/json'}, body: JSON.stringify(body || {}) }); },
    put: function(url, body){ return apiJson(url, { method:'PUT', headers:{'Content-Type':'application/json','Accept':'application/json'}, body: JSON.stringify(body || {}) }); },
    del: function(url){ return apiJson(url, { method:'DELETE' }); }
  };

  async function getJson(url){
    var res = await fetch(url, { credentials:'include', cache:'no-store' });
    if (!res.ok) throw new Error(url + ' -> ' + res.status);
    return res.json();
  }

  async function hydrateChapters(){
    try {
      var data = await getJson('/api/chapters?limit=500');
      if (data && data.ok && Array.isArray(data.chapters)) {
        cacheSet('azura_chapters_pending', data.chapters);
        window.AZURA_D1_CHAPTERS = data.chapters;
        window.dispatchEvent(new CustomEvent('azura:d1:chapters', { detail:data.chapters }));
      }
    } catch(e) {
      console.warn('[AZURA] D1 chapters cache fallback:', e.message || e);
    }
  }

  window.AZURA_D1_REFRESH = function(){ return hydrateChapters(); };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hydrateChapters, { once:true });
  } else {
    hydrateChapters();
  }
})();
