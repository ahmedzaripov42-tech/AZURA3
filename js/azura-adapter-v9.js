/* AZURA Adapter v9 — switchable local/remote data boundary.
   Goal:
   - UI keeps working locally today
   - later D1/R2 migration replaces only the data mode/config
   - compatibility surface kept for legacy UI code (AZURA_STORE / AZURA_API)
*/
(function(){
  'use strict';

  const OWNER_UID = 'AZR-YJTF-QYGT';
  const now = () => Date.now();
  const rand = () => Math.random().toString(36).slice(2, 8);
  const escKey = v => String(v || '').replace(/[^a-zA-Z0-9:_-]/g, '_');
  const CONFIG = window.AZURA_CONFIG = Object.assign({
    version: '9.1.0',
    dataMode: (window.__AZURA_RUNTIME_MODE === 'remote' ? 'remote' : 'local'),
    apiBase: '/api',
    mediaBase: '/assets', // R2 deploy: set to e.g. 'https://media.azura.app' or '/media'
    storagePrefix: 'azura_',
    adapter: 'v9',
    d1Ready: true,
    r2Ready: true,
    fallbackToLocalOnError: true,  // remote requests fall back to local on network failure
    requestTimeoutMs: 9000
  }, window.AZURA_CONFIG || {});

  const read = (key, fallback) => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch(_) { return fallback; } };
  const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); return value; } catch(_) { return value; } };
  const uidEq = (a,b) => String(a||'').trim().toUpperCase() === String(b||'').trim().toUpperCase();
  const apiUrl = path => String(CONFIG.apiBase || '/api').replace(/\/$/, '') + path;
  async function fetchJson(path, options){
    const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), CONFIG.requestTimeoutMs || 9000) : null;
    try {
      const res = await fetch(apiUrl(path), Object.assign(
        { headers: { 'content-type':'application/json' }, credentials: 'include', signal: controller && controller.signal },
        options || {}
      ));
      if (!res.ok) throw new Error('API ' + res.status + ' ' + path);
      return await res.json();
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function normalizeUser(u){
    u = u || {};
    return {
      uid: String(u.uid || ''),
      username: String(u.username || u.name || 'AZURA User'),
      email: String(u.email || ''),
      role: String(u.uid || '').toUpperCase() === OWNER_UID ? 'owner' : String(u.role || 'user'),
      coins: Math.max(0, Number(u.coins || 0)),
      vip: !!u.vip,
      provider: String(u.provider || 'local'),
      avatar: String(u.avatar || ''),
      library: Array.isArray(u.library) ? u.library.slice() : [],
      read: Number(u.read || 0),
      extra: Object.assign({ deletedAt:0, deletedReason:'', bio:'', theme:'auto', telegram:'' }, u.extra || {}),
      createdAt: Number(u.createdAt || now()),
      updatedAt: Number(u.updatedAt || now())
    };
  }

  function normalizeLibraryItem(uid, raw){
    if (!raw) return null;
    const manhwaId = typeof raw === 'string' ? raw : String(raw.manhwaId || raw.id || '');
    if (!manhwaId) return null;
    const progress = Math.max(0, Number((raw && (raw.progress ?? raw.percent)) || 0));
    const lastChapterId = raw && (raw.lastChapterId || raw.chapterId || '');
    return {
      uid,
      manhwaId,
      state: raw.state || (progress >= 96 ? 'completed' : (progress > 0 || lastChapterId ? 'reading' : 'saved')),
      favorite: !!raw.favorite,
      progress,
      lastChapterId,
      lastReadAt: Number(raw.lastReadAt || raw.lastRead || 0),
      updatedAt: Number(raw.updatedAt || raw.lastRead || now())
    };
  }

  function normalizeProgress(uid, raw){
    raw = raw || {};
    return {
      uid: String(uid || raw.uid || ''),
      manhwaId: String(raw.manhwaId || ''),
      chapterId: String(raw.chapterId || ''),
      percent: Math.max(0, Math.min(100, Number(raw.percent || 0))),
      lastRead: Number(raw.lastRead || raw.updatedAt || now())
    };
  }

  function normalizeChapter(ch){
    ch = ch || {};
    const access = String(ch.access || ch.accessType || 'free');
    return {
      id: String(ch.id || ('ch_' + now() + '_' + rand())),
      manhwaId: String(ch.manhwaId || ''),
      chapterNo: Number(ch.chapterNo ?? ch.number ?? 1),
      number: Number(ch.number ?? ch.chapterNo ?? 1),
      title: String(ch.title || ''),
      contentType: String(ch.contentType || 'manhwa'),
      access,
      accessType: access,
      price: Number(ch.price ?? ch.coinPrice ?? 0),
      coinPrice: Number(ch.coinPrice ?? ch.price ?? 0),
      vip: !!(ch.vip || ch.vipOnly || access === 'vip'),
      vipOnly: !!(ch.vip || ch.vipOnly || access === 'vip'),
      status: String(ch.status || 'published'),
      format: String(ch.format || 'webp'),
      pageCount: Number(ch.pageCount || 0),
      pageIds: Array.isArray(ch.pageIds) ? ch.pageIds.slice() : [],
      pages: Array.isArray(ch.pages) ? ch.pages.slice() : [],
      pdfId: ch.pdfId || null,
      extra: Object.assign({}, ch.extra || {}),
      createdAt: Number(ch.createdAt || now()),
      updatedAt: Number(ch.updatedAt || now())
    };
  }

  function normalizeMediaAsset(raw){
    raw = raw || {};
    return {
      id: String(raw.id || ('media_' + now() + '_' + rand())),
      kind: String(raw.kind || raw.type || 'image'),
      folder: String(raw.folder || ''),
      filename: String(raw.filename || raw.name || ''),
      mimeType: String(raw.mimeType || raw.mime || ''),
      size: Number(raw.size || 0),
      dataUrl: String(raw.dataUrl || raw.url || ''),
      poster: String(raw.poster || ''),
      createdAt: Number(raw.createdAt || now()),
      updatedAt: Number(raw.updatedAt || now())
    };
  }

  function usersLocal(){ return (read('azura_users', []) || []).map(normalizeUser).filter(u => u.uid); }
  function saveUsersLocal(rows){ rows = (rows || []).map(normalizeUser).filter(u => u.uid); write('azura_users', rows); try { window.USERS = rows; USERS = rows; } catch(_){} return rows; }
  function currentUserLocal(){
    const u = read('azura_current_user', null) || read('azura_current', null) || window.currentUser || null;
    return u ? normalizeUser(u) : null;
  }
  function setCurrentUserLocal(user){
    if (!user || !user.uid) { try { localStorage.removeItem('azura_current'); localStorage.removeItem('azura_current_user'); } catch(_){} window.currentUser = null; return null; }
    const u = normalizeUser(user);
    write('azura_current', u); write('azura_current_user', u);
    try { window.currentUser = u; currentUser = u; } catch(_){}
    return u;
  }

  function libraryKey(uid){ return 'azura_feature_library_' + escKey(uid); }
  function progressKey(uid){ return 'azura_reading_progress_' + escKey(uid); }

  function listLibraryLocal(uid){
    uid = String(uid || '').trim();
    if (!uid) return [];
    const map = new Map();
    const push = rows => (Array.isArray(rows) ? rows : [rows]).forEach(raw => {
      const item = normalizeLibraryItem(uid, raw);
      if (!item) return;
      const prev = map.get(item.manhwaId);
      map.set(item.manhwaId, prev ? Object.assign({}, prev, item, {
        favorite: prev.favorite || item.favorite,
        progress: Math.max(prev.progress || 0, item.progress || 0),
        lastReadAt: Math.max(prev.lastReadAt || 0, item.lastReadAt || 0),
        updatedAt: Math.max(prev.updatedAt || 0, item.updatedAt || 0),
        state: (prev.state === 'completed' || item.state === 'completed') ? 'completed' : ((prev.state === 'reading' || item.state === 'reading') ? 'reading' : 'saved')
      }) : item);
    });
    const cur = currentUserLocal();
    if (cur && uidEq(cur.uid, uid)) push((cur.library || []).map(id => ({ manhwaId:id, state:'saved' })));
    push(read('azura_library_' + uid, []));
    push(read(libraryKey(uid), []));
    push((read('azura_library', []) || []).filter(x => uidEq(x.uid, uid)));
    const progress = read(progressKey(uid), {});
    Object.values(progress || {}).forEach(p => push({ manhwaId:p.manhwaId, state:Number(p.percent||0)>=96?'completed':'reading', progress:Number(p.percent||0), lastChapterId:p.chapterId||'', lastReadAt:Number(p.lastRead||0), updatedAt:Number(p.lastRead||0) }));
    return Array.from(map.values()).sort((a,b)=>(b.lastReadAt||b.updatedAt||0)-(a.lastReadAt||a.updatedAt||0));
  }
  function saveLibraryLocal(uid, rows){
    uid = String(uid || '').trim();
    const clean = (rows || []).map(x => normalizeLibraryItem(uid, x)).filter(Boolean);
    write('azura_library_' + uid, clean);
    write(libraryKey(uid), clean);
    const global = (read('azura_library', []) || []).filter(x => !uidEq(x.uid, uid)).concat(clean);
    write('azura_library', global);
    return clean;
  }
  function upsertLibraryLocal(uid, item){
    const rows = listLibraryLocal(uid);
    const next = normalizeLibraryItem(uid, item);
    if (!next) return rows;
    const idx = rows.findIndex(x => x.manhwaId === next.manhwaId);
    if (idx >= 0) rows[idx] = Object.assign({}, rows[idx], next, { updatedAt:now() }); else rows.unshift(Object.assign({}, next, { updatedAt:now() }));
    return saveLibraryLocal(uid, rows);
  }
  function libraryStatsLocal(uid){
    const rows = listLibraryLocal(uid);
    return {
      total: rows.length,
      saved: rows.filter(x => x.state === 'saved').length,
      reading: rows.filter(x => x.state === 'reading').length,
      completed: rows.filter(x => x.state === 'completed' || Number(x.progress||0) >= 96).length,
      favorites: rows.filter(x => x.favorite).length
    };
  }

  function listProgressLocal(uid){
    uid = String(uid || '').trim();
    const raw = read(progressKey(uid), {});
    return Object.values(raw || {}).map(x => normalizeProgress(uid, x)).filter(x => x.manhwaId || x.chapterId);
  }
  function saveProgressLocal(uid, entry){
    uid = String(uid || '').trim();
    const clean = normalizeProgress(uid, entry);
    if (!uid || !clean.chapterId) return clean;
    const raw = read(progressKey(uid), {});
    raw[clean.chapterId] = clean;
    write(progressKey(uid), raw);
    if (clean.manhwaId) upsertLibraryLocal(uid, {
      manhwaId: clean.manhwaId,
      progress: clean.percent,
      lastChapterId: clean.chapterId,
      lastReadAt: clean.lastRead,
      state: clean.percent >= 96 ? 'completed' : 'reading'
    });
    return clean;
  }

  function chaptersLocal(){ return (read('azura_chapters_pending', []) || []).map(normalizeChapter); }
  function saveChaptersLocal(rows){ const clean = (rows || []).map(normalizeChapter); write('azura_chapters_pending', clean); window.AZURA_D1_CHAPTERS = clean; return clean; }
  function upsertChapterLocal(ch){ const rows = chaptersLocal(); const n = normalizeChapter(ch); const idx = rows.findIndex(x => x.id === n.id); if (idx >= 0) rows[idx] = Object.assign({}, rows[idx], n, { updatedAt:now() }); else rows.unshift(n); return saveChaptersLocal(rows); }
  function deleteChapterLocal(id){ return saveChaptersLocal(chaptersLocal().filter(x => String(x.id) !== String(id))); }

  function mediaLocal(){ return (read('azura_media_assets_local', []) || []).map(normalizeMediaAsset); }
  function saveMediaLocal(rows){ const clean = (rows || []).map(normalizeMediaAsset); write('azura_media_assets_local', clean); return clean; }
  function putMediaLocal(asset){ const rows = mediaLocal(); const clean = normalizeMediaAsset(asset); const idx = rows.findIndex(x => x.id === clean.id); if (idx >= 0) rows[idx] = Object.assign({}, rows[idx], clean, { updatedAt:now() }); else rows.unshift(clean); saveMediaLocal(rows); return Object.assign({}, clean, { url: clean.dataUrl || clean.id, key: clean.id }); }

  function catalogLocal(){ return (Array.isArray(window.MANHWA_DATA) ? window.MANHWA_DATA : (Array.isArray(window.AZURA_CATALOG) ? window.AZURA_CATALOG : [])).slice(); }
  function findManhwaLocal(id){ return catalogLocal().find(x => String(x.id) === String(id)) || null; }

  const localAdapter = {
    id: 'local',
    users: {
      list: async () => usersLocal(),
      current: async () => currentUserLocal(),
      setCurrent: async user => setCurrentUserLocal(user),
      upsert: async user => {
        const rows = usersLocal();
        const clean = normalizeUser(user);
        const idx = rows.findIndex(x => uidEq(x.uid, clean.uid));
        if (idx >= 0) rows[idx] = Object.assign({}, rows[idx], clean, { updatedAt: now() }); else rows.push(clean);
        saveUsersLocal(rows);
        if (currentUserLocal() && uidEq(currentUserLocal().uid, clean.uid)) setCurrentUserLocal(rows.find(x => uidEq(x.uid, clean.uid)));
        return clean;
      },
      setCoins: async (uid, coins) => {
        const rows = usersLocal();
        const idx = rows.findIndex(x => uidEq(x.uid, uid));
        if (idx < 0) throw new Error('User topilmadi');
        rows[idx].coins = Math.max(0, Number(coins || 0)); rows[idx].updatedAt = now(); saveUsersLocal(rows); if (currentUserLocal() && uidEq(currentUserLocal().uid, uid)) setCurrentUserLocal(rows[idx]); return rows[idx];
      },
      setVip: async (uid, vip) => {
        const rows = usersLocal();
        const idx = rows.findIndex(x => uidEq(x.uid, uid));
        if (idx < 0) throw new Error('User topilmadi');
        rows[idx].vip = !!vip; rows[idx].updatedAt = now(); saveUsersLocal(rows); if (currentUserLocal() && uidEq(currentUserLocal().uid, uid)) setCurrentUserLocal(rows[idx]); return rows[idx];
      },
      setRole: async (uid, role) => {
        const rows = usersLocal();
        const idx = rows.findIndex(x => uidEq(x.uid, uid));
        if (idx < 0) throw new Error('User topilmadi');
        if (uidEq(rows[idx].uid, OWNER_UID)) return rows[idx];
        rows[idx].role = String(role || 'user'); rows[idx].updatedAt = now(); saveUsersLocal(rows); if (currentUserLocal() && uidEq(currentUserLocal().uid, uid)) setCurrentUserLocal(rows[idx]); return rows[idx];
      },
      block: async (uid, reason) => {
        const rows = usersLocal(); const idx = rows.findIndex(x => uidEq(x.uid, uid));
        if (idx < 0) throw new Error('User topilmadi');
        if (uidEq(rows[idx].uid, OWNER_UID)) return rows[idx];
        rows[idx].extra = Object.assign({}, rows[idx].extra || {}, { deletedAt: now(), deletedReason: String(reason || 'Blocked by admin') }); rows[idx].updatedAt = now(); saveUsersLocal(rows); return rows[idx];
      },
      restore: async uid => {
        const rows = usersLocal(); const idx = rows.findIndex(x => uidEq(x.uid, uid));
        if (idx < 0) throw new Error('User topilmadi');
        rows[idx].extra = Object.assign({}, rows[idx].extra || {}, { deletedAt: 0, deletedReason: '' }); rows[idx].updatedAt = now(); saveUsersLocal(rows); return rows[idx];
      }
    },
    library: {
      list: async uid => listLibraryLocal(uid),
      upsert: async (uid, item) => upsertLibraryLocal(uid, item),
      stats: async uid => libraryStatsLocal(uid)
    },
    progress: {
      list: async uid => listProgressLocal(uid),
      save: async (uid, entry) => saveProgressLocal(uid, entry)
    },
    chapters: {
      list: async () => chaptersLocal(),
      byManhwa: async manhwaId => chaptersLocal().filter(x => String(x.manhwaId) === String(manhwaId)).sort((a,b) => Number(a.number || a.chapterNo || 0) - Number(b.number || b.chapterNo || 0)),
      saveBatch: async rows => saveChaptersLocal((rows || []).map(normalizeChapter)),
      upsert: async row => upsertChapterLocal(row),
      delete: async id => deleteChapterLocal(id)
    },
    media: {
      list: async () => mediaLocal(),
      put: async asset => putMediaLocal(asset)
    },
    catalog: {
      list: async () => catalogLocal(),
      find: async id => findManhwaLocal(id)
    }
  };

  const remoteAdapter = {
    id: 'remote',
    users: {
      list: async () => (await fetchJson('/users')).users || [],
      current: async () => (await fetchJson('/auth')).user || null,
      setCurrent: async user => user,
      upsert: async user => (await fetchJson('/users', { method:'POST', body: JSON.stringify(user) })).user,
      setCoins: async (uid, coins) => (await fetchJson('/users', { method:'PATCH', body: JSON.stringify({ uid, action:'coins', coins }) })).user,
      setVip: async (uid, vip) => (await fetchJson('/users', { method:'PATCH', body: JSON.stringify({ uid, action:'vip', vip }) })).user,
      setRole: async (uid, role) => (await fetchJson('/users', { method:'PATCH', body: JSON.stringify({ uid, action:'role', role }) })).user,
      block: async (uid, reason) => (await fetchJson('/users', { method:'PATCH', body: JSON.stringify({ uid, action:'softDelete', reason }) })).user,
      restore: async uid => (await fetchJson('/users', { method:'PATCH', body: JSON.stringify({ uid, action:'restore' }) })).user
    },
    library: {
      list: async uid => (await fetchJson('/library?uid=' + encodeURIComponent(uid))).items || [],
      upsert: async (uid, item) => (await fetchJson('/library', { method:'POST', body: JSON.stringify({ uid, item }) })).items || [],
      stats: async uid => (await fetchJson('/library/stats?uid=' + encodeURIComponent(uid))).stats || { total:0, saved:0, reading:0, completed:0, favorites:0 }
    },
    progress: {
      list: async uid => (await fetchJson('/progress?uid=' + encodeURIComponent(uid))).items || [],
      save: async (uid, entry) => (await fetchJson('/progress', { method:'POST', body: JSON.stringify({ uid, entry }) })).item || entry
    },
    chapters: {
      list: async () => (await fetchJson('/chapters')).items || [],
      byManhwa: async manhwaId => (await fetchJson('/chapters?manhwaId=' + encodeURIComponent(manhwaId))).items || [],
      saveBatch: async rows => (await fetchJson('/chapters', { method:'POST', body: JSON.stringify({ rows }) })).items || rows,
      upsert: async row => (await fetchJson('/chapters/patch', { method:'POST', body: JSON.stringify(row) })).item || row,
      delete: async id => (await fetchJson('/chapters/delete', { method:'POST', body: JSON.stringify({ id }) })).ok
    },
    media: {
      list: async () => (await fetchJson('/media')).items || [],
      put: async asset => (await fetchJson('/media', { method:'POST', body: JSON.stringify(asset) }))
    },
    catalog: {
      list: async () => (await fetchJson('/catalog')).items || [],
      find: async id => (await fetchJson('/catalog/' + encodeURIComponent(id))).item || null
    }
  };

  // ---- Choose adapter; in remote mode wrap each call so a network failure
  //      transparently falls back to local instead of breaking the UI. ------
  function withFallback(remote, local) {
    if (CONFIG.dataMode !== 'remote' || !CONFIG.fallbackToLocalOnError) return remote;
    function wrapMethod(remoteFn, localFn) {
      if (typeof remoteFn !== 'function') return remoteFn;
      return async function() {
        try { return await remoteFn.apply(this, arguments); }
        catch (e) {
          console.warn('[AZURA adapter] remote failed, falling back to local:', e && e.message);
          if (typeof localFn === 'function') return await localFn.apply(this, arguments);
          throw e;
        }
      };
    }
    const out = {};
    Object.keys(remote).forEach(scope => {
      const r = remote[scope], l = (local && local[scope]) || {};
      if (r && typeof r === 'object') {
        out[scope] = {};
        Object.keys(r).forEach(m => { out[scope][m] = wrapMethod(r[m], l[m]); });
      } else out[scope] = r;
    });
    return out;
  }
  const data = CONFIG.dataMode === 'remote' ? withFallback(remoteAdapter, localAdapter) : localAdapter;

  window.AZURA_DATA = {
    version: CONFIG.version,
    mode: CONFIG.dataMode,
    config: CONFIG,
    users: data.users,
    library: data.library,
    progress: data.progress,
    chapters: data.chapters,
    media: data.media,
    catalog: data.catalog,
    remoteTemplate: remoteAdapter,
    localTemplate: localAdapter
  };

  // Legacy compatibility for current UI code
  window.AZURA_STORE = {
    version: CONFIG.version,
    mode: CONFIG.dataMode,
    d1Ready: true,
    r2Ready: true,
    normalizeUser,
    normalizeLibraryItem,
    normalizeChapter,
    users: usersLocal,
    saveUsers: saveUsersLocal,
    currentUser: currentUserLocal,
    setCurrentUser: setCurrentUserLocal,
    listLibrary: listLibraryLocal,
    saveLibrary: saveLibraryLocal,
    upsertLibrary: upsertLibraryLocal,
    chapters: chaptersLocal,
    saveChapters: saveChaptersLocal,
    upsertChapter: upsertChapterLocal,
    catalog: catalogLocal,
    findManhwa: findManhwaLocal
  };

  window.AZURA_API = Object.assign({}, window.AZURA_API || {}, {
    media: async function(payload){
      if (CONFIG.dataMode === 'remote') return await data.media.put(payload || {});
      const clean = normalizeMediaAsset({
        kind: payload && (payload.type || payload.kind) || ((payload && payload.file && String(payload.file.type || '').startsWith('video/')) ? 'video' : 'image'),
        folder: payload && payload.folder || '',
        filename: payload && payload.filename || (payload && payload.file && payload.file.name) || '',
        mimeType: payload && payload.mimeType || (payload && payload.file && payload.file.type) || '',
        size: payload && payload.size || (payload && payload.file && payload.file.size) || 0,
        dataUrl: payload && (payload.dataUrl || payload.url || payload.src) || '',
        poster: payload && payload.poster || ''
      });
      return putMediaLocal(clean);
    },
    saveChapters: async function(rows){ return await data.chapters.saveBatch(rows || []); },
    patchChapter: async function(row){ return await data.chapters.upsert(row || {}); },
    deleteChapter: async function(id){ return await data.chapters.delete(id); }
  });

  window.AZURA_MIGRATION_TARGET = {
    d1Tables: ['users','sessions','manhwa','chapters','chapter_pages','library','reading_progress','ratings','likes','comments','notifications','audit_log','coin_ledger','media_assets'],
    r2Buckets: ['azura-media'],
    replaceOnly: ['js/azura-adapter-v9.js'],
    keepUiFiles: true,
    modeSwitch: 'window.AZURA_CONFIG.dataMode = "remote"',
    envSwitch: 'append ?mode=remote to URL or set window.__AZURA_FORCE_REMOTE=true before adapter loads'
  };

  // Notify perf layer + diagnostic loader that the adapter is up
  try {
    window.dispatchEvent(new CustomEvent('azura:adapter-ready', { detail: { mode: CONFIG.dataMode, version: CONFIG.version } }));
  } catch(_){}
})();
