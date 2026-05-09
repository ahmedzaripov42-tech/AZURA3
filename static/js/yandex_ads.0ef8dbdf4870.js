(function () {
  'use strict';

  var KNOWN_AD_IDS = [
    'yandex_rtb_R-A-17339501-1',
    'yandex_rtb_R-A-17339501-2',
    'yandex_rtb_R-A-17339501-3'
  ];
  var DETECTION_DELAY_MS = 3200;
  var SESSION_KEY = 'mangalab.adblock.notice.v1';
  var modalOpen = false;
  var previousFocus = null;

  function onReady(callback) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', callback, { once: true });
    } else {
      callback();
    }
  }

  function safeSessionGet(key) {
    try {
      return window.sessionStorage ? window.sessionStorage.getItem(key) : null;
    } catch (error) {
      return null;
    }
  }

  function safeSessionSet(key, value) {
    try {
      if (window.sessionStorage) window.sessionStorage.setItem(key, value);
    } catch (error) {
      // Storage can be disabled; the modal must still remain closable.
    }
  }

  function adSlots() {
    return Array.prototype.slice.call(document.querySelectorAll('[data-yandex-ad]'));
  }

  function isPrivateRoute() {
    var path = window.location.pathname || '';
    return /^\/admin(?:\/|$)/.test(path)
      || /^\/dashboard(?:\/|$)/.test(path)
      || /^\/accounts\/profile(?:\/|$)/.test(path);
  }

  function advManagerAvailable() {
    return !!(
      window.Ya &&
      window.Ya.Context &&
      window.Ya.Context.AdvManager &&
      typeof window.Ya.Context.AdvManager.render === 'function'
    );
  }

  function isElementHidden(element) {
    if (!element || !document.documentElement.contains(element)) return true;
    var node = element;
    while (node && node.nodeType === 1) {
      var style = window.getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return true;
      node = node.parentElement;
    }
    return false;
  }

  function visibleKnownContainersMissingOrHidden(expectedIds) {
    return expectedIds.some(function (id) {
      var element = document.getElementById(id);
      return !element || isElementHidden(element);
    });
  }

  function bindLoaderErrorFlag() {
    var loader = document.getElementById('yandex-rtb-loader');
    if (!loader || loader.dataset.adblockBound === '1') return;
    loader.dataset.adblockBound = '1';
    loader.addEventListener('error', function () {
      window.__mangalabYandexLoaderFailed = true;
      loader.dataset.loadError = '1';
    });
  }

  function renderAds(slots) {
    window.yaContextCb = window.yaContextCb || [];
    slots.forEach(function (slot) {
      var blockId = slot.dataset.yandexBlockId;
      var renderTo = slot.dataset.yandexRenderTo || slot.id;
      if (!blockId || !renderTo || slot.getAttribute('data-yandex-rendered') === '1') return;
      if (!slot.id) slot.id = renderTo;

      window.yaContextCb.push(function () {
        if (!document.documentElement.contains(slot) || slot.getAttribute('data-yandex-rendered') === '1') return;
        if (!advManagerAvailable()) return;
        window.Ya.Context.AdvManager.render({
          blockId: blockId,
          renderTo: renderTo
        });
        slot.setAttribute('data-yandex-rendered', '1');
      });
    });
  }

  function focusableElements(root) {
    return Array.prototype.slice.call(root.querySelectorAll(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    ));
  }

  function closeModal() {
    var modal = document.querySelector('[data-adblock-modal]');
    if (!modal) return;
    safeSessionSet(SESSION_KEY, '1');
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    document.documentElement.classList.remove('overflow-hidden');
    modalOpen = false;
    if (previousFocus && typeof previousFocus.focus === 'function') {
      previousFocus.focus({ preventScroll: true });
    }
  }

  function openModal() {
    if (modalOpen || safeSessionGet(SESSION_KEY) === '1') return;
    var modal = document.querySelector('[data-adblock-modal]');
    if (!modal) return;
    previousFocus = document.activeElement;
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.documentElement.classList.add('overflow-hidden');
    modalOpen = true;

    var focusables = focusableElements(modal);
    var first = focusables[0];
    if (first) first.focus({ preventScroll: true });
  }

  function bindModal(expectedIds) {
    var modal = document.querySelector('[data-adblock-modal]');
    if (!modal || modal.dataset.bound === '1') return;
    modal.dataset.bound = '1';

    modal.querySelectorAll('[data-adblock-close]').forEach(function (button) {
      button.addEventListener('click', closeModal);
    });

    var backdrop = modal.querySelector('[data-adblock-backdrop]');
    if (backdrop) backdrop.addEventListener('click', closeModal);

    var recheck = modal.querySelector('[data-adblock-recheck]');
    if (recheck) {
      recheck.addEventListener('click', function () {
        if (advManagerAvailable() && !visibleKnownContainersMissingOrHidden(expectedIds)) {
          closeModal();
          return;
        }
        window.location.reload();
      });
    }

    document.addEventListener('keydown', function (event) {
      if (!modalOpen) return;
      if (event.key === 'Escape') {
        closeModal();
        return;
      }
      if (event.key !== 'Tab') return;
      var focusables = focusableElements(modal);
      if (!focusables.length) return;
      var first = focusables[0];
      var last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
  }

  function detectAdBlock(expectedIds) {
    window.setTimeout(function () {
      if (!adSlots().length || safeSessionGet(SESSION_KEY) === '1') return;
      var loaderFailed = !!window.__mangalabYandexLoaderFailed;
      var missingManager = !advManagerAvailable();
      var blockedContainer = visibleKnownContainersMissingOrHidden(expectedIds);

      if (loaderFailed || missingManager || blockedContainer) {
        openModal();
      }
    }, DETECTION_DELAY_MS);
  }

  onReady(function () {
    var slots = adSlots();
    if (!slots.length || isPrivateRoute()) return;
    var expectedIds = slots
      .map(function (slot) { return slot.dataset.yandexRenderTo || slot.id; })
      .filter(function (id) { return KNOWN_AD_IDS.indexOf(id) !== -1; });

    bindLoaderErrorFlag();
    bindModal(expectedIds);
    renderAds(slots);
    detectAdBlock(expectedIds);
  });
})();
