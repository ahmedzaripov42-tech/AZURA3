// AZURA V15 production fixes: keep original UI, fix mobile nav + banner audio + API mode hints
(function(){
  'use strict';

  function isMobile(){ return window.matchMedia && window.matchMedia('(max-width: 820px)').matches; }

  function fixMobileNav(){
    if (!isMobile()) return;
    document.querySelectorAll('.mobile-bottom-nav').forEach(function(nav){
      nav.style.setProperty('display','flex','important');
      nav.style.setProperty('position','fixed','important');
      nav.style.setProperty('top','auto','important');
      nav.style.setProperty('left','10px','important');
      nav.style.setProperty('right','10px','important');
      nav.style.setProperty('bottom','calc(env(safe-area-inset-bottom, 0px) + 10px)','important');
      nav.style.setProperty('z-index','10050','important');
      nav.style.setProperty('transform','none','important');
      nav.style.setProperty('margin','0','important');
    });
  }

  function setBtn(btn, muted){
    if (!btn) return;
    btn.dataset.muted = muted ? 'true' : 'false';
    var icon = btn.querySelector('.az-bn-audio-icon');
    var label = btn.querySelector('.az-bn-audio-label');
    if (icon) icon.textContent = muted ? '🔇' : '🔊';
    if (label) label.textContent = muted ? 'Ovoz' : 'Ovoz yoqilgan';
    btn.classList.toggle('active', !muted);
  }

  function muteVideo(video){
    if (!video) return;
    video.muted = true;
    video.defaultMuted = true;
    video.volume = 0;
    video.removeAttribute('data-audio-on');
    var wrap = video.closest('.az-bn-video-wrap');
    setBtn(wrap && wrap.querySelector('.az-bn-audio-btn'), true);
  }

  function muteAll(except){
    document.querySelectorAll('video.az-bn-media, .az-bn-video-wrap video, video').forEach(function(v){
      if (except && v === except) return;
      if (v.classList.contains('az-bn-media') || v.closest('.az-bn-video-wrap')) muteVideo(v);
    });
    try {
      if (window.AZURA_STORE) {
        AZURA_STORE.setItem('azura_banner_audio_pref','off');
        AZURA_STORE.removeItem('azura_banner_audio_banner_id');
      }
    } catch(_){ }
  }

  function bindAudioButtons(){
    document.querySelectorAll('.az-bn-video-wrap').forEach(function(wrap){
      var video = wrap.querySelector('video');
      var btn = wrap.querySelector('.az-bn-audio-btn');
      if (video) {
        video.setAttribute('playsinline','');
        video.setAttribute('muted','');
        if (!video.dataset.v15AudioReady) {
          video.dataset.v15AudioReady = '1';
          muteVideo(video);
          video.addEventListener('volumechange', function(){
            setBtn(btn, video.muted || Number(video.volume || 0) <= 0);
          });
        }
      }
      if (btn && !btn.dataset.v15Bound) {
        btn.dataset.v15Bound = '1';
        btn.addEventListener('click', function(e){
          e.preventDefault();
          e.stopPropagation();
          var v = wrap.querySelector('video');
          if (!v) return;
          var willUnmute = v.muted || Number(v.volume || 0) === 0;
          if (willUnmute) {
            muteAll(v);
            v.muted = false;
            v.defaultMuted = false;
            v.volume = 1;
            v.dataset.audioOn = '1';
            setBtn(btn, false);
            var p = v.play && v.play();
            if (p && p.catch) p.catch(function(){ muteVideo(v); });
          } else {
            muteVideo(v);
          }
        }, true);
      }
    });
  }

  function boot(){
    fixMobileNav();
    bindAudioButtons();
    muteAll();
    document.body.classList.toggle('az-production-runtime', location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  window.addEventListener('resize', fixMobileNav, { passive:true });
  window.addEventListener('orientationchange', function(){ setTimeout(fixMobileNav, 80); }, { passive:true });

  var mo = new MutationObserver(function(){
    fixMobileNav();
    bindAudioButtons();
  });
  if (document.documentElement) mo.observe(document.documentElement, { childList:true, subtree:true });
})();
