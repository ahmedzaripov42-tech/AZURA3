// AZURA V13 — D1-first key/value store facade.
// Keeps legacy UI working while mirroring allowed data to Cloudflare D1 /api/db.
(function(){
  'use strict';
  var nativeStore = window.localStorage;
  var memory = Object.create(null);
  var pending = Object.create(null);
  var API = '/api/db';
  function canUseNative(){ try { var k='__az_test__'; nativeStore.setItem(k,'1'); nativeStore.removeItem(k); return true; } catch(e){ return false; } }
  var nativeOk = !!nativeStore && canUseNative();
  function allowedKey(key){
    key = String(key || '');
    return /^azura_(banners_v4|adult_content|catalog_overrides|user_library_|chapter_progress_|views|promos|payments|chapters_pending|current|users|admins|settings|coin|vip|notifications|comments|ratings|bookmarks|history|banner_)/.test(key);
  }
  function getLocal(key){
    key = String(key || '');
    try { if (nativeOk) { var v = nativeStore.getItem(key); if (v !== null && v !== undefined) return v; } } catch(e){}
    return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null;
  }
  function setLocal(key, value){
    key = String(key || ''); value = String(value);
    memory[key] = value;
    try { if (nativeOk) nativeStore.setItem(key, value); } catch(e){}
  }
  function removeLocal(key){
    key = String(key || ''); delete memory[key];
    try { if (nativeOk) nativeStore.removeItem(key); } catch(e){}
  }
  function mirrorSet(key, raw){
    if (!allowedKey(key) || location.protocol === 'file:') return;
    clearTimeout(pending[key]);
    pending[key] = setTimeout(function(){
      var value;
      try { value = JSON.parse(raw); } catch(e) { value = raw; }
      fetch(API, { method:'POST', credentials:'include', headers:{'content-type':'application/json'}, body: JSON.stringify({key:key, value:value, updatedAt:Date.now()}) }).catch(function(){});
    }, 250);
  }
  window.AZURA_STORE = {
    getItem:function(key){ return getLocal(key); },
    setItem:function(key, value){ setLocal(key, value); mirrorSet(String(key || ''), String(value)); },
    removeItem:function(key){ removeLocal(key); },
    clear:function(){ try { if (nativeOk) nativeStore.clear(); } catch(e){} memory = Object.create(null); },
    key:function(i){ try { return nativeOk ? nativeStore.key(i) : Object.keys(memory)[i] || null; } catch(e){ return Object.keys(memory)[i] || null; } },
    get length(){ try { return nativeOk ? nativeStore.length : Object.keys(memory).length; } catch(e){ return Object.keys(memory).length; } }
  };
})();
