(function() {
  'use strict';

  var SCRIPT_VERSION = 'v=16';
  var STYLE_BUNDLES = {
    reader: ['azura-reader.css?v=1'],
    adult: ['azura-adult.css?v=1']
  };

  var MODULES = {
    adminCore: [
      'js/04-admin.js?' + SCRIPT_VERSION
    ],
    banner: [
      'js/05-banner.js?' + SCRIPT_VERSION
    ],
    adult: [
      'js/07-adult.js?' + SCRIPT_VERSION
    ],
    reader: [
      'js/11-chapter-system.js?' + SCRIPT_VERSION,
      'js/13-reader-safe-upgrade.js?' + SCRIPT_VERSION
    ],
    features: [
      'js/09-features.js?' + SCRIPT_VERSION,
      'js/10-modern.js?' + SCRIPT_VERSION
    ],
    adminPage: [
      'js/04-admin.js?' + SCRIPT_VERSION,
      'js/05-banner.js?' + SCRIPT_VERSION,
      'js/11-chapter-system.js?' + SCRIPT_VERSION,
      'js/13-reader-safe-upgrade.js?' + SCRIPT_VERSION
    ]
  };

  var scriptPromises = Object.create(null);
  var bundlePromises = Object.create(null);
  var stylePromises = Object.create(null);
  var styleBundlePromises = Object.create(null);
  var pdfPromise = null;

  function log() {
    try { console.log.apply(console, ['[AZURA boot]'].concat([].slice.call(arguments))); } catch (_) {}
  }

  function afterIdle(fn, timeout) {
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(fn, { timeout: timeout || 1200 });
    } else {
      setTimeout(fn, timeout || 250);
    }
  }

  function isWeakPhone() {
    try {
      if (typeof window.azuraIsWeakPhone === 'function') return !!window.azuraIsWeakPhone();
      var mobile = window.matchMedia && window.matchMedia('(max-width: 767px)').matches;
      var mem = navigator.deviceMemory || 0;
      var cpu = navigator.hardwareConcurrency || 0;
      return !!(mobile && ((mem && mem <= 4) || (cpu && cpu <= 6)));
    } catch (_) {
      return false;
    }
  }

  function refreshRuntimeHooks(bundleName) {
    try {
      if (typeof window.azuraNormalizeCatalogCovers === 'function') window.azuraNormalizeCatalogCovers();
      if (typeof window.azuraRefreshRuntimeHooks === 'function') window.azuraRefreshRuntimeHooks(bundleName || '');
      window.dispatchEvent(new CustomEvent('azura:bundle-loaded', { detail: { bundle: bundleName || '' } }));
    } catch (e) {
      console.warn('[AZURA boot] hook refresh error:', e);
    }
  }

  function loadStyle(href) {
    if (stylePromises[href]) return stylePromises[href];

    var bareHref = href.split('?')[0];
    var existing = Array.prototype.find.call(document.querySelectorAll('link[rel="stylesheet"]'), function(link) {
      var currentHref = link.getAttribute('href') || '';
      return link.dataset.azuraStyle === href || link.dataset.azuraStyle === bareHref || currentHref.indexOf(bareHref) !== -1;
    });

    if (existing && existing.dataset.azuraLoaded === '1') {
      stylePromises[href] = Promise.resolve(existing);
      return stylePromises[href];
    }

    stylePromises[href] = new Promise(function(resolve, reject) {
      if (existing) {
        existing.addEventListener('load', function() { existing.dataset.azuraLoaded = '1'; resolve(existing); }, { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }

      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.dataset.azuraStyle = href;
      link.onload = function() { link.dataset.azuraLoaded = '1'; resolve(link); };
      link.onerror = function() { reject(new Error('Style yuklanmadi: ' + href)); };
      document.head.appendChild(link);
    });

    return stylePromises[href];
  }

  async function loadStyleBundle(name) {
    if (!STYLE_BUNDLES[name]) return;
    if (styleBundlePromises[name]) return styleBundlePromises[name];
    styleBundlePromises[name] = (async function() {
      var list = STYLE_BUNDLES[name];
      for (var i = 0; i < list.length; i++) {
        await loadStyle(list[i]);
      }
    })();
    return styleBundlePromises[name];
  }

  function loadScript(src) {
    if (scriptPromises[src]) return scriptPromises[src];

    var existing = Array.prototype.find.call(document.scripts, function(s) {
      return (s.getAttribute('src') || '').indexOf(src.split('?')[0]) !== -1;
    });

    if (existing && existing.dataset.azuraLoaded === '1') {
      scriptPromises[src] = Promise.resolve(existing);
      return scriptPromises[src];
    }

    scriptPromises[src] = new Promise(function(resolve, reject) {
      if (existing) {
        existing.addEventListener('load', function() { existing.dataset.azuraLoaded = '1'; resolve(existing); }, { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }
      var s = document.createElement('script');
      s.src = src;
      s.defer = true;
      s.dataset.azuraLoader = '1';
      s.onload = function() { s.dataset.azuraLoaded = '1'; resolve(s); };
      s.onerror = function() { reject(new Error('Script yuklanmadi: ' + src)); };
      document.body.appendChild(s);
    });

    return scriptPromises[src];
  }

  async function loadBundle(name) {
    if (!MODULES[name]) return;
    if (bundlePromises[name]) return bundlePromises[name];
    bundlePromises[name] = (async function() {
      var list = MODULES[name];
      for (var i = 0; i < list.length; i++) {
        await loadScript(list[i]);
      }
      if (name === 'adult' && typeof window.azuraPatchAdultAdminHamburger === 'function') {
        try { window.azuraPatchAdultAdminHamburger(); } catch (_) {}
      }
      if (name === 'banner' || name === 'adminPage') {
        try {
          if (typeof window.injectBannerSlots === 'function') window.injectBannerSlots();
        } catch (_) {}
      }
      refreshRuntimeHooks(name);
    })();
    return bundlePromises[name];
  }

  window.azuraLoadModules = loadBundle;
  window.azuraLoadStyleBundle = loadStyleBundle;

  
  function syncAdultUiVisibility(page) {
    try {
      var current = page || window.currentPage || 'home';
      var panel = document.getElementById('adult-admin-panel');
      var modal = document.getElementById('aap-edit-modal');
      var confirm = document.getElementById('aap-confirm-overlay');
      var progress = document.getElementById('aap-pdf-progress-overlay');

      [panel, modal, confirm, progress].forEach(function(el) {
        if (!el) return;
        if (el.hidden !== true && !el.classList.contains('open')) {
          el.hidden = true;
        }
      });

      if (current !== 'adult' && panel) {
        panel.classList.remove('open');
        panel.hidden = true;
        document.body.style.overflow = '';
      }

      if (current !== 'adult') {
        if (modal) { modal.classList.remove('open'); modal.hidden = true; }
        if (confirm) { confirm.classList.remove('open'); confirm.hidden = true; }
        if (progress) { progress.classList.remove('open'); progress.hidden = true; }
      }
    } catch (e) {
      console.warn('[AZURA boot] adult UI sync error:', e);
    }
  }

window.azuraLoadPdfJs = function() {
    if (typeof window.pdfjsLib !== 'undefined') return Promise.resolve(window.pdfjsLib);
    if (pdfPromise) return pdfPromise;

    pdfPromise = new Promise(function(resolve, reject) {
      var existing = document.querySelector('script[data-azura-pdfjs="1"]');
      function finalize() {
        if (typeof window.pdfjsLib !== 'undefined') {
          try {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc =
              'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          } catch (_) {}
          resolve(window.pdfjsLib);
        } else {
          reject(new Error('PDF.js kutubxonasi topilmadi'));
        }
      }

      if (existing) {
        existing.addEventListener('load', finalize, { once: true });
        existing.addEventListener('error', function() { reject(new Error('PDF.js yuklanmadi')); }, { once: true });
        return;
      }

      var s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      s.defer = true;
      s.dataset.azuraPdfjs = '1';
      s.onload = finalize;
      s.onerror = function() { reject(new Error('PDF.js yuklanmadi')); };
      document.body.appendChild(s);
    });

    return pdfPromise;
  };

  window.showToast = window.showToast || function(msg) {
    var t = document.getElementById('toast');
    if (!t) {
      try { console.log('[AZURA toast]', msg); } catch (_) {}
      return;
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(window.__azuraToastTimer);
    window.__azuraToastTimer = setTimeout(function() {
      t.classList.remove('show');
    }, 2600);
  };

  function cleanupDemoChapters() {
    try {
      var all = JSON.parse(localStorage.getItem('azura_chapters_pending') || '[]');
      var cleaned = all.filter(function(ch) { return !ch || !ch._isDemo; });
      if (cleaned.length !== all.length) {
        localStorage.setItem('azura_chapters_pending', JSON.stringify(cleaned));
      }
    } catch (_) {}
  }

  function proxyAction(name, bundleName) {
    var proxy = async function() {
      await loadBundle(bundleName);
      var fn = window[name];
      if (typeof fn === 'function' && fn !== proxy) {
        return fn.apply(this, arguments);
      }
      throw new Error(name + ' tayyor emas');
    };
    if (typeof window[name] !== 'function') {
      window[name] = proxy;
    }
  }

  [
    'addToLibrary',
    'claimDaily',
    'buyVip',
    'markAllRead',
    'copyUID',
    'buyCoin',
    'payChapter'
  ].forEach(function(name) {
    proxyAction(name, 'adminCore');
  });

  [
    'openChapter',
    'azuraOpenChapter',
    'openChapterModal',
    'openBulkChapterUploader',
    'openChapterAddModal',
    'openChapterUploader'
  ].forEach(function(name) {
    proxyAction(name, 'reader');
  });

  function installRouteLoader() {
    if (typeof window.navigate === 'function' && !window.navigate.__azuraLazyWrapped) {
      var originalNavigate = window.navigate;
      var wrappedNavigate = async function(page) {
        if (page === 'admin') await loadBundle('adminPage');
        else if (page === 'adult') {
          await loadStyleBundle('adult');
          await loadBundle('adult');
        }
        else if (page === 'detail') {
          await loadStyleBundle('reader');
        }
        return originalNavigate.apply(this, arguments);
      };
      wrappedNavigate.__azuraLazyWrapped = true;
      window.navigate = wrappedNavigate;
    }

    if (typeof window.openManhwa === 'function' && !window.openManhwa.__azuraLazyWrapped) {
      var originalOpenManhwa = window.openManhwa;
      var wrappedOpenManhwa = async function() {
        await loadStyleBundle('reader');
        var result = originalOpenManhwa.apply(this, arguments);
        afterIdle(function() {
          if (!bundlePromises.reader) {
            loadBundle('reader').catch(function(err) { console.warn(err); });
          }
        }, isWeakPhone() ? 2400 : 900);
        return result;
      };
      wrappedOpenManhwa.__azuraLazyWrapped = true;
      window.openManhwa = wrappedOpenManhwa;
    }
  }

  function initBaseUi() {
    cleanupDemoChapters();
    installRouteLoader();

    try {
      syncAdultUiVisibility(window.currentPage || 'home');
      if (typeof window.updateUI === 'function') window.updateUI();
    } catch (e) {
      console.warn('[AZURA boot] updateUI error:', e);
    }

    try {
      if (typeof window.renderHome === 'function') window.renderHome();
    } catch (e) {
      console.warn('[AZURA boot] renderHome error:', e);
    }

    afterIdle(function() {
      loadBundle('banner').catch(function(err) { console.warn(err); });
    }, isWeakPhone() ? 1800 : 800);

    if (isWeakPhone()) {
      var featureKick = function() {
        window.removeEventListener('touchstart', featureKick);
        window.removeEventListener('pointerdown', featureKick);
        window.removeEventListener('keydown', featureKick);
        loadBundle('features').catch(function(err) { console.warn(err); });
      };
      window.addEventListener('touchstart', featureKick, { once:true, passive:true });
      window.addEventListener('pointerdown', featureKick, { once:true, passive:true });
      window.addEventListener('keydown', featureKick, { once:true });
      setTimeout(featureKick, 6500);
    } else {
      afterIdle(function() {
        loadBundle('features').catch(function(err) { console.warn(err); });
      }, 1800);
    }
  }


  window.addEventListener('azura:route-changed', function(ev) {
    var nextPage = ev && ev.detail ? ev.detail.page : (window.currentPage || 'home');
    syncAdultUiVisibility(nextPage);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBaseUi, { once: true });
  } else {
    setTimeout(initBaseUi, 0);
  }

  log('lazy loader ready');
})();
