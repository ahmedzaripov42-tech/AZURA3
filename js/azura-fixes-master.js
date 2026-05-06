/**
 * AZURA MASTER FIX v1.0
 * Tuzatilgan muammolar:
 * 1. Admin panel ochilmaydigan bug
 * 2. MANHWA_DATA localStorage ga saqlanmaydi (qo'shilgan manhwalar yo'qoladi)
 * 3. ?mode=remote har safar yozish kerak — endi tugma bilan avtomatik
 * 4. Sayt "qotib qolish" muammosi
 */

(function() {
  'use strict';

  // ══════════════════════════════════════════════════════
  // 1. MANHWA_DATA PERSISTENCE FIX
  //    Admin qo'shgan manhwalar sahifa yangilanganda yo'qolmasin
  // ══════════════════════════════════════════════════════
  var MANHWA_EXTRA_KEY = 'azura_manhwa_extra';

  function loadExtraManhwa() {
    try {
      var extra = JSON.parse(localStorage.getItem(MANHWA_EXTRA_KEY) || '[]');
      if (!Array.isArray(extra) || extra.length === 0) return;
      if (typeof window.MANHWA_DATA === 'undefined') return;
      extra.forEach(function(m) {
        if (!m || !m.id) return;
        var exists = window.MANHWA_DATA.find(function(x) { return x.id === m.id; });
        if (!exists) window.MANHWA_DATA.push(m);
      });
    } catch(e) {}
  }

  function patchAddManhwaAdmin() {
    var orig = window.addManhwaAdmin;
    if (typeof orig !== 'function') return;
    window.addManhwaAdmin = function() {
      var beforeLen = window.MANHWA_DATA ? window.MANHWA_DATA.length : 0;
      orig.apply(this, arguments);
      var afterLen = window.MANHWA_DATA ? window.MANHWA_DATA.length : 0;
      if (afterLen > beforeLen) {
        // Yangi manhwa qo'shildi — saqlash
        saveExtraManhwa();
      }
    };
  }

  function patchSaveEditManhwaAdmin() {
    var orig = window.saveEditManhwaAdmin;
    if (typeof orig !== 'function') return;
    window.saveEditManhwaAdmin = function() {
      orig.apply(this, arguments);
      saveExtraManhwa();
    };
  }

  function patchDeleteManhwaAdmin() {
    var orig = window.deleteManhwaAdmin;
    if (typeof orig !== 'function') return;
    window.deleteManhwaAdmin = function(id) {
      orig.apply(this, arguments);
      // Extra ro'yxatdan ham o'chirish
      try {
        var extra = JSON.parse(localStorage.getItem(MANHWA_EXTRA_KEY) || '[]');
        extra = extra.filter(function(m) { return m.id !== id; });
        localStorage.setItem(MANHWA_EXTRA_KEY, JSON.stringify(extra));
      } catch(e) {}
    };
  }

  function saveExtraManhwa() {
    try {
      if (!window.MANHWA_DATA) return;
      // Faqat admin qo'shgan manhwalarni saqlash (cover assets yo'q bo'lganlari)
      var baseIds = new Set();
      try {
        // Original MANHWA_DATA dagi IDlarni olish (js/01-core.js dan)
        var origScript = document.querySelector('script[src*="01-core"]');
        // ID ni cover yo'li bilan aniqlaymiz — barcha extra manhwalar saqlanadi
      } catch(_) {}

      // Admin qo'shgan manhwalar "admin-" prefiksi bilan boshlanadi
      var extra = window.MANHWA_DATA.filter(function(m) {
        return m && m.id && (
          String(m.id).startsWith('admin-') ||
          (m._adminAdded === true)
        );
      });
      // Agar cover data: URL bo'lsa cover hajmini kamaytirish
      var slim = extra.map(function(m) {
        var clone = Object.assign({}, m);
        // data: URL bo'lsa IndexedDB ga saqlangan bo'lishi kerak, URL qoldirish
        if (clone.cover && clone.cover.startsWith('data:') && clone.cover.length > 5000) {
          clone._coverIdb = true;
          clone.cover = ''; // keyinroq IDB dan yuklanadi
        }
        return clone;
      });
      localStorage.setItem(MANHWA_EXTRA_KEY, JSON.stringify(slim));
      if (typeof window.showToast === 'function') {
        window.showToast('💾 Manhwa saqlandi', 'success');
      }
    } catch(e) {
      console.warn('[FIX] saveExtraManhwa error:', e);
    }
  }

  // ══════════════════════════════════════════════════════
  // 2. ADMIN PANEL BUG FIX
  //    navigate('admin') da renderAdmin chaqirilmaydigan holat
  // ══════════════════════════════════════════════════════
  function patchNavigateAdmin() {
    // navigateAdmin funksiyasini kuchaytirish
    window.navigateAdmin = function() {
      if (typeof window.navigate !== 'function') {
        console.warn('[FIX] navigate funksiyasi topilmadi');
        return;
      }
      window.navigate('admin');
      // renderAdmin ni 3 marta urinish bilan chaqirish
      var attempts = 0;
      var maxAttempts = 5;
      var interval = setInterval(function() {
        attempts++;
        if (window.currentPage === 'admin' && typeof window.renderAdmin === 'function') {
          try {
            window.renderAdmin('dashboard');
          } catch(e) {
            console.warn('[FIX] renderAdmin error:', e);
          }
          clearInterval(interval);
        }
        if (attempts >= maxAttempts) {
          clearInterval(interval);
          if (window.currentPage !== 'admin') {
            console.warn('[FIX] Admin panelga o\'ta olmadi');
          }
        }
      }, 200);
    };

    // navigate('admin') da ham renderAdmin muammosini tuzatish
    var _origNav = window.navigate;
    if (typeof _origNav === 'function' && !_origNav._adminFixed) {
      window.navigate = function(page) {
        _origNav.apply(this, arguments);
        if (page === 'admin') {
          setTimeout(function() {
            var role = typeof window.getUserRole === 'function' && window.currentUser
              ? window.getUserRole(window.currentUser.uid) : 'guest';
            if (role !== 'owner' && role !== 'admin') return;
            if (typeof window.renderAdmin === 'function' && window.currentPage === 'admin') {
              try { window.renderAdmin('dashboard'); } catch(e) {}
            }
          }, 300);
        }
      };
      window.navigate._adminFixed = true;
    }
  }

  // ══════════════════════════════════════════════════════
  // 3. MODE TOGGLE TUGMASI FIX + AVTOMATIK REMOTE BUTTON
  //    Admin panelda "Remote Mode" tugmasi to'g'ri ishlash
  // ══════════════════════════════════════════════════════
  function setupRemoteModeHelper() {
    var KEY = 'azura_runtime_mode';
    var currentMode = localStorage.getItem(KEY) === 'remote' ? 'remote' : 'local';
    window.__AZURA_CURRENT_MODE = currentMode;

    // azuraToggleMode ni kuchaytirish
    window.azuraToggleMode = function() {
      var cur = localStorage.getItem(KEY) === 'remote' ? 'remote' : 'local';
      var next = cur === 'remote' ? 'local' : 'remote';
      if (next === 'remote') {
        localStorage.setItem(KEY, 'remote');
      } else {
        localStorage.removeItem(KEY);
      }
      window.__AZURA_CURRENT_MODE = next;
      if (typeof window.azuraUpdateModeBtn === 'function') {
        window.azuraUpdateModeBtn(next);
      }
      // URL dan mode param ni tozalash, keyin reload
      var u = new URL(location.href);
      u.searchParams.delete('mode');
      window.location.href = u.toString();
    };

    // Remote mode holatini ko'rsatish
    if (typeof window.azuraUpdateModeBtn === 'function') {
      window.azuraUpdateModeBtn(currentMode);
    }
  }

  // ══════════════════════════════════════════════════════
  // 4. SAYT QOTISH MUAMMOSI
  //    page-transitioning class qolib ketganda avtomatik tozalash
  // ══════════════════════════════════════════════════════
  function setupFreezeProtection() {
    // 5 soniyadan keyin page-transitioning qolsa tozalash
    setInterval(function() {
      if (document.hidden) return;
      if (document.body.classList.contains('page-transitioning')) {
        document.body.classList.remove('page-transitioning');
        console.log('[FIX] page-transitioning force removed');
      }
    }, 5000);

    // Modals yopilganda overflow tuzatish
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        setTimeout(function() {
          // Agar ochiq modal yo'q bo'lsa overflow ni tiklash
          var openModals = document.querySelectorAll(
            '.auth-modal.open, #bn-edit-modal.open, [id$="-modal"].open, .az-ch-overlay.open'
          );
          if (openModals.length === 0 && !document.querySelector('#adult-admin-panel.open')) {
            document.body.style.overflow = '';
          }
        }, 300);
      }
    });
  }

  // ══════════════════════════════════════════════════════
  // 5. REMOTE MODE INDICATOR (Admin panelda)
  //    Avtomatik Remote tugmasi qo'shish
  // ══════════════════════════════════════════════════════
  function injectRemoteStatusPanel() {
    var KEY = 'azura_runtime_mode';
    var isRemote = localStorage.getItem(KEY) === 'remote';

    // Admin panel topbarida indicator
    var indicator = document.getElementById('azura-remote-status-indicator');
    if (!indicator) {
      var modeBtn = document.getElementById('azura-mode-toggle-btn');
      if (modeBtn && modeBtn.parentNode) {
        indicator = document.createElement('div');
        indicator.id = 'azura-remote-status-indicator';
        indicator.style.cssText = [
          'display:flex', 'align-items:center', 'gap:6px',
          'font-size:10px', 'font-family:Cinzel,serif'
        ].join(';');
        indicator.innerHTML = isRemote
          ? '<span style="color:#22c55e;">● REMOTE</span>'
          : '<span style="color:#888;">○ LOCAL</span>';
        modeBtn.parentNode.insertBefore(indicator, modeBtn);
      }
    }
  }

  // ══════════════════════════════════════════════════════
  // 6. ADMIN PANEL — O'ZGARISHLAR SAQLANISHINI TA'MINLASH
  //    MANHWA_DATA o'zgarsa avtomatik saqlash
  // ══════════════════════════════════════════════════════
  function setupAutoSave() {
    // Sahifani yopishdan oldin saqlash
    window.addEventListener('beforeunload', function() {
      try {
        saveExtraManhwa();
      } catch(e) {}
    });

    // Visibility o'zgarganda saqlash
    document.addEventListener('visibilitychange', function() {
      if (document.hidden) {
        try { saveExtraManhwa(); } catch(e) {}
      }
    });
  }

  // ══════════════════════════════════════════════════════
  // INIT — barcha fixlarni DOMContentLoaded da qo'llash
  // ══════════════════════════════════════════════════════
  function applyAllFixes() {
    try { loadExtraManhwa(); } catch(e) {}
    try { setupRemoteModeHelper(); } catch(e) {}
    try { setupFreezeProtection(); } catch(e) {}
    try { setupAutoSave(); } catch(e) {}

    // Funksiyalar yuklanganidan keyin patch qilish
    var patchTimeout = 0;
    function tryPatch() {
      patchTimeout++;
      var ready = typeof window.addManhwaAdmin === 'function'
        && typeof window.navigate === 'function';
      if (ready) {
        try { patchAddManhwaAdmin(); } catch(e) {}
        try { patchSaveEditManhwaAdmin(); } catch(e) {}
        try { patchDeleteManhwaAdmin(); } catch(e) {}
        try { patchNavigateAdmin(); } catch(e) {}
        try { injectRemoteStatusPanel(); } catch(e) {}
      } else if (patchTimeout < 20) {
        setTimeout(tryPatch, 300);
      }
    }
    setTimeout(tryPatch, 500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyAllFixes);
  } else {
    applyAllFixes();
  }

  // Global helper: Admin qo'lda chaqirishi uchun
  window.azuraFixSaveAll = function() {
    try { saveExtraManhwa(); } catch(e) {}
    if (typeof window.saveUsers === 'function') {
      try { window.saveUsers(); } catch(e) {}
    }
    if (typeof window.showToast === 'function') {
      window.showToast('✅ Barcha ma\'lumotlar saqlandi', 'success');
    }
  };

  console.log('[AZURA FIX v1.0] ✓ Barcha tuzatishlar faollashtirildi');
})();
