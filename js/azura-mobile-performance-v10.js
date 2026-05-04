/* AZURA mobile performance v10 (build v2)
   Adds:
   - early <html> class detection (set by inline boot guard)
   - R2/CDN-aware cover URL rewriting
   - adaptive grid/row chunk sizing based on net + device
   - prefers-reduced-data + saveData honored
   - safe re-runs on bundle-loaded events
*/
(function () {
  'use strict';

  function onReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  }
  function idle(fn, timeout) {
    if ('requestIdleCallback' in window) return window.requestIdleCallback(fn, { timeout: timeout || 1200 });
    return setTimeout(fn, 180);
  }
  function isMobile() {
    return window.matchMedia && window.matchMedia('(max-width: 767px)').matches;
  }
  function isWeakPhone() {
    var mem = navigator.deviceMemory || 0;
    var cpu = navigator.hardwareConcurrency || 0;
    return isMobile() && ((mem && mem <= 4) || (cpu && cpu <= 6));
  }
  function isDataSaver() {
    try {
      return !!((navigator.connection && navigator.connection.saveData) ||
        window.matchMedia('(prefers-reduced-data: reduce)').matches);
    } catch (_) { return false; }
  }
  function netHint() {
    try {
      var c = navigator.connection;
      if (!c) return { type: 'unknown', slow: false };
      var et = c.effectiveType || '';
      var slow = et === 'slow-2g' || et === '2g' || (c.downlink && c.downlink < 1.2);
      return { type: et, slow: !!slow };
    } catch (_) { return { type: 'unknown', slow: false }; }
  }
  function shouldUseLiteFonts() {
    return isWeakPhone() || isDataSaver() || netHint().slow;
  }

  // ---- Cover URL rewriting (R2/CDN aware) ---------------------------------
  function mediaBase() {
    var cfg = window.AZURA_CONFIG || {};
    return String(cfg.mediaBase || '').replace(/\/$/, '');
  }
  function isRemote() {
    return (window.AZURA_CONFIG && window.AZURA_CONFIG.dataMode === 'remote') ||
      window.__AZURA_RUNTIME_MODE === 'remote';
  }
  function optimizeCoverSrc(src) {
    if (!src || typeof src !== 'string') return src;
    var rel = src.indexOf('assets/covers/') !== -1 || src.indexOf('/assets/covers/') !== -1;
    if (!rel) return src;
    var out = src.replace(/\.jpg($|\?)/i, '.webp$1').replace(/\.jpeg($|\?)/i, '.webp$1');
    if (isRemote()) {
      var base = mediaBase();
      if (base) {
        var stripped = out.replace(/^\.?\/?assets\//, '');
        if (out !== stripped) out = base + '/' + stripped;
      }
    }
    return out;
  }
  function normalizeCatalogCovers() {
    var lists = [window.MANHWA_DATA, window.AZURA_CATALOG, window.ADULT_DATA_SEED];
    lists.forEach(function (list) {
      if (!Array.isArray(list)) return;
      list.forEach(function (item) {
        if (!item || typeof item !== 'object') return;
        if (item.cover) item.cover = optimizeCoverSrc(item.cover);
        if (item.poster) item.poster = optimizeCoverSrc(item.poster);
        if (item.image) item.image = optimizeCoverSrc(item.image);
      });
    });
  }
  window.azuraGetOptimizedCoverSrc = optimizeCoverSrc;
  window.azuraNormalizeCatalogCovers = normalizeCatalogCovers;
  window.azuraIsWeakPhone = isWeakPhone;
  window.azuraIsDataSaver = isDataSaver;
  window.azuraNetHint = netHint;

  // ---- Lazy fonts ---------------------------------------------------------
  function loadFontsLazily() {
    if (document.getElementById('az-fonts-link')) return;
    if (shouldUseLiteFonts()) {
      document.body.classList.add('az-font-lite');
      return;
    }
    idle(function () {
      var pre1 = document.createElement('link');
      pre1.rel = 'preconnect'; pre1.href = 'https://fonts.googleapis.com';
      document.head.appendChild(pre1);
      var pre2 = document.createElement('link');
      pre2.rel = 'preconnect'; pre2.href = 'https://fonts.gstatic.com'; pre2.crossOrigin = 'anonymous';
      document.head.appendChild(pre2);
      var l = document.createElement('link');
      l.id = 'az-fonts-link';
      l.rel = 'stylesheet';
      l.href = 'https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@400;700;900&family=Cinzel:wght@400;600;700&family=Inter:wght@300;400;500;600;700&display=swap';
      document.head.appendChild(l);
    }, 1500);
  }

  // ---- Chunked rendering --------------------------------------------------
  function scheduleChunk(fn) {
    if ('requestIdleCallback' in window) return window.requestIdleCallback(fn, { timeout: 700 });
    return setTimeout(fn, 34);
  }
  function preferredCounts(kind) {
    var weak = isWeakPhone();
    var slow = netHint().slow || isDataSaver();
    var penalty = slow ? 2 : 0;
    if (kind === 'row') return { initial: Math.max(3, (weak ? 5 : 8) - penalty), batch: Math.max(2, (weak ? 4 : 6) - penalty) };
    if (kind === 'grid') return { initial: Math.max(4, (weak ? 8 : 14) - penalty * 2), batch: Math.max(3, (weak ? 6 : 10) - penalty) };
    if (kind === 'library') return { initial: Math.max(3, (weak ? 6 : 10) - penalty), batch: Math.max(2, (weak ? 4 : 8) - penalty) };
    return { initial: Math.max(3, (weak ? 6 : 10) - penalty), batch: Math.max(2, (weak ? 4 : 8) - penalty) };
  }
  function buildSignature(items, key) {
    try {
      return [
        key || '',
        items.length,
        items.slice(0, 12).map(function (item) {
          if (!item) return '';
          if (typeof item === 'string') return item;
          return item.id || item.manhwaId || item.chapterId || item.title || JSON.stringify(item).slice(0, 48);
        }).join('|')
      ].join('::');
    } catch (_) { return String(Date.now()); }
  }
  function appendHtmlInChunks(container, items, renderItem, opts) {
    if (!container || typeof renderItem !== 'function') return;
    opts = opts || {};
    items = Array.isArray(items) ? items.slice() : [];
    var counts = preferredCounts(opts.kind || 'default');
    var initial = Math.max(1, Number(opts.initial || counts.initial) || counts.initial);
    var batch = Math.max(1, Number(opts.batch || counts.batch) || counts.batch);
    var signature = buildSignature(items, opts.key || container.id || container.className || '');
    if (!opts.force && container.dataset.azRenderSig === signature) {
      if (typeof opts.onDone === 'function') opts.onDone();
      return;
    }
    container.dataset.azRenderSig = signature;
    if (!items.length) {
      container.innerHTML = opts.emptyHtml || '';
      if (typeof opts.afterInitial === 'function') opts.afterInitial();
      if (typeof opts.onDone === 'function') opts.onDone();
      return;
    }
    var idx = 0;
    var firstHtml = '';
    while (idx < items.length && idx < initial) {
      firstHtml += renderItem(items[idx], idx) || ''; idx++;
    }
    container.innerHTML = firstHtml;
    if (typeof opts.afterInitial === 'function') opts.afterInitial();
    function pump(deadline) {
      var loops = 0; var html = '';
      while (idx < items.length) {
        if (loops >= batch) {
          if (!(deadline && typeof deadline.timeRemaining === 'function' && deadline.timeRemaining() > 7)) break;
        }
        html += renderItem(items[idx], idx) || ''; idx++; loops++;
      }
      if (html) container.insertAdjacentHTML('beforeend', html);
      if (idx < items.length) scheduleChunk(pump);
      else if (typeof opts.onDone === 'function') opts.onDone();
    }
    if (idx < items.length) scheduleChunk(pump);
    else if (typeof opts.onDone === 'function') opts.onDone();
  }
  window.azuraAppendHtmlInChunks = appendHtmlInChunks;
  window.azuraPreferredCounts = preferredCounts;

  function deferUntilVisible(el, fn, opts) {
    if (!el || typeof fn !== 'function') return function () { };
    opts = opts || {};
    var rootMargin = opts.rootMargin || (isWeakPhone() ? '220px 0px' : '360px 0px');
    var once = opts.once !== false;
    var done = false;
    function run() {
      if (done && once) return;
      done = true;
      try { fn(); } catch (e) { console.warn('[AZURA perf] deferUntilVisible error:', e); }
    }
    if (!('IntersectionObserver' in window)) { scheduleChunk(run); return function () { }; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting || entry.intersectionRatio > 0) {
          run();
          if (once) io.disconnect();
        }
      });
    }, { rootMargin: rootMargin, threshold: opts.threshold || 0.01 });
    io.observe(el);
    if (opts.idle !== false) idle(run);
    return function () { try { io.disconnect(); } catch (_) { } };
  }
  window.azuraDeferUntilVisible = deferUntilVisible;

  // ---- Image optimization -------------------------------------------------
  function optimizeImage(img) {
    if (!img || img.dataset.azPerfDone) return;
    img.dataset.azPerfDone = '1';
    if (!img.loading) img.loading = 'lazy';
    if (img.loading === 'lazy' && !img.fetchPriority) img.fetchPriority = 'low';
    img.decoding = 'async';
    var src = img.getAttribute('src');
    var opt = optimizeCoverSrc(src);
    if (opt && opt !== src) {
      img.dataset.azFallbackSrc = src;
      img.src = opt;
      img.addEventListener('error', function onErr() {
        img.removeEventListener('error', onErr);
        if (img.dataset.azFallbackSrc) img.src = img.dataset.azFallbackSrc;
      }, { once: true });
    }
  }
  function optimizeImages(root) {
    (root || document).querySelectorAll('img').forEach(optimizeImage);
  }
  function throttle(fn, wait) {
    var last = 0, t = 0;
    return function () {
      var now = Date.now(); var args = arguments, ctx = this;
      if (now - last >= wait) { last = now; return fn.apply(ctx, args); }
      clearTimeout(t);
      t = setTimeout(function () { last = Date.now(); fn.apply(ctx, args); }, wait - (now - last));
    };
  }
  function tuneVideos() {
    var weak = isWeakPhone();
    document.querySelectorAll('video').forEach(function (v) {
      if (weak || isDataSaver()) {
        v.preload = 'none';
        v.disablePictureInPicture = true;
        v.removeAttribute('autoplay');
      }
      if ('IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              if (v.autoplay && typeof v.play === 'function') v.play().catch(function () { });
            } else if (!v.paused && typeof v.pause === 'function') {
              v.pause();
            }
          });
        }, { threshold: 0.15 });
        io.observe(v);
      }
    });
  }
  function installMutationOptimizer() {
    if (!('MutationObserver' in window)) return;
    var mo = new MutationObserver(throttle(function (muts) {
      muts.forEach(function (m) {
        m.addedNodes && Array.prototype.forEach.call(m.addedNodes, function (n) {
          if (!n || n.nodeType !== 1) return;
          if (n.tagName === 'IMG') optimizeImage(n);
          else optimizeImages(n);
        });
      });
    }, 120));
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }
  function markPerformanceMode() {
    var weak = isWeakPhone();
    var saver = isDataSaver();
    var slow = netHint().slow;
    document.body.classList.toggle('az-perf-lite', weak || saver || slow);
    document.body.classList.toggle('az-font-lite', shouldUseLiteFonts());
    document.body.classList.toggle('az-data-saver', saver);
    document.body.classList.toggle('az-slow-net', slow);
  }

  window.addEventListener('azura:bundle-loaded', function () {
    try { normalizeCatalogCovers(); } catch (_) { }
    optimizeImages(document);
    tuneVideos();
  });
  window.addEventListener('azura:adapter-ready', function () {
    try { normalizeCatalogCovers(); } catch (_) { }
  });

  try { normalizeCatalogCovers(); } catch (_) { }

  onReady(function () {
    markPerformanceMode();
    try { normalizeCatalogCovers(); } catch (_) { }
    loadFontsLazily();
    optimizeImages(document);
    tuneVideos();
    installMutationOptimizer();
    window.addEventListener('resize', throttle(markPerformanceMode, 150), { passive: true });
    if (navigator.connection && typeof navigator.connection.addEventListener === 'function') {
      navigator.connection.addEventListener('change', markPerformanceMode);
    }
  });
})();
