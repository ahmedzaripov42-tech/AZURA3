(function(){
  'use strict';

  window.__AZURA_LOCAL_ONLY = true;

  var API = window.AZURA_API || {};
  var OWNER_UID = 'AZR-YJTF-QYGT';
  var SESSION_TOKEN_KEY = 'azura_session_token';
  var USER_CACHE_KEY = 'azura_users';
  var CURRENT_KEYS = ['azura_current', 'azura_current_user'];
  var MEDIA_META_KEY = 'azura_media_assets_local';
  var CHAPTERS_KEY = 'azura_chapters_pending';
  var VIEWS_KEY = 'azura_views_global_fallback';
  var RATINGS_KEY = 'azura_feature_ratings';
  var LIKES_KEY = 'azura_feature_likes';
  var COMMENTS_KEY = 'azura_feature_comments';
  var REPORTS_KEY = 'azura_feature_reports';
  var AUDIT_KEY = 'azura_feature_audit';
  var NOTIF_KEY = 'azura_feature_notifications';
  var COIN_HISTORY_KEY = 'azura_feature_coin_history';

  function now(){ return Date.now(); }
  function rand(){ return Math.random().toString(36).slice(2, 8); }
  function escKey(v){ return String(v || '').replace(/[^a-zA-Z0-9:_-]/g, '_'); }
  function parseJSON(v, fallback){ try { return JSON.parse(v); } catch(_) { return fallback; } }
  function getLS(key, fallback){ try { var raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch(_) { return fallback; } }
  function setLS(key, value){ try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (_) { return false; } }
  function removeLS(key){ try { localStorage.removeItem(key); } catch(_) {} }
  function clone(v){ return JSON.parse(JSON.stringify(v)); }
  function roleOf(user){ if (!user) return 'guest'; if (String(user.uid||'').toUpperCase() === OWNER_UID) return 'owner'; if (user.extra && Number(user.extra.deletedAt || 0) > 0) return 'blocked'; return user.role || 'user'; }
  function isStaff(user){ var role = roleOf(user); return role === 'owner' || role === 'admin'; }
  function getCurrentUser(){ return window.currentUser || getLS(CURRENT_KEYS[0], null) || getLS(CURRENT_KEYS[1], null); }
  function syncCurrent(user){
    window.currentUser = user || null;
    try { currentUser = user || null; } catch(_) {}
    CURRENT_KEYS.forEach(function(key){ if (user) setLS(key, user); else removeLS(key); });
  }
  function setSessionToken(token){ if (token) localStorage.setItem(SESSION_TOKEN_KEY, token); else removeLS(SESSION_TOKEN_KEY); }
  function getSessionToken(){ return String(localStorage.getItem(SESSION_TOKEN_KEY) || ''); }
  function publicUser(user){ if (!user) return null; var u = clone(user); delete u.password; return u; }
  function getUsers(){ return getLS(USER_CACHE_KEY, []); }
  function saveUsers(users){
    users = (users || []).map(function(u){
      return Object.assign({ uid:'', username:'AZURA User', email:'', role:'user', coins:0, vip:false, provider:'local', extra:{ deletedAt:0, deletedReason:'', theme:'auto', bio:'', telegram:'' }, createdAt:now(), updatedAt:now() }, u || {}, { extra:Object.assign({ deletedAt:0, deletedReason:'', theme:'auto', bio:'', telegram:'' }, (u && u.extra) || {}) });
    }).filter(function(u){ return u.uid; });
    setLS(USER_CACHE_KEY, users);
    window.USERS = users;
    try { USERS = users; } catch(_) {}
    var admins = users.filter(function(u){ return ['owner','admin'].indexOf(roleOf(u)) >= 0; }).map(function(u){ return u.uid; });
    if (admins.indexOf(OWNER_UID) < 0) admins.push(OWNER_UID);
    setLS('azura_admins', admins);
    window.ADMIN_IDS = admins;
    try { ADMIN_IDS = admins; } catch(_) {}
    return users;
  }
  function ensureOwner(){
    var users = getUsers();
    var idx = users.findIndex(function(u){ return String(u.uid||'').toUpperCase() === OWNER_UID; });
    if (idx < 0) {
      users.unshift({ uid:OWNER_UID, username:'AZURA_OWNER', email:'owner@azura.local', password:'azura2025owner', role:'owner', coins:99999, vip:true, provider:'local', extra:{ bio:'', theme:'auto', telegram:'' }, createdAt:now(), updatedAt:now() });
      saveUsers(users);
    }
    return getUsers();
  }
  function findUser(login){
    var lookup = String(login || '').trim().toLowerCase();
    return getUsers().find(function(u){
      return String(u.uid||'').toLowerCase() === lookup || String(u.email||'').toLowerCase() === lookup || String(u.username||'').toLowerCase() === lookup;
    }) || null;
  }
  function libraryKey(uid){ return 'azura_feature_library_' + escKey(uid); }
  function notifList(){ return getLS(NOTIF_KEY, []); }
  function saveNotifList(v){ setLS(NOTIF_KEY, v || []); return v || []; }
  function userNotifications(uid){ return notifList().filter(function(n){ return n.uid === uid; }).sort(function(a,b){ return (b.createdAt||0) - (a.createdAt||0); }); }
  function library(uid){ return getLS(libraryKey(uid), []); }
  function saveLibrary(uid, items){ setLS(libraryKey(uid), items || []); return items || []; }
  function ratings(){ return getLS(RATINGS_KEY, {}); }
  function saveRatings(v){ setLS(RATINGS_KEY, v || {}); return v || {}; }
  function likes(){ return getLS(LIKES_KEY, {}); }
  function saveLikes(v){ setLS(LIKES_KEY, v || {}); return v || {}; }
  function comments(){ return getLS(COMMENTS_KEY, []); }
  function saveComments(v){ setLS(COMMENTS_KEY, v || []); return v || []; }
  function reports(){ return getLS(REPORTS_KEY, []); }
  function saveReports(v){ setLS(REPORTS_KEY, v || []); return v || []; }
  function auditLog(){ return getLS(AUDIT_KEY, []); }
  function saveAudit(v){ setLS(AUDIT_KEY, v || []); return v || []; }
  function coinHistory(){ return getLS(COIN_HISTORY_KEY, {}); }
  function saveCoinHistory(v){ setLS(COIN_HISTORY_KEY, v || {}); return v || {}; }
  function mediaMeta(){ return getLS(MEDIA_META_KEY, []); }
  function saveMediaMeta(v){ setLS(MEDIA_META_KEY, v || []); return v || []; }
  function chapters(){ return getLS(CHAPTERS_KEY, []); }
  function saveChaptersLocal(v){ setLS(CHAPTERS_KEY, v || []); window.AZURA_D1_CHAPTERS = v || []; return v || []; }
  function views(){ return getLS(VIEWS_KEY, {}); }
  function saveViews(v){ setLS(VIEWS_KEY, v || {}); return v || {}; }

  function addAudit(actorUid, action, targetType, targetId, meta){
    var rows = auditLog();
    rows.unshift({ id:'audit_' + now() + '_' + rand(), actorUid:actorUid || '', action:action || '', targetType:targetType || '', targetId:targetId || '', meta:meta || {}, createdAt:now() });
    saveAudit(rows.slice(0, 200));
  }
  function addNotification(uid, title, body, type, link, extra){
    var rows = notifList();
    rows.unshift({ id:'notif_' + now() + '_' + rand(), uid:uid, title:title || '', body:body || '', type:type || 'info', link:link || '', read:false, extra:extra || {}, createdAt:now() });
    saveNotifList(rows.slice(0, 300));
  }
  function ensureSessionList(uid){
    var token = getSessionToken();
    if (!token) return [];
    return [{ token:token, label:'Local browser', userAgent:navigator.userAgent || 'Browser', createdAt:now(), updatedAt:now(), expiresAt:0, current:true, tokenTail:String(token).slice(-8) }];
  }
  function discoveryBundle(){
    var v = views();
    var r = ratings();
    var l = likes();
    var c = comments().filter(function(x){ return x.status !== 'deleted' && x.status !== 'hidden'; });
    var viewArr = Object.keys(v).map(function(id){ return { id:id, count:Number(v[id] || 0), updatedAt:now() }; }).sort(function(a,b){ return b.count - a.count; }).slice(0,40);
    var ratingArr = Object.keys(r).map(function(id){
      var values = Object.values(r[id] || {}).map(Number).filter(Boolean);
      var sum = values.reduce(function(a,b){ return a+b; }, 0);
      return { manhwaId:id, avgRating: values.length ? (sum / values.length) : 0, ratingCount: values.length };
    }).sort(function(a,b){ return (b.ratingCount - a.ratingCount) || (b.avgRating - a.avgRating); }).slice(0,40);
    var likeArr = Object.keys(l).map(function(id){ return { manhwaId:id, likeCount: (l[id] || []).length }; }).sort(function(a,b){ return b.likeCount - a.likeCount; }).slice(0,40);
    var commentCount = {};
    c.forEach(function(row){ commentCount[row.manhwaId] = (commentCount[row.manhwaId] || 0) + 1; });
    var commentArr = Object.keys(commentCount).map(function(id){ return { manhwaId:id, commentCount:commentCount[id] }; }).sort(function(a,b){ return b.commentCount - a.commentCount; }).slice(0,40);
    return { views:viewArr, ratings:ratingArr, likes:likeArr, comments:commentArr };
  }
  function manhwaBundle(manhwaId, uid){
    var ratingMap = ratings()[manhwaId] || {};
    var ratingVals = Object.values(ratingMap).map(Number).filter(Boolean);
    var likeList = likes()[manhwaId] || [];
    var commentRows = comments().filter(function(c){ return c.manhwaId === manhwaId && c.status === 'published'; }).sort(function(a,b){ return (b.createdAt||0) - (a.createdAt||0); }).slice(0, 80);
    var users = getUsers();
    var hydratedComments = commentRows.map(function(c){
      var u = users.find(function(x){ return x.uid === c.uid; }) || {};
      return Object.assign({}, c, { username:u.username || 'User', avatar:u.avatar || '' });
    });
    var avg = ratingVals.length ? (ratingVals.reduce(function(a,b){ return a+b; }, 0) / ratingVals.length) : 0;
    return {
      summary: {
        avgRating: avg,
        ratingCount: ratingVals.length,
        likeCount: likeList.length,
        commentCount: hydratedComments.length,
        myRating: Number(ratingMap[uid] || 0),
        liked: likeList.indexOf(uid) >= 0
      },
      comments: hydratedComments
    };
  }
  function adminBundle(){
    var reportRows = reports().slice().sort(function(a,b){ return (b.createdAt||0) - (a.createdAt||0); }).slice(0, 120);
    var auditRows = auditLog().slice().sort(function(a,b){ return (b.createdAt||0) - (a.createdAt||0); }).slice(0, 160);
    var mediaRows = mediaMeta().slice().sort(function(a,b){ return (b.createdAt||0) - (a.createdAt||0); }).slice(0, 120);
    var commentRows = comments().slice().sort(function(a,b){ return (b.createdAt||0) - (a.createdAt||0); }).slice(0, 120).map(function(c){
      var u = getUsers().find(function(x){ return x.uid === c.uid; }) || {};
      return Object.assign({}, c, { username:u.username || 'User' });
    });
    var userStatsMap = {};
    getUsers().forEach(function(u){ var role = roleOf(u); userStatsMap[role] = (userStatsMap[role] || 0) + 1; });
    var userStats = Object.keys(userStatsMap).map(function(role){ return { role:role, count:userStatsMap[role] }; });
    var topContent = Object.keys(views()).map(function(id){ return { id:id, count:Number(views()[id] || 0), updatedAt:now() }; }).sort(function(a,b){ return b.count-a.count; }).slice(0,20);
    return { reports:reportRows, audit:auditRows, media:mediaRows, comments:commentRows, userStats:userStats, topContent:topContent };
  }
  function sanitizeChapter(ch){
    var extra = Object.assign({}, ch.extra || {});
    if (Array.isArray(ch.pageIds)) extra.pageIds = ch.pageIds.slice(0, 400);
    if (ch.pageCount != null) extra.pageCount = Number(ch.pageCount || 0);
    if (ch.pdfId) extra.pdfId = ch.pdfId;
    if (ch.format) extra.format = ch.format;
    return {
      id: String(ch.id || ('ch_' + now() + '_' + rand())),
      manhwaId: String(ch.manhwaId || ''),
      title: String(ch.title || ''),
      chapterNo: Number(ch.chapterNo != null ? ch.chapterNo : (ch.number || 0)),
      number: Number(ch.number != null ? ch.number : (ch.chapterNo || 0)),
      accessType: String(ch.accessType || ch.access || 'free'),
      access: String(ch.access || ch.accessType || 'free'),
      price: Number(ch.price != null ? ch.price : (ch.coinPrice || 0)),
      coinPrice: Number(ch.coinPrice != null ? ch.coinPrice : (ch.price || 0)),
      vip: !!(ch.vip || ch.vipOnly || (ch.accessType || ch.access) === 'vip'),
      vipOnly: !!(ch.vip || ch.vipOnly || (ch.accessType || ch.access) === 'vip'),
      status: String(ch.status || 'published'),
      createdAt: Number(ch.createdAt || now()),
      updatedAt: Number(ch.updatedAt || now()),
      pageCount: Number(ch.pageCount || extra.pageCount || 0),
      pageIds: Array.isArray(ch.pageIds) ? ch.pageIds.slice(0, 400) : (Array.isArray(extra.pageIds) ? extra.pageIds.slice(0, 400) : []),
      pdfId: ch.pdfId || extra.pdfId || null,
      pages: [],
      extra: extra
    };
  }
  function readAsDataUrl(file){
    return new Promise(function(resolve, reject){
      var fr = new FileReader();
      fr.onload = function(){ resolve(String(fr.result || '')); };
      fr.onerror = function(){ reject(fr.error || new Error('Fayl o‘qilmadi')); };
      fr.readAsDataURL(file);
    });
  }

  function apiHandle(url, options){
    ensureOwner();
    options = options || {};
    var method = String(options.method || 'GET').toUpperCase();
    var me = getCurrentUser();
    var parsedUrl = new URL(url, location.origin);

    if (/^\/api\/(init|health)$/.test(parsedUrl.pathname)) {
      return Promise.resolve({ ok:true, local:true, mode:'local-only', users:getUsers().length, time:now() });
    }

    if (parsedUrl.pathname === '/api/auth') {
      if (method === 'GET') {
        return Promise.resolve(me && !(me.extra && Number(me.extra.deletedAt || 0) > 0) ? { ok:true, local:true, user:publicUser(me), expiresAt:now() + 86400000 } : { ok:false, local:true, error:'Sessiya topilmadi' });
      }
      var body = parseJSON(options.body || '{}', {});
      if (body.action === 'logout') {
        setSessionToken('');
        syncCurrent(null);
        return Promise.resolve({ ok:true, local:true });
      }
      if (body.action === 'login') {
        var login = body.login || body.uid || body.email || body.username || '';
        var password = String(body.password || '');
        var ownerHit = /^(AZR-YJTF-QYGT|owner@azura\.local|AZURA_OWNER)$/i.test(String(login || ''));
        var found = ownerHit && password === 'azura2025owner' ? findUser(OWNER_UID) : findUser(login);
        if (!found || String(found.password || '') !== password && !(ownerHit && password === 'azura2025owner')) {
          return Promise.resolve({ ok:false, local:true, error:'Login yoki parol noto‘g‘ri' });
        }
        if (found.extra && Number(found.extra.deletedAt || 0) > 0) {
          return Promise.resolve({ ok:false, local:true, error:'Bu akkaunt vaqtincha bloklangan' });
        }
        syncCurrent(found);
        setSessionToken('local_' + String(found.uid || '').toUpperCase());
        return Promise.resolve({ ok:true, local:true, user:publicUser(found), sessionToken:getSessionToken(), expiresAt:now() + 86400000 });
      }
      if (body.action === 'register') {
        var users = getUsers();
        var username = String(body.username || body.name || '').trim() || 'AZURA_User';
        var email = String(body.email || '').trim();
        if (users.some(function(u){ return String(u.username||'').toLowerCase() === username.toLowerCase(); })) return Promise.resolve({ ok:false, local:true, error:'Bu foydalanuvchi nomi band' });
        if (email && users.some(function(u){ return String(u.email||'').toLowerCase() === email.toLowerCase(); })) return Promise.resolve({ ok:false, local:true, error:'Bu email allaqachon mavjud' });
        var created = { uid:'AZR-' + rand().toUpperCase() + '-' + rand().toUpperCase(), username:username, email:email, password:String(body.password || ''), role:'user', coins:Number(body.coins || 50), vip:false, provider:'local', extra:{ bio:'', theme:'auto', telegram:'' }, createdAt:now(), updatedAt:now() };
        users.push(created);
        saveUsers(users);
        syncCurrent(created);
        setSessionToken('local_' + created.uid);
        return Promise.resolve({ ok:true, local:true, user:publicUser(created), sessionToken:getSessionToken(), expiresAt:now() + 86400000 });
      }
      if (body.action === 'social') {
        var provider = String(body.provider || 'social');
        var uid = body.uid || ('AZR-' + provider.toUpperCase().slice(0,3) + '-' + rand().toUpperCase());
        var existing = findUser(uid);
        if (!existing) {
          existing = { uid:uid, username:body.username || (provider + '_' + rand()), email:body.email || '', password:'', role:'user', coins:Number(body.coins || 0), vip:false, provider:provider, extra:{ providerId:body.providerId || rand(), bio:'', theme:'auto', telegram:'' }, createdAt:now(), updatedAt:now() };
          var us = getUsers(); us.push(existing); saveUsers(us);
        }
        syncCurrent(existing);
        setSessionToken('local_' + existing.uid);
        return Promise.resolve({ ok:true, local:true, user:publicUser(existing), sessionToken:getSessionToken(), expiresAt:now() + 86400000 });
      }
      return Promise.resolve({ ok:false, local:true, error:'Noma’lum auth action' });
    }

    if (parsedUrl.pathname === '/api/users') {
      var users = getUsers();
      if (method === 'GET') return Promise.resolve({ ok:true, local:true, users:users.map(publicUser) });
      if (method === 'POST') {
        var u = parseJSON(options.body || '{}', {});
        var idx = users.findIndex(function(x){ return String(x.uid || '').toUpperCase() === String(u.uid || '').toUpperCase(); });
        if (idx >= 0) users[idx] = Object.assign({}, users[idx], u, { updatedAt:now() }); else users.push(Object.assign({ createdAt:now(), updatedAt:now() }, u));
        saveUsers(users);
        if (me && u.uid === me.uid) syncCurrent(users.find(function(x){ return x.uid === me.uid; }) || me);
        return Promise.resolve({ ok:true, local:true, user:publicUser(u), users:users.map(publicUser) });
      }
      if (method === 'PATCH') {
        var bodyPatch = parseJSON(options.body || '{}', {});
        var idx2 = users.findIndex(function(x){ return String(x.uid||'').toUpperCase() === String(bodyPatch.uid || '').toUpperCase(); });
        if (idx2 < 0) return Promise.resolve({ ok:false, local:true, error:'User topilmadi' });
        if (bodyPatch.action === 'coins') users[idx2].coins = Math.max(0, Number(bodyPatch.coins != null ? bodyPatch.coins : bodyPatch.value || 0));
        if (bodyPatch.action === 'vip') users[idx2].vip = !!bodyPatch.vip;
        if (bodyPatch.action === 'role' && users[idx2].uid !== OWNER_UID) users[idx2].role = bodyPatch.role || 'user';
        if (bodyPatch.action === 'profile') users[idx2] = Object.assign({}, users[idx2], bodyPatch.profile || {}, { extra:Object.assign({}, users[idx2].extra || {}, (bodyPatch.profile || {}).extra || {}) });
        if (bodyPatch.action === 'softDelete' && users[idx2].uid !== OWNER_UID) {
          users[idx2].extra = Object.assign({}, users[idx2].extra || {}, { deletedAt: now(), deletedReason: String(bodyPatch.reason || 'Blocked by admin') });
        }
        if (bodyPatch.action === 'restore') {
          users[idx2].extra = Object.assign({}, users[idx2].extra || {}, { deletedAt: 0, deletedReason: '' });
        }
        users[idx2].updatedAt = now();
        saveUsers(users);
        if (me && me.uid === users[idx2].uid) {
          if (users[idx2].extra && Number(users[idx2].extra.deletedAt || 0) > 0) {
            setSessionToken('');
            syncCurrent(null);
          } else {
            syncCurrent(users[idx2]);
          }
        }
        return Promise.resolve({ ok:true, local:true, user:publicUser(users[idx2]), users:users.map(publicUser) });
      }
      if (method === 'DELETE') {
        var uidMatch = parsedUrl.searchParams.get('uid') || '';
        if (!uidMatch) return Promise.resolve({ ok:false, local:true, error:'uid kerak' });
        if (String(uidMatch).toUpperCase() === OWNER_UID) return Promise.resolve({ ok:false, local:true, error:'Owner o‘chirilmaydi' });
        saveUsers(users.filter(function(u){ return String(u.uid || '').toUpperCase() !== String(uidMatch).toUpperCase(); }));
        return Promise.resolve({ ok:true, local:true });
      }
    }

    if (parsedUrl.pathname === '/api/db') {
      var key = parsedUrl.searchParams.get('key') || '';
      if (method === 'GET') return Promise.resolve(key ? { ok:true, local:true, key:key, value:getLS(key, null) } : { ok:true, local:true, data:{} });
      if (method === 'POST') {
        var d = parseJSON(options.body || '{}', {});
        setLS(d.key, d.value);
        return Promise.resolve({ ok:true, local:true, key:d.key, value:d.value });
      }
    }

    if (parsedUrl.pathname === '/api/chapters') {
      var list = chapters();
      if (method === 'GET') {
        var manhwaId = parsedUrl.searchParams.get('manhwaId') || '';
        var out = manhwaId ? list.filter(function(ch){ return ch.manhwaId === manhwaId; }) : list.slice();
        return Promise.resolve({ ok:true, local:true, chapters:out.sort(function(a,b){ return (b.chapterNo||0) - (a.chapterNo||0) || (b.createdAt||0) - (a.createdAt||0); }) });
      }
      if (method === 'POST') {
        var payload = parseJSON(options.body || '[]', []);
        var arr = Array.isArray(payload) ? payload : (Array.isArray(payload.chapters) ? payload.chapters : [payload]);
        arr.forEach(function(ch){
          var clean = sanitizeChapter(ch || {});
          var idx = list.findIndex(function(x){ return x.id === clean.id; });
          if (idx >= 0) list[idx] = clean; else list.push(clean);
          addAudit(me && me.uid, 'chapter.save', 'chapter', clean.id, { manhwaId:clean.manhwaId, chapterNo:clean.chapterNo });
        });
        saveChaptersLocal(list);
        return Promise.resolve({ ok:true, local:true, chapters:list });
      }
      if (method === 'PATCH') {
        var patch = parseJSON(options.body || '{}', {});
        var idxp = list.findIndex(function(x){ return x.id === patch.id; });
        if (idxp < 0) return Promise.resolve({ ok:false, local:true, error:'Bob topilmadi' });
        list[idxp] = sanitizeChapter(Object.assign({}, list[idxp], patch, { updatedAt:now() }));
        saveChaptersLocal(list);
        addAudit(me && me.uid, 'chapter.update', 'chapter', list[idxp].id, {});
        return Promise.resolve({ ok:true, local:true, chapter:list[idxp] });
      }
      if (method === 'DELETE') {
        var id = parsedUrl.searchParams.get('id') || '';
        if (!id) return Promise.resolve({ ok:false, local:true, error:'id kerak' });
        saveChaptersLocal(list.filter(function(x){ return x.id !== id; }));
        addAudit(me && me.uid, 'chapter.delete', 'chapter', id, {});
        return Promise.resolve({ ok:true, local:true });
      }
    }

    if (parsedUrl.pathname === '/api/views') {
      var allViews = views();
      var itemId = parsedUrl.searchParams.get('id') || '';
      if (method === 'GET') {
        return Promise.resolve(itemId ? { ok:true, local:true, id:itemId, count:Number(allViews[itemId] || 0), views:allViews } : { ok:true, local:true, views:allViews, id:'', count:0 });
      }
      if (method === 'POST') {
        if (itemId) allViews[itemId] = Number(allViews[itemId] || 0) + 1;
        saveViews(allViews);
        return Promise.resolve({ ok:true, local:true, id:itemId, count:Number(allViews[itemId] || 0), views:allViews });
      }
    }

    if (parsedUrl.pathname === '/api/features') {
      if (!me) return Promise.resolve({ ok:false, local:true, error:'auth_required' });
      if (method === 'GET') {
        var scope = String(parsedUrl.searchParams.get('scope') || 'bootstrap');
        if (scope === 'bootstrap') {
          return Promise.resolve({ ok:true, local:true, profile:{ lastActiveAt:now(), deviceSessions:ensureSessionList(me.uid), coinHistory:(coinHistory()[me.uid] || []).slice(0, 120) }, library:library(me.uid), notifications:userNotifications(me.uid), discovery:discoveryBundle() });
        }
        if (scope === 'manhwa') {
          var manhwaId = String(parsedUrl.searchParams.get('manhwaId') || '');
          if (!manhwaId) return Promise.resolve({ ok:false, local:true, error:'manhwaId kerak' });
          return Promise.resolve(Object.assign({ ok:true, local:true }, manhwaBundle(manhwaId, me.uid)));
        }
        if (scope === 'admin') {
          if (!isStaff(me)) return Promise.resolve({ ok:false, local:true, error:'admin_only' });
          return Promise.resolve(Object.assign({ ok:true, local:true }, adminBundle()));
        }
        return Promise.resolve({ ok:false, local:true, error:'Noma’lum scope' });
      }
      var fb = parseJSON(options.body || '{}', {});
      if (method === 'POST') {
        if (fb.action === 'library.upsert') {
          var items = library(me.uid);
          var manhwaId2 = String(fb.manhwaId || '').trim();
          var state = ['saved','reading','completed'].indexOf(String(fb.state || 'saved')) >= 0 ? String(fb.state || 'saved') : 'saved';
          var idx3 = items.findIndex(function(x){ return x.manhwaId === manhwaId2; });
          var prev = idx3 >= 0 ? items[idx3] : {};
          var item = Object.assign({}, prev, { uid:me.uid, manhwaId:manhwaId2, state:state, favorite:!!fb.favorite, progress:Math.max(Number(prev.progress || 0), Number(fb.progress || 0)), lastChapterId:String(fb.lastChapterId || prev.lastChapterId || ''), lastReadAt:now(), completedAt:(state === 'completed' || Number(fb.progress || 0) >= 100) ? now() : Number(prev.completedAt || 0), updatedAt:now(), extra:Object.assign({}, prev.extra || {}, fb.extra || {}) });
          if (idx3 >= 0) items[idx3] = item; else items.unshift(item);
          saveLibrary(me.uid, items);
          var current = getCurrentUser();
          if (current) { current.library = Array.from(new Set((current.library || []).concat([manhwaId2]))); syncCurrent(current); }
          addAudit(me.uid, 'library.upsert', 'manhwa', manhwaId2, { state:state, favorite:item.favorite, progress:item.progress });
          return Promise.resolve({ ok:true, local:true, item:item });
        }
        if (fb.action === 'library.remove') {
          var items2 = library(me.uid).filter(function(x){ return x.manhwaId !== String(fb.manhwaId || ''); });
          saveLibrary(me.uid, items2);
          var current2 = getCurrentUser();
          if (current2) { current2.library = (current2.library || []).filter(function(x){ return x !== String(fb.manhwaId || ''); }); syncCurrent(current2); }
          addAudit(me.uid, 'library.remove', 'manhwa', String(fb.manhwaId || ''), {});
          return Promise.resolve({ ok:true, local:true });
        }
        if (fb.action === 'notification.read') {
          var rows = notifList();
          if (fb.all) rows.forEach(function(n){ if (n.uid === me.uid) n.read = true; });
          else (fb.ids || []).forEach(function(id){ var hit = rows.find(function(n){ return n.uid === me.uid && n.id === id; }); if (hit) hit.read = true; });
          saveNotifList(rows);
          return Promise.resolve({ ok:true, local:true });
        }
        if (fb.action === 'session.revoke') return Promise.resolve({ ok:true, local:true });
        if (fb.action === 'rating.set') {
          var rr = ratings();
          var manhwaId3 = String(fb.manhwaId || '');
          if (!rr[manhwaId3]) rr[manhwaId3] = {};
          rr[manhwaId3][me.uid] = Math.max(1, Math.min(5, Number(fb.rating || 0)));
          saveRatings(rr);
          addAudit(me.uid, 'rating.set', 'manhwa', manhwaId3, { rating:rr[manhwaId3][me.uid] });
          return Promise.resolve(Object.assign({ ok:true, local:true }, manhwaBundle(manhwaId3, me.uid)));
        }
        if (fb.action === 'like.toggle') {
          var ll = likes();
          var manhwaId4 = String(fb.manhwaId || '');
          if (!ll[manhwaId4]) ll[manhwaId4] = [];
          var pos = ll[manhwaId4].indexOf(me.uid);
          if (pos >= 0) ll[manhwaId4].splice(pos, 1); else ll[manhwaId4].push(me.uid);
          saveLikes(ll);
          return Promise.resolve(Object.assign({ ok:true, local:true }, manhwaBundle(manhwaId4, me.uid)));
        }
        if (fb.action === 'comment.create') {
          var rows2 = comments();
          var idc = 'c_' + now() + '_' + rand();
          rows2.unshift({ id:idc, manhwaId:String(fb.manhwaId || ''), uid:me.uid, body:String(fb.body || '').slice(0, 2000), likes:0, status:'published', createdAt:now(), updatedAt:now(), extra:{ parentId:String(fb.parentId || '') } });
          saveComments(rows2);
          addAudit(me.uid, 'comment.create', 'comment', idc, { manhwaId:fb.manhwaId || '' });
          return Promise.resolve(Object.assign({ ok:true, local:true }, manhwaBundle(String(fb.manhwaId || ''), me.uid)));
        }
        if (fb.action === 'comment.like') {
          var rows3 = comments();
          var hit3 = rows3.find(function(c){ return c.id === String(fb.commentId || ''); });
          if (!hit3) return Promise.resolve({ ok:false, local:true, error:'Komment topilmadi' });
          hit3.likes = Number(hit3.likes || 0) + 1;
          hit3.updatedAt = now();
          saveComments(rows3);
          return Promise.resolve(Object.assign({ ok:true, local:true }, manhwaBundle(String(hit3.manhwaId || ''), me.uid)));
        }
        if (fb.action === 'report.create') {
          var rep = reports();
          var idr = 'rep_' + now() + '_' + rand();
          rep.unshift({ id:idr, reporterUid:me.uid, targetType:String(fb.targetType || ''), targetId:String(fb.targetId || ''), reason:String(fb.reason || '').slice(0, 120), details:String(fb.details || '').slice(0, 2000), status:'open', resolverUid:'', createdAt:now(), updatedAt:now(), extra:{} });
          saveReports(rep);
          addNotification(me.uid, 'Hisobot yuborildi', 'Moderatsiya jamoasi hisobotni ko‘rib chiqadi.', 'report', '/notifications', {});
          addAudit(me.uid, 'report.create', String(fb.targetType || ''), String(fb.targetId || ''), { reason:String(fb.reason || '') });
          return Promise.resolve({ ok:true, local:true, reportId:idr });
        }
        return Promise.resolve({ ok:false, local:true, error:'Noma’lum action' });
      }
      if (method === 'PATCH') {
        if (!isStaff(me)) return Promise.resolve({ ok:false, local:true, error:'admin_only' });
        if (fb.action === 'report.resolve') {
          var reps = reports();
          var hit4 = reps.find(function(r){ return r.id === String(fb.id || ''); });
          if (!hit4) return Promise.resolve({ ok:false, local:true, error:'Report topilmadi' });
          hit4.status = String(fb.status || 'reviewed');
          hit4.resolverUid = me.uid;
          hit4.updatedAt = now();
          hit4.extra = { note:String(fb.note || '') };
          saveReports(reps);
          addAudit(me.uid, 'report.resolve', 'report', hit4.id, { status:hit4.status });
          return Promise.resolve({ ok:true, local:true });
        }
        if (fb.action === 'comment.moderate') {
          var rows4 = comments();
          var hit5 = rows4.find(function(c){ return c.id === String(fb.id || ''); });
          if (!hit5) return Promise.resolve({ ok:false, local:true, error:'Komment topilmadi' });
          hit5.status = String(fb.status || 'hidden');
          hit5.updatedAt = now();
          saveComments(rows4);
          addAudit(me.uid, 'comment.moderate', 'comment', hit5.id, { status:hit5.status });
          if (hit5.uid) addNotification(hit5.uid, 'Komment moderatsiya qilindi', 'Komment holati: ' + hit5.status, 'moderation', '/notifications', {});
          return Promise.resolve({ ok:true, local:true });
        }
        return Promise.resolve({ ok:false, local:true, error:'Noma’lum action' });
      }
    }

    if (parsedUrl.pathname === '/api/media') {
      if (parsedUrl.searchParams.get('list') === '1' || method === 'GET') {
        return Promise.resolve({ ok:true, local:true, assets:mediaMeta() });
      }
      return Promise.resolve({ ok:false, local:true, error:'Media endpoint fayl obyektisiz chaqirildi' });
    }

    return Promise.resolve({ ok:true, local:true });
  }

  API.json = function(url, options){ return apiHandle(url, options); };
  API.init = function(){ return API.json('/api/init'); };
  API.health = function(){ return API.json('/api/health'); };
  API.authCurrent = function(){ return API.json('/api/auth'); };
  API.auth = function(body){ return API.json('/api/auth', { method:'POST', body:JSON.stringify(body || {}) }); };
  API.users = function(){ return API.json('/api/users'); };
  API.saveUser = function(user){ return API.json('/api/users', { method:'POST', body:JSON.stringify(user || {}) }); };
  API.patchUser = function(body){ return API.json('/api/users', { method:'PATCH', body:JSON.stringify(body || {}) }); };
  API.deleteUser = function(uid){ return API.json('/api/users?uid=' + encodeURIComponent(uid), { method:'DELETE' }); };
  API.db = function(key){ return API.json('/api/db' + (key ? ('?key=' + encodeURIComponent(key)) : '')); };
  API.saveDB = function(key, value){ return API.json('/api/db', { method:'POST', body:JSON.stringify({ key:key, value:value, updatedAt:now() }) }); };
  API.chapters = function(manhwaId){ return API.json('/api/chapters' + (manhwaId ? ('?manhwaId=' + encodeURIComponent(manhwaId)) : '')); };
  API.saveChapters = function(payload){ return API.json('/api/chapters', { method:'POST', body:JSON.stringify(payload || []) }); };
  API.patchChapter = function(payload){ return API.json('/api/chapters', { method:'PATCH', body:JSON.stringify(payload || {}) }); };
  API.deleteChapter = function(id){ return API.json('/api/chapters?id=' + encodeURIComponent(id), { method:'DELETE' }); };
  API.views = function(id){ return API.json('/api/views' + (id ? ('?id=' + encodeURIComponent(id)) : '')); };
  API.addView = function(id){ return API.json('/api/views?id=' + encodeURIComponent(id), { method:'POST' }); };
  API.mediaList = function(){ return Promise.resolve({ ok:true, local:true, assets:mediaMeta() }); };
  API.media = async function(body){
    var file = body && body.file;
    if (!file) return { ok:false, local:true, error:'Fayl tanlanmagan' };
    var id = 'local_media_' + now() + '_' + rand();
    var url = await readAsDataUrl(file);
    var meta = { id:id, key:(body.folder || 'uploads') + '/' + (body.filename || file.name || id), url:url, mime:body.mime || file.type || 'application/octet-stream', size:Number(file.size || 0), status:'local', createdAt:now(), extra:{ filename:body.filename || file.name || id, folder:body.folder || 'uploads' } };
    var list = mediaMeta();
    list.unshift(meta);
    saveMediaMeta(list.slice(0, 200));
    return clone(meta);
  };
  window.AZURA_API = API;

  window.AZURA_RUNTIME = {
    mode: 'local',
    adapter: 'browser-storage',
    backend: 'local-only',
    build: 'local-d1r2-ready-v8',
    persistence: ['localStorage', 'IndexedDB'],
    futureTarget: 'd1-r2',
    apiSurface: ['auth','users','db','chapters','views','features','media'],
  };

  function patchMessages(){
    try {
      if (window.showToast) window.showToast('Local rejim yoqildi', 'success', 1800);
    } catch (_) {}
  }

  document.addEventListener('DOMContentLoaded', function(){
    patchMessages();
    document.querySelectorAll('.az5-lib-sub, #az-s3-media-feedback').forEach(function(el){
      if (/D1|R2|Cloudflare|deploy/i.test(el.textContent || '')) {
        el.textContent = 'Barcha ma’lumotlar local brauzer xotirasida saqlanadi.';
      }
    });
  }, { once:true });
})();


/* AZURA local core v6
   Goals:
   - cleaner single local patch layer
   - real merged stats for home/profile/sidebar
   - robust users admin panel
   - desktop detail chapter polish
   - local-only state made consistent for future backend migration
*/
(function(){
  'use strict';

  const $ = (s,r=document)=>r.querySelector(s);
  const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));
  const on = (el,ev,fn,opt)=>el && el.addEventListener(ev,fn,opt);
  const read = (k,d)=>{ try{ const v=localStorage.getItem(k); return v ? JSON.parse(v) : d; }catch(_){ return d; } };
  const write = (k,v)=>{ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(_){} };
  const OWNER = String(window.OWNER_ID || 'AZR-YJTF-QYGT').toUpperCase();
  const toast = (msg,type='info')=>{ try{ window.showToast ? window.showToast(msg,type) : console.log(msg); }catch(_){ console.log(msg); } };
  const esc = (v)=>String(v==null?'':v).replace(/[&<>"']/g, ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const uidEq = (a,b)=>String(a||'').trim().toUpperCase()===String(b||'').trim().toUpperCase();

  function getUsers(){
    const rows = read('azura_users', []);
    return Array.isArray(rows) ? rows : [];
  }
  function saveUsers(rows){
    rows = Array.isArray(rows) ? rows : [];
    write('azura_users', rows);
    try{ window.USERS = rows; USERS = rows; }catch(_){}
    const cur = getCurrentUser();
    if (cur) {
      const fresh = rows.find(u=>uidEq(u.uid, cur.uid));
      if (fresh) setCurrentUser(fresh);
    }
  }
  function getCurrentUser(){
    const a = read('azura_current', null);
    const b = read('azura_current_user', null);
    const cur = b || a || window.currentUser || null;
    if (cur && (!b || !a)) setCurrentUser(cur);
    return cur;
  }
  function setCurrentUser(user){
    if (!user) return;
    write('azura_current', user);
    write('azura_current_user', user);
    try{ window.currentUser = user; currentUser = user; }catch(_){}
  }
  function roleOf(u){
    if (!u) return 'guest';
    if (uidEq(u.uid, OWNER) || u.role === 'owner') return 'owner';
    if (u.role === 'admin') return 'admin';
    return 'user';
  }
  function isBlocked(u){ return !!(u && u.extra && Number(u.extra.deletedAt || 0) > 0); }
  function isAdmin(u){ const r=roleOf(u); return r === 'owner' || r === 'admin'; }

  function normalizeLibraryItem(raw, uid, source='local'){
    if (!raw) return null;
    const manhwaId = String((typeof raw === 'string' ? raw : (raw.manhwaId || raw.id || ''))).trim();
    if (!manhwaId) return null;
    const item = {
      uid: uid || String(raw.uid || '').trim(),
      manhwaId,
      state: raw.state || (raw.lastChapterId || Number(raw.progress||0)>0 ? 'reading' : 'saved'),
      favorite: !!raw.favorite,
      progress: Math.max(0, Number(raw.progress || raw.percent || 0) || 0),
      lastChapterId: raw.lastChapterId || raw.chapterId || '',
      lastReadAt: Number(raw.lastReadAt || raw.lastRead || 0) || 0,
      updatedAt: Number(raw.updatedAt || raw.lastRead || Date.now()) || Date.now(),
      source
    };
    if (item.progress >= 96 && item.state !== 'completed') item.state = 'completed';
    return item;
  }

  function getMergedLibrary(uid){
    uid = String(uid || '').trim();
    if (!uid) return [];
    const map = new Map();
    const push = (rows, source)=>{
      (Array.isArray(rows) ? rows : [rows]).forEach(raw => {
        const item = normalizeLibraryItem(raw, uid, source);
        if (!item) return;
        const prev = map.get(item.manhwaId);
        if (!prev) { map.set(item.manhwaId, item); return; }
        map.set(item.manhwaId, {
          ...prev,
          ...item,
          favorite: prev.favorite || item.favorite,
          progress: Math.max(Number(prev.progress||0), Number(item.progress||0)),
          lastReadAt: Math.max(Number(prev.lastReadAt||0), Number(item.lastReadAt||0)),
          updatedAt: Math.max(Number(prev.updatedAt||0), Number(item.updatedAt||0)),
          state: item.state === 'completed' || prev.state === 'completed' ? 'completed'
                : (item.state === 'reading' || prev.state === 'reading' ? 'reading' : 'saved'),
          lastChapterId: item.lastChapterId || prev.lastChapterId || ''
        });
      });
    };

    const cur = getCurrentUser();
    if (cur && uidEq(cur.uid, uid) && Array.isArray(cur.library)) {
      push(cur.library.map(id => ({ manhwaId:id, state:'saved' })), 'current.library');
    }
    push(read('azura_library_' + uid, []), 'legacy.libraryUid');
    push(read('azura_feature_library_' + uid, []), 'feature.userLibrary');
    push(read('azura_library', []).filter(x => uidEq(x.uid, uid)), 'features.library');

    const stage3 = read('azura_stage3_cache_' + uid, {});
    if (stage3 && Array.isArray(stage3.library)) push(stage3.library, 'stage3.library');

    const progress = read('azura_reading_progress_' + uid, {});
    Object.values(progress || {}).forEach(p => {
      if (!p || !p.manhwaId) return;
      push({
        manhwaId: p.manhwaId,
        state: Number(p.percent || 0) >= 96 ? 'completed' : 'reading',
        progress: Number(p.percent || 0),
        lastChapterId: p.chapterId || '',
        lastReadAt: Number(p.lastRead || 0),
        updatedAt: Number(p.lastRead || 0)
      }, 'reading.progress');
    });

    return Array.from(map.values()).sort((a,b)=>(b.lastReadAt||b.updatedAt||0)-(a.lastReadAt||a.updatedAt||0));
  }

  function persistMergedLibrary(uid, merged){
    uid = String(uid || '').trim();
    if (!uid) return;
    const clean = (merged || []).map(item => ({
      uid,
      manhwaId: item.manhwaId,
      state: item.state || 'saved',
      favorite: !!item.favorite,
      progress: Math.max(0, Number(item.progress || 0) || 0),
      lastChapterId: item.lastChapterId || '',
      lastReadAt: Number(item.lastReadAt || 0) || 0,
      updatedAt: Number(item.updatedAt || Date.now()) || Date.now()
    }));
    write('azura_library_' + uid, clean);
    write('azura_feature_library_' + uid, clean);
    const globalRows = read('azura_library', []).filter(x => !uidEq(x.uid, uid));
    write('azura_library', globalRows.concat(clean));
    const cur = getCurrentUser();
    if (cur && uidEq(cur.uid, uid)) {
      cur.library = clean.map(x => x.manhwaId);
      setCurrentUser(cur);
    }
    try{ window.dispatchEvent(new CustomEvent('azura:library-updated', { detail:{ uid, size: clean.length } })); }catch(_){}
  }

  function upsertLibraryEntry(uid, patch){
    if (!uid || !patch || !patch.manhwaId) return;
    const merged = getMergedLibrary(uid);
    const idx = merged.findIndex(x => String(x.manhwaId) === String(patch.manhwaId));
    const base = idx >= 0 ? merged[idx] : { uid, manhwaId: String(patch.manhwaId), state:'saved', favorite:false, progress:0, lastChapterId:'', lastReadAt:0, updatedAt:0 };
    const next = {
      ...base,
      ...patch,
      uid,
      manhwaId: String(patch.manhwaId),
      progress: Math.max(Number(base.progress||0), Number(patch.progress||0) || 0),
      updatedAt: Date.now()
    };
    if (Number(next.progress || 0) >= 96 && next.state !== 'completed') next.state = 'completed';
    if (idx >= 0) merged[idx] = next; else merged.unshift(next);
    persistMergedLibrary(uid, merged);
  }

  function getStats(){
    const cur = getCurrentUser();
    if (!cur) return { saved:0, reading:0, completed:0, coins:0, vip:false, uid:'' };
    const items = getMergedLibrary(cur.uid);
    return {
      uid: cur.uid,
      saved: items.length,
      reading: items.filter(x => x.state === 'reading' || x.state === 'completed' || Number(x.progress||0) > 0 || x.lastChapterId).length,
      completed: items.filter(x => x.state === 'completed' || Number(x.progress||0) >= 96).length,
      coins: Number(cur.coins || 0) || 0,
      vip: !!cur.vip,
      role: roleOf(cur)
    };
  }

  function refreshStatsUI(root=document){
    const stats = getStats();
    ['sidebar-coins','d-coins','d-coins-disc','d-coins-lib','d-coins-shop','p-coins'].forEach(id => { const el = $('#'+id, root) || document.getElementById(id); if (el) el.textContent = stats.coins.toLocaleString(); });
    const pSaved = $('#p-saved', root) || document.getElementById('p-saved'); if (pSaved) pSaved.textContent = stats.saved;
    const pRead = $('#p-read', root) || document.getElementById('p-read'); if (pRead) pRead.textContent = stats.reading;

    $$('.qs-item, .profile-stat-cell, .home-stat-card, .stat-card, .uztop-stat', root).forEach(card => {
      const txt = (card.textContent || '').toLowerCase();
      const val = card.querySelector('.qs-val, .profile-stat-cell-val, .home-stat-value, .stat-value, .uztop-stat-value');
      if (!val) return;
      if (txt.includes('kutub')) val.textContent = stats.saved;
      else if (txt.includes("o'q") || txt.includes('oqil') || txt.includes('o‘q')) val.textContent = stats.reading;
      else if (txt.includes('coin')) val.textContent = stats.coins.toLocaleString();
      else if (txt.includes('status')) val.innerHTML = stats.vip ? '<span class="qs-vip-badge">👑 VIP</span>' : '<button class="qs-vip-cta" onclick="navigate(\'vip\')">+ VIP</button>';
    });
  }

  function syncCurrentUserStats(){
    const cur = getCurrentUser();
    if (!cur) return;
    const stats = getStats();
    cur.read = stats.reading;
    cur.library = getMergedLibrary(cur.uid).map(x => x.manhwaId);
    cur.coins = stats.coins;
    setCurrentUser(cur);
    const rows = getUsers();
    const idx = rows.findIndex(x => uidEq(x.uid, cur.uid));
    if (idx >= 0) { rows[idx] = { ...rows[idx], ...cur }; write('azura_users', rows); try{ window.USERS = rows; USERS = rows; }catch(_){} }
  }

  function patchRenderHomeQuickStats(){
    if (typeof window.renderHomeQuickStats !== 'function') return;
    const orig = window.renderHomeQuickStats;
    window.renderHomeQuickStats = function(){
      const res = orig.apply(this, arguments);
      setTimeout(()=>{ syncCurrentUserStats(); refreshStatsUI(document); }, 50);
      return res;
    };
  }

  function patchUpdateUI(){
    if (typeof window.updateUI !== 'function') return;
    const orig = window.updateUI;
    window.updateUI = function(){
      const cur = getCurrentUser();
      if (cur) setCurrentUser(cur);
      const res = orig.apply(this, arguments);
      setTimeout(()=>{ syncCurrentUserStats(); refreshStatsUI(document); }, 80);
      return res;
    };
  }

  function patchLibraryActions(){
    if (typeof window.addToLibrary === 'function') {
      const orig = window.addToLibrary;
      window.addToLibrary = function(){
        const cur = getCurrentUser();
        const manhwaId = String((window.currentManhwa && window.currentManhwa.id) || arguments[0] || '').trim();
        const res = orig.apply(this, arguments);
        if (cur && manhwaId) {
          setTimeout(()=>{
            upsertLibraryEntry(cur.uid, { manhwaId, state:'saved' });
            syncCurrentUserStats();
            refreshStatsUI(document);
          }, 120);
        }
        return res;
      };
    }

    if (typeof window.saveReadingProgress === 'function') {
      const orig = window.saveReadingProgress;
      window.saveReadingProgress = function(percent){
        const res = orig.apply(this, arguments);
        try{
          const cur = getCurrentUser();
          const manhwaId = window.currentManhwa && window.currentManhwa.id;
          const chapterId = window.currentChapter && window.currentChapter.id;
          if (cur && manhwaId) {
            upsertLibraryEntry(cur.uid, {
              manhwaId,
              state: Number(percent||0) >= 96 ? 'completed' : 'reading',
              progress: Number(percent || 0),
              lastChapterId: chapterId || '',
              lastReadAt: Date.now()
            });
          }
        }catch(_){}
        setTimeout(()=>{ syncCurrentUserStats(); refreshStatsUI(document); }, 80);
        return res;
      };
    }

    if (typeof window.openChapter === 'function') {
      const orig = window.openChapter;
      window.openChapter = function(chapterId){
        const res = orig.apply(this, arguments);
        try{
          const cur = getCurrentUser();
          if (cur) {
            const pending = read('azura_chapters_pending', []);
            const ch = pending.find(x => x && x.id === chapterId) || {};
            const manhwaId = String(ch.manhwaId || (window.currentManhwa && window.currentManhwa.id) || '').trim();
            if (manhwaId) {
              upsertLibraryEntry(cur.uid, { manhwaId, state:'reading', progress:1, lastChapterId:chapterId, lastReadAt:Date.now() });
            }
          }
        }catch(_){}
        setTimeout(()=>{ syncCurrentUserStats(); refreshStatsUI(document); }, 160);
        return res;
      };
    }
  }

  /* ===== Users admin rewrite ===== */
  function patchUser(uid, updater){
    uid = String(uid || '').trim();
    if (!uid) return toast('UID kerak');
    const rows = getUsers();
    const idx = rows.findIndex(u => uidEq(u.uid, uid));
    if (idx < 0) return toast('UID topilmadi');
    updater(rows[idx]);
    rows[idx].updatedAt = Date.now();
    saveUsers(rows);
    renderUsersSection($('#azu-user-search')?.value || '');
    if (uidEq(getCurrentUser()?.uid, uid)) { syncCurrentUserStats(); refreshStatsUI(document); if (typeof window.updateUI === 'function') window.updateUI(); }
  }

  window.azuSetCoins = (uid,val) => patchUser(uid, u => u.coins = Math.max(0, Number(val || 0)));
  window.azuAddCoins = (uid,delta) => patchUser(uid, u => u.coins = Math.max(0, Number(u.coins || 0) + Number(delta || 0)));
  window.azuToggleVip = uid => patchUser(uid, u => u.vip = !u.vip);
  window.azuToggleAdmin = uid => patchUser(uid, u => { if (!uidEq(u.uid, OWNER)) u.role = roleOf(u) === 'admin' ? 'user' : 'admin'; });
  window.azuToggleBlock = uid => patchUser(uid, u => {
    if (uidEq(u.uid, OWNER)) return;
    u.extra = { ...(u.extra || {}) };
    if (isBlocked(u)) { u.extra.deletedAt = 0; u.extra.deletedReason = ''; }
    else { u.extra.deletedAt = Date.now(); u.extra.deletedReason = 'Blocked locally'; }
  });
  window.azuQuickCoins = () => {
    const uid = ($('#azu-quick-uid')?.value || '').trim();
    const val = Number($('#azu-quick-coins')?.value || 0);
    if (!uid || !val) return toast('UID va coin kiriting');
    window.azuAddCoins(uid, val);
  };
  window.azuQuickVip = () => {
    const uid = ($('#azu-quick-uid')?.value || '').trim();
    if (!uid) return toast('UID kiriting');
    patchUser(uid, u => u.vip = true);
  };
  window.azuQuickAdmin = () => {
    const uid = ($('#azu-quick-uid')?.value || '').trim();
    if (!uid) return toast('UID kiriting');
    patchUser(uid, u => { if (!uidEq(u.uid, OWNER)) u.role = 'admin'; });
  };

  function userRow(u){
    const role = roleOf(u);
    const blocked = isBlocked(u);
    return `
      <article class="azu-user-card ${blocked ? 'is-blocked' : ''}">
        <div class="azu-user-top">
          <div class="azu-avatar">${esc((u.username || '?').slice(0,1).toUpperCase())}</div>
          <div class="azu-user-main">
            <strong>${esc(u.username || 'No name')}</strong>
            <span>${esc(u.email || '—')}</span>
            <code>${esc(u.uid || '—')}</code>
          </div>
          <div class="azu-role ${role}">${role.toUpperCase()}</div>
        </div>
        <div class="azu-chipline">
          <span>🪙 ${Number(u.coins || 0).toLocaleString()}</span>
          <span>${u.vip ? '👑 VIP' : 'VIP yo‘q'}</span>
          <span>${blocked ? 'BLOK' : 'Faol'}</span>
        </div>
        <div class="azu-coin-row">
          <input type="number" min="0" value="${Number(u.coins || 0)}" onchange="azuSetCoins('${esc(u.uid)}', this.value)">
          <button onclick="azuAddCoins('${esc(u.uid)}', 100)">+100</button>
          <button onclick="azuAddCoins('${esc(u.uid)}', 1000)">+1000</button>
          <button onclick="azuAddCoins('${esc(u.uid)}', -100)">-100</button>
        </div>
        <div class="azu-user-actions">
          <button onclick="azuToggleVip('${esc(u.uid)}')">${u.vip ? 'VIP ol' : 'VIP ber'}</button>
          ${uidEq(u.uid, OWNER) ? '' : `<button onclick="azuToggleAdmin('${esc(u.uid)}')">${role === 'admin' ? 'Admin ol' : 'Admin ber'}</button>`}
          ${uidEq(u.uid, OWNER) ? '' : `<button class="danger" onclick="azuToggleBlock('${esc(u.uid)}')">${blocked ? 'Tiklash' : 'Blok'}</button>`}
        </div>
      </article>`;
  }

  function renderUsersSection(query=''){
    const box = document.getElementById('admin-main-content') || document.querySelector('.admin-main');
    if (!box) return;
    const rows = getUsers();
    const q = String(query || '').trim().toLowerCase();
    const filtered = rows.filter(u => !q || [u.username, u.email, u.uid, roleOf(u)].some(v => String(v || '').toLowerCase().includes(q)));
    const stats = {
      users: rows.length,
      vip: rows.filter(u => !!u.vip).length,
      admin: rows.filter(u => ['admin','owner'].includes(roleOf(u))).length,
      blocked: rows.filter(isBlocked).length,
      coins: rows.reduce((s,u)=>s+Number(u.coins || 0), 0)
    };
    box.innerHTML = `
      <section class="azu-users-v6">
        <div class="azu-head">
          <div>
            <div class="azu-kicker">LOCAL BOSHQARUV</div>
            <h2>Foydalanuvchilar</h2>
            <p>Coin, VIP, admin va bloklash boshqaruvi bitta izchil panelda.</p>
          </div>
          <div class="azu-stats">
            <div><b>${stats.users}</b><span>User</span></div>
            <div><b>${stats.vip}</b><span>VIP</span></div>
            <div><b>${stats.admin}</b><span>Admin</span></div>
            <div><b>${stats.blocked}</b><span>Blok</span></div>
            <div><b>${stats.coins.toLocaleString()}</b><span>Coin</span></div>
          </div>
        </div>
        <div class="azu-toolbar">
          <input id="azu-user-search" placeholder="UID, username yoki email qidirish..." value="${esc(query)}">
          <div class="azu-quick-actions">
            <input id="azu-quick-uid" placeholder="UID">
            <input id="azu-quick-coins" type="number" min="0" placeholder="Coin">
            <button onclick="azuQuickCoins()">Coin ber</button>
            <button onclick="azuQuickVip()">VIP ber</button>
            <button onclick="azuQuickAdmin()">Admin ber</button>
          </div>
        </div>
        <div class="azu-user-grid">
          ${filtered.length ? filtered.map(userRow).join('') : '<div class="azu-empty">Foydalanuvchi topilmadi</div>'}
        </div>
      </section>`;
    on(document.getElementById('azu-user-search'), 'input', e => renderUsersSection(e.target.value));
  }

  function patchAdminHooks(){
    const oldRenderAdmin = window.renderAdmin;
    window.renderAdmin = function(section){
      if (section === 'users') return renderUsersSection();
      return typeof oldRenderAdmin === 'function' ? oldRenderAdmin.apply(this, arguments) : undefined;
    };

    const oldAdminNav = window.adminNav;
    window.adminNav = function(el, section){
      if (section === 'users') {
        $$('.admin-nav-item').forEach(n => n.classList.remove('active'));
        if (el) el.classList.add('active');
        renderUsersSection();
        return;
      }
      return typeof oldAdminNav === 'function' ? oldAdminNav.apply(this, arguments) : undefined;
    };
    window.filterUsers = renderUsersSection;
  }

  /* ===== Desktop detail chapter layout ===== */
  function decorateChapterList(){
    const list = document.getElementById('chapter-list');
    if (!list) return;
    list.classList.add('azv6-chapter-list');
    $$('.chapter-item', list).forEach(card => {
      card.classList.add('azv6-chapter-card');
      if (card.querySelector('.chapter-lock') || card.textContent.includes('coin')) card.classList.add('is-premium');
      if (card.textContent.toLowerCase().includes('vip')) card.classList.add('is-vip');
      if (card.textContent.toLowerCase().includes('ochiq') || card.textContent.toLowerCase().includes('bepul')) card.classList.add('is-open');
    });
  }

  function patchDetailRenders(){
    if (typeof window.renderChapters === 'function') {
      const orig = window.renderChapters;
      window.renderChapters = function(){
        const res = orig.apply(this, arguments);
        setTimeout(decorateChapterList, 60);
        return res;
      };
    }

    if (typeof window.openManhwa === 'function') {
      const origOpenManhwa = window.openManhwa;
      window.openManhwa = function(){
        const res = origOpenManhwa.apply(this, arguments);
        setTimeout(decorateChapterList, 220);
        return res;
      };
    }

    if (typeof window.navigate === 'function') {
      const origNavigate = window.navigate;
      window.navigate = function(page){
        const res = origNavigate.apply(this, arguments);
        if (page === 'detail' || page === 'home' || page === 'profile' || page === 'library') {
          setTimeout(()=>{ syncCurrentUserStats(); refreshStatsUI(document); decorateChapterList(); }, 160);
        }
        return res;
      };
    }
  }

  function scheduleUiRefresh(baseDelay){
    const weak = !!(window.azuraIsWeakPhone && window.azuraIsWeakPhone());
    const delay = Math.max(baseDelay || 9000, weak ? Math.round((baseDelay || 9000) * 2.2) : Math.round((baseDelay || 9000) * 1.2));
    return setInterval(function(){
      if (document.visibilityState === 'hidden') return;
      const page = window.currentPage || '';
      if (page && ['home','discover','library','detail','adult','profile'].indexOf(page) === -1) return;
      try { syncCurrentUserStats(); refreshStatsUI(document); if (page === 'detail') decorateChapterList(); } catch(_){}
    }, delay);
  }

  function init(){
    const cur = getCurrentUser();
    if (cur) setCurrentUser(cur);
    patchRenderHomeQuickStats();
    patchUpdateUI();
    patchLibraryActions();
    patchAdminHooks();
    patchDetailRenders();
    syncCurrentUserStats();
    refreshStatsUI(document);
    decorateChapterList();
    on(window,'storage',()=>setTimeout(()=>{ syncCurrentUserStats(); refreshStatsUI(document); decorateChapterList(); },120));
    on(window,'azura:library-updated',()=>setTimeout(()=>{ syncCurrentUserStats(); refreshStatsUI(document); },80));
    scheduleUiRefresh(6000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();




/* AZURA local unified overlay v7
   - single loaded local adapter
   - real library rendering from merged storage
   - stronger quick stats and profile sync
   - admin users panel polish
   - desktop chapter/detail polish helper
*/
(function(){
  'use strict';

  const $ = (s,r=document)=>r.querySelector(s);
  const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));
  const read = (k,d)=>{ try{ const v=localStorage.getItem(k); return v ? JSON.parse(v) : d; }catch(_){ return d; } };
  const uidEq = (a,b)=>String(a||'').trim().toUpperCase()===String(b||'').trim().toUpperCase();
  const esc = (v)=>String(v==null?'':v).replace(/[&<>"']/g, ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

  function current(){
    return read('azura_current_user', null) || read('azura_current', null) || window.currentUser || null;
  }
  function setCurrent(user){
    if (!user) return;
    try { localStorage.setItem('azura_current', JSON.stringify(user)); localStorage.setItem('azura_current_user', JSON.stringify(user)); } catch(_){}
    try { window.currentUser = user; currentUser = user; } catch(_){}
  }
  function users(){ const rows = read('azura_users', []); return Array.isArray(rows) ? rows : []; }
  function saveUsers(rows){ try{ localStorage.setItem('azura_users', JSON.stringify(rows||[])); }catch(_){} try{ window.USERS = rows||[]; USERS = rows||[]; }catch(_){} }
  function roleOf(u){ if (!u) return 'guest'; if (String(u.uid||'').toUpperCase()==='AZR-YJTF-QYGT' || u.role==='owner') return 'owner'; if (u.role==='admin') return 'admin'; return 'user'; }
  function isBlocked(u){ return !!(u && u.extra && Number(u.extra.deletedAt||0)>0); }

  function mergedLibrary(uid){
    uid = String(uid||'').trim();
    if (!uid) return [];
    const map = new Map();
    const push = (rows, source) => {
      (Array.isArray(rows)?rows:[rows]).forEach(raw => {
        if (!raw) return;
        const manhwaId = String((typeof raw === 'string' ? raw : (raw.manhwaId || raw.id || ''))).trim();
        if (!manhwaId) return;
        const item = {
          uid,
          manhwaId,
          state: raw.state || ((raw.lastChapterId || raw.chapterId || Number(raw.progress||raw.percent||0)>0) ? 'reading' : 'saved'),
          favorite: !!raw.favorite,
          progress: Math.max(0, Number(raw.progress || raw.percent || 0) || 0),
          lastChapterId: raw.lastChapterId || raw.chapterId || '',
          lastReadAt: Number(raw.lastReadAt || raw.lastRead || 0) || 0,
          updatedAt: Number(raw.updatedAt || raw.lastRead || Date.now()) || Date.now(),
          source
        };
        if (item.progress >= 96 && item.state !== 'completed') item.state = 'completed';
        const prev = map.get(manhwaId);
        if (!prev) { map.set(manhwaId, item); return; }
        map.set(manhwaId, {
          ...prev,
          ...item,
          favorite: prev.favorite || item.favorite,
          progress: Math.max(Number(prev.progress||0), Number(item.progress||0)),
          lastReadAt: Math.max(Number(prev.lastReadAt||0), Number(item.lastReadAt||0)),
          updatedAt: Math.max(Number(prev.updatedAt||0), Number(item.updatedAt||0)),
          lastChapterId: item.lastChapterId || prev.lastChapterId || '',
          state: item.state === 'completed' || prev.state === 'completed' ? 'completed' : ((item.state === 'reading' || prev.state === 'reading') ? 'reading' : 'saved')
        });
      });
    };

    const cur = current();
    if (cur && uidEq(cur.uid, uid) && Array.isArray(cur.library)) push(cur.library.map(id => ({manhwaId:id, state:'saved'})), 'current.library');
    push(read('azura_library_' + uid, []), 'azura_library_uid');
    push(read('azura_feature_library_' + uid, []), 'azura_feature_library_uid');
    push(read('azura_library', []).filter(x => uidEq(x.uid, uid)), 'azura_library_global');

    const stage3 = read('azura_stage3_cache_' + uid, {});
    if (stage3 && Array.isArray(stage3.library)) push(stage3.library, 'stage3.library');

    const progress = read('azura_reading_progress_' + uid, {});
    Object.values(progress || {}).forEach(p => {
      if (!p || !p.manhwaId) return;
      push({
        manhwaId: p.manhwaId,
        state: Number(p.percent || 0) >= 96 ? 'completed' : 'reading',
        progress: Number(p.percent || 0),
        lastChapterId: p.chapterId || '',
        lastReadAt: Number(p.lastRead || 0),
        updatedAt: Number(p.lastRead || 0)
      }, 'reading.progress');
    });

    return Array.from(map.values()).sort((a,b)=>(b.lastReadAt||b.updatedAt||0)-(a.lastReadAt||a.updatedAt||0));
  }

  function persistLibrary(uid, items){
    uid = String(uid||'').trim();
    if (!uid) return [];
    const clean = (items || []).map(x => ({
      uid,
      manhwaId: String(x.manhwaId || '').trim(),
      state: x.state || 'saved',
      favorite: !!x.favorite,
      progress: Math.max(0, Number(x.progress || 0) || 0),
      lastChapterId: x.lastChapterId || '',
      lastReadAt: Number(x.lastReadAt || 0) || 0,
      updatedAt: Number(x.updatedAt || Date.now()) || Date.now()
    })).filter(x => x.manhwaId);
    try{
      localStorage.setItem('azura_library_' + uid, JSON.stringify(clean));
      localStorage.setItem('azura_feature_library_' + uid, JSON.stringify(clean));
      const globalRows = read('azura_library', []).filter(x => !uidEq(x.uid, uid)).concat(clean);
      localStorage.setItem('azura_library', JSON.stringify(globalRows));
    }catch(_){}
    const cur = current();
    if (cur && uidEq(cur.uid, uid)) {
      cur.library = clean.map(x => x.manhwaId);
      setCurrent(cur);
    }
    return clean;
  }

  function upsertLibrary(uid, patch){
    if (!uid || !patch || !patch.manhwaId) return;
    const rows = mergedLibrary(uid);
    const idx = rows.findIndex(x => String(x.manhwaId) === String(patch.manhwaId));
    const base = idx >= 0 ? rows[idx] : { uid, manhwaId:String(patch.manhwaId), state:'saved', favorite:false, progress:0, lastChapterId:'', lastReadAt:0, updatedAt:0 };
    const next = { ...base, ...patch, uid, manhwaId:String(patch.manhwaId), updatedAt:Date.now() };
    next.progress = Math.max(Number(base.progress||0), Number(next.progress||0));
    if (Number(next.progress||0) >= 96 && next.state !== 'completed') next.state = 'completed';
    if (idx >= 0) rows[idx] = next; else rows.unshift(next);
    persistLibrary(uid, rows);
  }

  function statsForUser(user){
    if (!user) return { saved:0, reading:0, completed:0, coins:0, vip:false, uid:'' };
    const items = mergedLibrary(user.uid);
    return {
      uid: user.uid,
      saved: items.length,
      reading: items.filter(x => x.state === 'reading' || x.state === 'completed' || Number(x.progress||0) > 0 || x.lastChapterId).length,
      completed: items.filter(x => x.state === 'completed' || Number(x.progress||0) >= 96).length,
      coins: Number(user.coins || 0) || 0,
      vip: !!user.vip,
      role: roleOf(user)
    };
  }

  function syncCurrentStats(){
    const cur = current();
    if (!cur) return { saved:0, reading:0, completed:0, coins:0, vip:false, uid:'' };
    const s = statsForUser(cur);
    cur.library = mergedLibrary(cur.uid).map(x => x.manhwaId);
    cur.read = s.reading;
    cur.coins = s.coins;
    setCurrent(cur);
    const rows = users();
    const idx = rows.findIndex(x => uidEq(x.uid, cur.uid));
    if (idx >= 0) {
      rows[idx] = { ...rows[idx], ...cur };
      saveUsers(rows);
    }
    return s;
  }

  function refreshStatsUI(){
    const s = syncCurrentStats();
    ['sidebar-coins','d-coins','d-coins-disc','d-coins-lib','d-coins-shop','p-coins'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = Number(s.coins || 0).toLocaleString();
    });
    const pSaved = document.getElementById('p-saved'); if (pSaved) pSaved.textContent = s.saved;
    const pRead = document.getElementById('p-read'); if (pRead) pRead.textContent = s.reading;
    $$('.qs-item, .profile-stat-cell, .home-stat-card, .stat-card, .uztop-stat').forEach(card => {
      const txt = (card.textContent || '').toLowerCase();
      const val = card.querySelector('.qs-val, .profile-stat-cell-val, .home-stat-value, .stat-value, .uztop-stat-value');
      if (!val) return;
      if (txt.includes('kutub')) val.textContent = s.saved;
      else if (txt.includes("o'q") || txt.includes('oqil') || txt.includes('o‘q')) val.textContent = s.reading;
      else if (txt.includes('coin')) val.textContent = Number(s.coins || 0).toLocaleString();
      else if (txt.includes('status')) val.innerHTML = s.vip ? '<span class="qs-vip-badge">👑 VIP</span>' : '<button class="qs-vip-cta" onclick="navigate(\'vip\')">+ VIP</button>';
    });
  }

  function patchHomeQuickStats(){
    if (typeof window.renderHomeQuickStats !== 'function' || typeof window.ensureHomeStripEl !== 'function') return;
    window.renderHomeQuickStats = function(){
      const cur = current();
      if (!cur) { if (typeof window.hideHomeStrip === 'function') window.hideHomeStrip('home-quick-stats-wrap'); return; }
      const s = syncCurrentStats();
      const wrap = window.ensureHomeStripEl('home-quick-stats-wrap', 0);
      if (!wrap) return;
      const vipBadge = s.vip ? '<span class="qs-vip-badge">👑 VIP</span>' : '<button class="qs-vip-cta" onclick="navigate(\'vip\')">+ VIP</button>';
      wrap.innerHTML = `
        <div class="quick-stats-bar azv7-quick-stats">
          <div class="qs-item" onclick="navigate('library')">
            <div class="qs-icon">📚</div>
            <div class="qs-val">${s.saved}</div>
            <div class="qs-label">Kutubxona</div>
          </div>
          <div class="qs-item" onclick="navigate('library')">
            <div class="qs-icon">✓</div>
            <div class="qs-val">${s.reading}</div>
            <div class="qs-label">O'qilgan</div>
          </div>
          <div class="qs-item" onclick="navigate('coinshop')">
            <div class="qs-icon">🪙</div>
            <div class="qs-val">${Number(s.coins || 0).toLocaleString()}</div>
            <div class="qs-label">Coin</div>
          </div>
          <div class="qs-item">
            <div class="qs-icon">⭐</div>
            <div class="qs-val">${vipBadge}</div>
            <div class="qs-label">Status</div>
          </div>
        </div>`;
    };
  }

  function findManhwaById(id){
    if (window.AZURA_STORE && typeof window.AZURA_STORE.findManhwa === 'function') {
      const found = window.AZURA_STORE.findManhwa(id);
      if (found) return found;
    }
    const all = [];
    if (Array.isArray(window.MANHWA_DATA)) all.push(...window.MANHWA_DATA);
    if (Array.isArray(window.AZURA_CATALOG)) all.push(...window.AZURA_CATALOG);
    try { if (typeof window.getAdultContent === 'function') all.push(...(window.getAdultContent() || [])); } catch(_){}
    return all.find(x => String(x.id) === String(id)) || null;
  }

  function chapterMetaMap(){
    const rows = read('azura_chapters_pending', []);
    const map = new Map();
    (Array.isArray(rows) ? rows : []).forEach(ch => { if (ch && ch.id) map.set(String(ch.id), ch); });
    return map;
  }

  window.azuContinueLibrary = function(manhwaId, chapterId){
    if (typeof window.openManhwa === 'function') window.openManhwa(manhwaId);
    if (!chapterId) return;
    var tries = 0;
    var timer = setInterval(function(){
      tries += 1;
      if (typeof window.openChapter === 'function') {
        clearInterval(timer);
        try { window.openChapter(chapterId); } catch(_){}
        return;
      }
      if (tries >= 12) clearInterval(timer);
    }, 120);
  };

  function patchRenderLibrary(){
    window.renderLibrary = function(){
      const ll = document.getElementById('library-list');
      if (!ll) return;
      const cur = current();
      const guest = document.getElementById('library-guest');
      if (!cur) { if (guest) guest.style.display = ''; ll.innerHTML = ''; return; }
      if (guest) guest.style.display = 'none';
      const items = mergedLibrary(cur.uid);
      if (!items.length) {
        ll.innerHTML = '<div class="azv7-lib-empty"><div class="azv7-lib-empty-icon">📚</div><div class="azv7-lib-empty-title">Kutubxona bo'sh</div><div class="azv7-lib-empty-sub">Saqlangan yoki o'qilgan manhwalar shu yerda ko'rinadi.</div></div>';
        return;
      }
      const chMap = chapterMetaMap();
      const progressMap = read('azura_reading_progress_' + cur.uid, {});
      const renderItem = function(item){
        const m = findManhwaById(item.manhwaId);
        if (!m) return '';
        const progressRow = progressMap && progressMap[item.manhwaId] ? progressMap[item.manhwaId] : null;
        const pct = Math.max(0, Math.min(100, Math.round(Number(progressRow && progressRow.percent != null ? progressRow.percent : item.progress || 0))));
        const effectiveChapterId = String((item.lastChapterId || (progressRow && progressRow.chapterId) || '')).trim();
        const ch = effectiveChapterId ? chMap.get(effectiveChapterId) : null;
        const chapterLabel = ch && ch.number ? ('Bob ' + ch.number) : (progressRow && progressRow.chapterNumber ? ('Bob ' + progressRow.chapterNumber) : 'Saqlangan');
        const readText = item.state === 'completed'
          ? 'Tugallangan'
          : (effectiveChapterId ? ('So'nggi: ' + chapterLabel + (pct > 0 ? (' · ' + pct + '%') : '')) : (pct > 0 ? (pct + '% o'qilgan') : 'Saqlangan'));
        const cta = effectiveChapterId ? '▶ Davom etish' : '📖 Ochish';
        const coverSrc = (typeof window.azuraGetOptimizedCoverSrc === 'function')
          ? window.azuraGetOptimizedCoverSrc(m.cover || m.poster || m.image || '')
          : (m.cover || m.poster || m.image || '');
        return `
          <article class="lib-item azv7-lib-item" onclick="azuContinueLibrary('${esc(item.manhwaId)}','${esc(effectiveChapterId)}')">
            <div class="lib-cover azv7-lib-cover">${coverSrc ? `<img src="${coverSrc}" alt="${esc(m.title || '')}" loading="lazy" decoding="async"/>` : '📖'}</div>
            <div class="lib-info azv7-lib-info">
              <div class="lib-title azv7-lib-title">${esc(m.title || '')}</div>
              <div class="lib-progress azv7-lib-progress">${readText}</div>
              <div class="lib-progress-bar azv7-lib-progress-bar"><div class="lib-progress-fill" style="width:${Math.max(6, pct || (item.state==='saved'?8:12))}%"></div></div>
              <div class="lib-continue azv7-lib-continue">${cta}</div>
            </div>
            <div class="azv7-lib-state ${item.state}">${item.state === 'completed' ? '✓' : item.state === 'reading' ? '⟳' : '★'}</div>
          </article>`;
      };
      if (typeof window.azuraAppendHtmlInChunks === 'function') {
        window.azuraAppendHtmlInChunks(ll, items, renderItem, { kind: 'library', key: 'lib|' + cur.uid + '|' + items.length });
      } else {
        ll.innerHTML = items.map(renderItem).join('');
      }
    };
  }

  function patchLibraryActions(){
    if (typeof window.addToLibrary === 'function' && !window.addToLibrary.__azv7) {
      const orig = window.addToLibrary;
      const wrapped = function(){
        const res = orig.apply(this, arguments);
        const cur = current();
        const manhwaId = String((window.currentManhwa && window.currentManhwa.id) || arguments[0] || '').trim();
        if (cur && manhwaId) {
          setTimeout(() => {
            upsertLibrary(cur.uid, { manhwaId, state:'saved' });
            refreshStatsUI();
            if ((window.currentPage || '') === 'library') window.renderLibrary && window.renderLibrary();
          }, 120);
        }
        return res;
      };
      wrapped.__azv7 = true;
      window.addToLibrary = wrapped;
    }
    if (typeof window.saveReadingProgress === 'function' && !window.saveReadingProgress.__azv7) {
      const orig = window.saveReadingProgress;
      const wrapped = function(percent){
        const res = orig.apply(this, arguments);
        const cur = current();
        const chapterId = window.currentChapter && window.currentChapter.id;
        const manhwaId = (window.currentManhwa && window.currentManhwa.id) || (window.currentChapter && window.currentChapter.manhwaId) || '';
        if (cur && manhwaId) {
          upsertLibrary(cur.uid, {
            manhwaId,
            state: Number(percent||0) >= 96 ? 'completed' : 'reading',
            progress: Number(percent || 0),
            lastChapterId: chapterId || '',
            lastReadAt: Date.now()
          });
        }
        setTimeout(() => refreshStatsUI(), 80);
        return res;
      };
      wrapped.__azv7 = true;
      window.saveReadingProgress = wrapped;
    }
    if (typeof window.openChapter === 'function' && !window.openChapter.__azv7) {
      const orig = window.openChapter;
      const wrapped = function(chapterId){
        const res = orig.apply(this, arguments);
        const cur = current();
        if (cur) {
          const ch = chapterMetaMap().get(String(chapterId)) || {};
          const manhwaId = String(ch.manhwaId || (window.currentManhwa && window.currentManhwa.id) || '').trim();
          if (manhwaId) upsertLibrary(cur.uid, { manhwaId, state:'reading', progress:1, lastChapterId:chapterId, lastReadAt:Date.now() });
        }
        setTimeout(() => refreshStatsUI(), 120);
        return res;
      };
      wrapped.__azv7 = true;
      window.openChapter = wrapped;
    }
  }

  function userCard(u){
    const role = roleOf(u);
    const blocked = isBlocked(u);
    const us = statsForUser(u);
    return `
      <article class="azu-user-card ${blocked ? 'is-blocked' : ''}">
        <div class="azu-user-top">
          <div class="azu-avatar">${esc((u.username || '?').slice(0,1).toUpperCase())}</div>
          <div class="azu-user-main">
            <strong>${esc(u.username || 'No name')}</strong>
            <span>${esc(u.email || '—')}</span>
            <code>${esc(u.uid || '—')}</code>
          </div>
          <div class="azu-role ${role}">${role.toUpperCase()}</div>
        </div>
        <div class="azu-chipline">
          <span>🪙 ${Number(u.coins || 0).toLocaleString()}</span>
          <span>📚 ${us.saved} kutubxona</span>
          <span>✓ ${us.reading} o'qilgan</span>
          <span>${u.vip ? '👑 VIP' : 'VIP yo‘q'}</span>
          <span>${blocked ? 'BLOK' : 'Faol'}</span>
        </div>
        <div class="azu-coin-row">
          <input type="number" min="0" value="${Number(u.coins || 0)}" onchange="azuSetCoins('${esc(u.uid)}', this.value)">
          <button onclick="azuAddCoins('${esc(u.uid)}', 100)">+100</button>
          <button onclick="azuAddCoins('${esc(u.uid)}', 1000)">+1000</button>
          <button onclick="azuAddCoins('${esc(u.uid)}', -100)">-100</button>
        </div>
        <div class="azu-user-actions">
          <button onclick="azuToggleVip('${esc(u.uid)}')">${u.vip ? 'VIP ol' : 'VIP ber'}</button>
          ${uidEq(u.uid, 'AZR-YJTF-QYGT') ? '' : `<button onclick="azuToggleAdmin('${esc(u.uid)}')">${role === 'admin' ? 'Admin ol' : 'Admin ber'}</button>`}
          ${uidEq(u.uid, 'AZR-YJTF-QYGT') ? '' : `<button class="danger" onclick="azuToggleBlock('${esc(u.uid)}')">${blocked ? 'Tiklash' : 'Blok'}</button>`}
        </div>
      </article>`;
  }

  function patchUser(uid, updater){
    uid = String(uid || '').trim();
    if (!uid) return window.showToast && window.showToast('UID kerak');
    const rows = users();
    const idx = rows.findIndex(u => uidEq(u.uid, uid));
    if (idx < 0) return window.showToast && window.showToast('UID topilmadi');
    updater(rows[idx]);
    rows[idx].updatedAt = Date.now();
    saveUsers(rows);
    const cur = current();
    if (cur && uidEq(cur.uid, uid)) { setCurrent(rows[idx]); refreshStatsUI(); if (typeof window.updateUI === 'function') window.updateUI(); }
    renderUsersSection(document.getElementById('azu-user-search')?.value || '');
  }
  window.azuSetCoins = (uid,val) => patchUser(uid, u => u.coins = Math.max(0, Number(val || 0)));
  window.azuAddCoins = (uid,delta) => patchUser(uid, u => u.coins = Math.max(0, Number(u.coins || 0) + Number(delta || 0)));
  window.azuToggleVip = uid => patchUser(uid, u => u.vip = !u.vip);
  window.azuToggleAdmin = uid => patchUser(uid, u => { if (!uidEq(u.uid, 'AZR-YJTF-QYGT')) u.role = roleOf(u) === 'admin' ? 'user' : 'admin'; });
  window.azuToggleBlock = uid => patchUser(uid, u => {
    if (uidEq(u.uid, 'AZR-YJTF-QYGT')) return;
    u.extra = { ...(u.extra || {}) };
    if (isBlocked(u)) { u.extra.deletedAt = 0; u.extra.deletedReason = ''; }
    else { u.extra.deletedAt = Date.now(); u.extra.deletedReason = 'Blocked locally'; }
  });
  window.azuQuickCoins = () => {
    const uid = (document.getElementById('azu-quick-uid')?.value || '').trim();
    const val = Number(document.getElementById('azu-quick-coins')?.value || 0);
    if (!uid || !val) return window.showToast && window.showToast('UID va coin kiriting');
    window.azuAddCoins(uid, val);
  };
  window.azuQuickVip = () => {
    const uid = (document.getElementById('azu-quick-uid')?.value || '').trim();
    if (!uid) return window.showToast && window.showToast('UID kiriting');
    patchUser(uid, u => u.vip = true);
  };
  window.azuQuickAdmin = () => {
    const uid = (document.getElementById('azu-quick-uid')?.value || '').trim();
    if (!uid) return window.showToast && window.showToast('UID kiriting');
    patchUser(uid, u => { if (!uidEq(u.uid, 'AZR-YJTF-QYGT')) u.role = 'admin'; });
  };

  function renderUsersSection(query=''){
    const box = document.getElementById('admin-main-content') || document.querySelector('.admin-main');
    if (!box) return;
    const rows = users();
    const q = String(query || '').trim().toLowerCase();
    const filtered = rows.filter(u => !q || [u.username, u.email, u.uid, roleOf(u)].some(v => String(v || '').toLowerCase().includes(q)));
    const totalCoins = rows.reduce((s,u)=>s + Number(u.coins || 0), 0);
    box.innerHTML = `
      <section class="azu-users-v6">
        <div class="azu-head">
          <div>
            <div class="azu-kicker">LOCAL BOSHQARUV</div>
            <h2>Foydalanuvchilar</h2>
            <p>Coin, VIP, admin, bloklash va real kutubxona/o'qilgan statistikasi bitta panelda.</p>
          </div>
          <div class="azu-stats">
            <div><b>${rows.length}</b><span>User</span></div>
            <div><b>${rows.filter(u=>!!u.vip).length}</b><span>VIP</span></div>
            <div><b>${rows.filter(u=>['admin','owner'].includes(roleOf(u))).length}</b><span>Admin</span></div>
            <div><b>${rows.filter(isBlocked).length}</b><span>Blok</span></div>
            <div><b>${totalCoins.toLocaleString()}</b><span>Coin</span></div>
          </div>
        </div>
        <div class="azu-toolbar">
          <input id="azu-user-search" placeholder="UID, username yoki email qidirish..." value="${esc(query)}">
          <div class="azu-quick-actions">
            <input id="azu-quick-uid" placeholder="UID">
            <input id="azu-quick-coins" type="number" min="0" placeholder="Coin">
            <button onclick="azuQuickCoins()">Coin ber</button>
            <button onclick="azuQuickVip()">VIP ber</button>
            <button onclick="azuQuickAdmin()">Admin ber</button>
          </div>
        </div>
        <div class="azu-user-grid">
          ${filtered.length ? filtered.map(userCard).join('') : '<div class="azu-empty">Foydalanuvchi topilmadi</div>'}
        </div>
      </section>`;
    const input = document.getElementById('azu-user-search');
    if (input) input.addEventListener('input', e => renderUsersSection(e.target.value), { once:true });
  }

  function patchAdminUsers(){
    const oldRenderAdmin = window.renderAdmin;
    window.renderAdmin = function(section){
      if (section === 'users') return renderUsersSection();
      return typeof oldRenderAdmin === 'function' ? oldRenderAdmin.apply(this, arguments) : undefined;
    };
    const oldAdminNav = window.adminNav;
    window.adminNav = function(el, section){
      if (section === 'users') {
        $$('.admin-nav-item').forEach(n => n.classList.remove('active'));
        if (el) el.classList.add('active');
        renderUsersSection();
        return;
      }
      return typeof oldAdminNav === 'function' ? oldAdminNav.apply(this, arguments) : undefined;
    };
    window.filterUsers = renderUsersSection;
  }

  function decorateChapterList(){
    const list = document.getElementById('chapter-list');
    if (!list) return;
    list.classList.add('azv7-chapter-list');
    $$('.chapter-item', list).forEach(card => {
      card.classList.add('azv7-chapter-card');
      const txt = (card.textContent || '').toLowerCase();
      if (card.querySelector('.chapter-lock') || txt.includes('coin')) card.classList.add('is-premium');
      if (txt.includes('vip')) card.classList.add('is-vip');
      if (txt.includes('ochiq') || txt.includes('bepul')) card.classList.add('is-open');
    });
  }

  function patchDetail(){
    if (typeof window.renderChapters === 'function' && !window.renderChapters.__azv7) {
      const orig = window.renderChapters;
      const wrapped = function(){ const res = orig.apply(this, arguments); setTimeout(decorateChapterList, 60); return res; };
      wrapped.__azv7 = true;
      window.renderChapters = wrapped;
    }
    if (typeof window.openManhwa === 'function' && !window.openManhwa.__azv7) {
      const orig = window.openManhwa;
      const wrapped = function(){ const res = orig.apply(this, arguments); setTimeout(() => { decorateChapterList(); refreshStatsUI(); }, 220); return res; };
      wrapped.__azv7 = true;
      window.openManhwa = wrapped;
    }
  }

  function patchUpdateUI(){
    if (typeof window.updateUI === 'function' && !window.updateUI.__azv7) {
      const orig = window.updateUI;
      const wrapped = function(){
        const res = orig.apply(this, arguments);
        setTimeout(() => {
          refreshStatsUI();
          if ((window.currentPage || '') === 'library' && typeof window.renderLibrary === 'function') window.renderLibrary();
          if (typeof window.renderHomeQuickStats === 'function') window.renderHomeQuickStats();
          decorateChapterList();
        }, 80);
        return res;
      };
      wrapped.__azv7 = true;
      window.updateUI = wrapped;
    }
    if (typeof window.navigate === 'function' && !window.navigate.__azv7local) {
      const orig = window.navigate;
      const wrapped = function(page){
        const res = orig.apply(this, arguments);
        setTimeout(() => {
          refreshStatsUI();
          if (page === 'library' && typeof window.renderLibrary === 'function') window.renderLibrary();
          if (page === 'home' && typeof window.renderHomeQuickStats === 'function') window.renderHomeQuickStats();
          if (page === 'detail') decorateChapterList();
        }, 140);
        return res;
      };
      wrapped.__azv7local = true;
      window.navigate = wrapped;
    }
  }

  function init(){
    patchHomeQuickStats();
    patchRenderLibrary();
    patchLibraryActions();
    patchAdminUsers();
    patchDetail();
    patchUpdateUI();
    window.azuraRefreshRuntimeHooks = function(){
      patchRenderLibrary();
      patchLibraryActions();
      patchDetail();
      patchUpdateUI();
      refreshStatsUI();
      try { if (typeof window.renderLibrary === 'function' && (window.currentPage || '') === 'library') window.renderLibrary(); } catch(_){}
      try { decorateChapterList(); } catch(_){}
    };
    refreshStatsUI();
    try { if (typeof window.renderHomeQuickStats === 'function') window.renderHomeQuickStats(); } catch(_){}
    try { if ((window.currentPage || '') === 'library' && typeof window.renderLibrary === 'function') window.renderLibrary(); } catch(_){}
    decorateChapterList();
    window.addEventListener('storage', () => setTimeout(() => { refreshStatsUI(); if (typeof window.renderLibrary === 'function') window.renderLibrary(); decorateChapterList(); }, 120));
    window.addEventListener('azura:bundle-loaded', () => setTimeout(() => { if (typeof window.azuraRefreshRuntimeHooks === 'function') window.azuraRefreshRuntimeHooks(); }, 40));
    scheduleUiRefresh(7000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();


/* AZURA v8 reader/library rescue: handles async openChapter and legacy local formats. */
(function(){
  'use strict';
  const read = (k,d)=>{ try{ const v=localStorage.getItem(k); return v?JSON.parse(v):d; }catch(_){ return d; } };
  const current = ()=> read('azura_current_user', null) || read('azura_current', null) || window.currentUser || null;
  function chapterById(id){
    if (window.AZURA_STORE && typeof window.AZURA_STORE.chapters === 'function') return (window.AZURA_STORE.chapters() || []).find(x => String(x.id) === String(id));
    return (read('azura_chapters_pending', []) || []).find(x => String(x.id) === String(id));
  }
  function markRead(chapterId){
    try{
      const u = current(); if (!u || !u.uid) return;
      const ch = chapterById(chapterId) || window.currentChapter || {};
      const manhwaId = String(ch.manhwaId || (window.currentManhwa && window.currentManhwa.id) || '').trim();
      if (!manhwaId) return;
      const item = { manhwaId, state:'reading', progress:Math.max(1, Number(ch.progress || 1)), lastChapterId:chapterId || ch.id || '', lastReadAt:Date.now() };
      if (window.AZURA_STORE && typeof window.AZURA_STORE.upsertLibrary === 'function') window.AZURA_STORE.upsertLibrary(u.uid, item);
    }catch(_){}
  }
  function install(){
    if (typeof window.openChapter === 'function' && !window.openChapter.__azv8_async_rescue) {
      const orig = window.openChapter;
      const wrapped = function(chapterId){
        const res = orig.apply(this, arguments);
        [60, 260, 800].forEach(ms => setTimeout(() => markRead(chapterId), ms));
        return res;
      };
      wrapped.__azv8_async_rescue = true;
      window.openChapter = wrapped;
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
})();