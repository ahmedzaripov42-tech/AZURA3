// AZURA V17 — critical production hotfixes.
// Keeps the original design, fixes auth click reliability, DB diagnostics, mobile bottom nav, and ad audio defaults.
(function(){
  'use strict';
  var API_BASE = '/api';
  function $(id){ return document.getElementById(id); }
  function ready(fn){ if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, {once:true}); else fn(); }
  function showLoginError(msg){
    var el = $('login-error');
    if (el) { el.textContent = '⚠ ' + (msg || 'Kirishda xatolik'); el.classList.add('show'); }
  }
  function clearLoginError(){ var el = $('login-error'); if (el) { el.textContent=''; el.classList.remove('show'); } }
  function setBusy(btn, busy){
    if (!btn) return;
    btn.disabled = !!busy;
    btn.classList.toggle('azura-btn-loading', !!busy);
    btn.innerHTML = busy ? 'Tekshirilmoqda…' : '⚔&nbsp;&nbsp;KIRISH';
  }
  async function postJson(url, body){
    var res = await fetch(url, {
      method:'POST',
      headers:{'content-type':'application/json'},
      credentials:'same-origin',
      body: JSON.stringify(body || {})
    });
    var text = await res.text();
    var data = {};
    try { data = text ? JSON.parse(text) : {}; } catch(e) { data = { ok:false, error:text || 'JSON javob noto‘g‘ri' }; }
    if (!res.ok || data.ok === false) {
      var msg = data.error || data.message || ('HTTP ' + res.status);
      if (data.requestId) msg += ' [' + data.requestId + ']';
      var err = new Error(msg);
      err.status = res.status; err.data = data;
      throw err;
    }
    return data;
  }
  function saveSession(data){
    try {
      var token = data.sessionToken || data.token || '';
      if (token && window.AZURA_STORE) window.AZURA_STORE.setItem('azura_session_token', token);
      else if (token) localStorage.setItem('azura_session_token', token);
      var user = data.user || null;
      if (user) {
        if (window.AZURA_STORE) window.AZURA_STORE.setItem('azura_current_user', JSON.stringify(user));
        else localStorage.setItem('azura_current_user', JSON.stringify(user));
        window.currentUser = user;
      }
    } catch(e) {}
  }
  async function stableLogin(){
    clearLoginError();
    var login = (($('login-username') || {}).value || '').trim();
    var password = (($('login-password') || {}).value || '').trim();
    var btn = $('btn-login');
    if (!login || !password) { showLoginError('Login va parolni kiriting'); return false; }
    setBusy(btn, true);
    try {
      var data = await postJson(API_BASE + '/auth', { action:'login', login:login, password:password });
      saveSession(data);
      if (typeof window.closeAuth === 'function') window.closeAuth();
      if (typeof window.updateUI === 'function') window.updateUI();
      if (typeof window.navigate === 'function') window.navigate('home');
      if (typeof window.showToast === 'function') window.showToast('✅ Xush kelibsiz!', 'success');
      return true;
    } catch(err) {
      console.warn('[AZURA V17 login]', err);
      var msg = err.message || 'Server xatosi';
      if (/D1 binding|DB topilmadi|database/i.test(msg)) msg = 'D1 ulanmagan yoki deploy qayta ishga tushmagan. Cloudflare Bindings: DB → azura_db.';
      showLoginError(msg);
      return false;
    } finally {
      setBusy(btn, false);
    }
  }
  function patchAuthButtons(){
    var btn = $('btn-login');
    if (btn && !btn.dataset.azV17Click) {
      btn.dataset.azV17Click = '1';
      btn.disabled = false;
      btn.removeAttribute('disabled');
      btn.addEventListener('click', function(ev){ ev.preventDefault(); ev.stopPropagation(); stableLogin(); }, true);
    }
    ['login-username','login-password'].forEach(function(id){
      var el = $(id);
      if (el && !el.dataset.azV17Enter) {
        el.dataset.azV17Enter = '1';
        el.addEventListener('keydown', function(ev){ if (ev.key === 'Enter') { ev.preventDefault(); stableLogin(); } }, true);
      }
    });
    window.doLogin = stableLogin;
  }
  function fixBottomNav(){
    var navs = Array.prototype.slice.call(document.querySelectorAll('.mobile-bottom-nav'));
    navs.forEach(function(nav, i){
      if (window.matchMedia('(max-width: 768px)').matches) {
        nav.style.setProperty('position','fixed','important');
        nav.style.setProperty('top','auto','important');
        nav.style.setProperty('bottom','calc(env(safe-area-inset-bottom, 0px) + 10px)','important');
        nav.style.setProperty('left','12px','important');
        nav.style.setProperty('right','12px','important');
        nav.style.setProperty('width','auto','important');
        nav.style.setProperty('z-index','2147483000','important');
        nav.style.setProperty('transform','none','important');
        nav.style.setProperty('display', i === navs.length - 1 ? 'flex' : 'none','important');
      }
    });
  }
  function muteAds(){
    document.querySelectorAll('video').forEach(function(v){
      try { v.muted = true; v.defaultMuted = true; v.volume = 0; v.setAttribute('muted',''); v.setAttribute('playsinline',''); v.playsInline = true; } catch(e) {}
    });
  }
  window.azuraV17HealthCheck = async function(){
    try { return await fetch('/api/health', {credentials:'same-origin'}).then(function(r){ return r.json(); }); }
    catch(e) { return { ok:false, error:String(e && e.message || e) }; }
  };
  ready(function(){
    patchAuthButtons(); fixBottomNav(); muteAds();
    setTimeout(function(){ patchAuthButtons(); fixBottomNav(); muteAds(); }, 300);
    setTimeout(function(){ patchAuthButtons(); fixBottomNav(); muteAds(); }, 1000);
    new MutationObserver(function(){ patchAuthButtons(); fixBottomNav(); muteAds(); })
      .observe(document.documentElement, { childList:true, subtree:true, attributes:true, attributeFilter:['class','style','disabled'] });
  });
  window.addEventListener('resize', fixBottomNav, { passive:true });
})();
