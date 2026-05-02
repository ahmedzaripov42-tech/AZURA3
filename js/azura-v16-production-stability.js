// AZURA V16 — production stability patch: DB diagnostics, mobile nav, banner mute.
(function(){
  'use strict';
  function ready(fn){ if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, {once:true}); else fn(); }

  function isMobile(){ return window.matchMedia && window.matchMedia('(max-width: 768px)').matches; }
  function fixMobileNav(){
    var navs = Array.from(document.querySelectorAll('.mobile-bottom-nav'));
    if (!navs.length) return;
    navs.forEach(function(nav, idx){
      if (isMobile()) {
        nav.style.setProperty('display', idx === navs.length - 1 ? 'flex' : 'none', 'important');
        if (idx === navs.length - 1) {
          nav.style.setProperty('position', 'fixed', 'important');
          nav.style.setProperty('top', 'auto', 'important');
          nav.style.setProperty('bottom', 'calc(env(safe-area-inset-bottom, 0px) + 10px)', 'important');
          nav.style.setProperty('left', '12px', 'important');
          nav.style.setProperty('right', '12px', 'important');
          nav.style.setProperty('z-index', '2147483000', 'important');
          nav.style.setProperty('transform', 'none', 'important');
        }
      } else {
        nav.style.setProperty('display', 'none', 'important');
      }
    });
  }

  function forceMuteBannerVideos(){
    document.querySelectorAll('.az-bn-video-wrap video, video.az-bn-media, .azura-banner-item video, .banner-video video').forEach(function(v){
      try {
        v.muted = true;
        v.defaultMuted = true;
        v.volume = 0;
        v.setAttribute('muted','');
        v.setAttribute('playsinline','');
        v.playsInline = true;
      } catch(e) {}
      var wrap = v.closest && v.closest('.az-bn-video-wrap');
      var btn = wrap && wrap.querySelector('.az-bn-audio-btn');
      if (btn) {
        btn.classList.remove('active');
        btn.setAttribute('aria-pressed', 'false');
        var icon = btn.querySelector('.az-bn-audio-icon');
        var label = btn.querySelector('.az-bn-audio-label');
        if (icon) icon.textContent = '🔇';
        if (label) label.textContent = 'Ovoz';
      }
    });
  }

  var oldToggle = window._azBnToggleAudio;
  window._azBnToggleAudio = function(btn, forceState){
    var wrap = btn && btn.closest ? btn.closest('.az-bn-video-wrap') : null;
    var video = wrap ? wrap.querySelector('video') : null;
    if (!video) return false;
    var isOn = !video.muted && Number(video.volume || 0) > 0;
    var turnOn = (typeof forceState === 'boolean') ? forceState : !isOn;
    if (!turnOn) {
      video.muted = true; video.defaultMuted = true; video.volume = 0; video.setAttribute('muted','');
      try { if (window.AZURA_STORE) window.AZURA_STORE.setItem('azura_banner_audio_pref', 'off'); } catch(e) {}
      if (btn) {
        btn.classList.remove('active'); btn.setAttribute('aria-pressed','false');
        var icon = btn.querySelector('.az-bn-audio-icon'); var label = btn.querySelector('.az-bn-audio-label');
        if (icon) icon.textContent = '🔇'; if (label) label.textContent = 'Ovoz';
      }
      return false;
    }
    if (typeof oldToggle === 'function') return oldToggle(btn, true);
    video.muted = false; video.defaultMuted = false; video.volume = 1; video.removeAttribute('muted');
    try { video.play && video.play(); } catch(e) {}
    if (btn) { btn.classList.add('active'); btn.setAttribute('aria-pressed','true'); }
    return false;
  };

  ready(function(){
    fixMobileNav();
    forceMuteBannerVideos();
    setTimeout(fixMobileNav, 250);
    setTimeout(forceMuteBannerVideos, 400);
    new MutationObserver(function(){ fixMobileNav(); forceMuteBannerVideos(); })
      .observe(document.documentElement, { childList:true, subtree:true });
  });
  window.addEventListener('resize', fixMobileNav, { passive:true });
  window.addEventListener('orientationchange', function(){ setTimeout(fixMobileNav, 150); }, { passive:true });
})();
