/* AZURA Cloudflare Worker — implements the API contract used by
   js/azura-adapter-v9.js remoteAdapter, plus R2 media serving.

   Bindings expected (wrangler.toml):
   - DB     : D1 database (azura)
   - MEDIA  : R2 bucket (azura-media)
   - ASSETS : Pages assets / static (auto when deployed via Pages)

   Routes:
   GET  /api/health
   GET  /api/catalog                       -> all manhwa
   GET  /api/catalog/:id
   GET  /api/users
   POST /api/users          {user}        -> upsert
   PATCH/api/users          {uid, action, ...}
   GET  /api/auth                          -> current user (cookie session)
   POST /api/auth/login     {uid}
   POST /api/auth/logout
   GET  /api/library?uid
   POST /api/library        {uid, item}
   GET  /api/library/stats?uid
   GET  /api/progress?uid
   POST /api/progress       {uid, entry}
   GET  /api/chapters[?manhwaId]
   POST /api/chapters       {rows}
   POST /api/chapters/patch {chapter}
   POST /api/chapters/delete{id}
   GET  /api/media
   POST /api/media          {asset}        -> stores metadata + uploads to R2 if dataUrl present
   GET  /media/<key>                       -> stream from R2

   Everything else: passthrough to static assets.
*/

const json = (data, init = {}) => new Response(JSON.stringify(data), {
  ...init,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...(init.headers || {})
  }
});
const err = (msg, status = 400) => json({ error: msg }, { status });

const now = () => Date.now();
const rid = () => Math.random().toString(36).slice(2, 10);

const SESSION_COOKIE = 'azura_session';
const SESSION_TTL = 30 * 24 * 60 * 60 * 1000; // 30d
const OWNER_UID = 'AZR-YJTF-QYGT';

function parseCookie(req) {
  const out = {};
  const c = req.headers.get('cookie') || '';
  c.split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i < 0) return;
    out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

function setCookie(name, value, opts = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push('Path=/');
  parts.push('HttpOnly');
  parts.push('Secure');
  parts.push('SameSite=Lax');
  if (opts.maxAge) parts.push(`Max-Age=${Math.floor(opts.maxAge / 1000)}`);
  return parts.join('; ');
}

async function getSessionUser(env, req) {
  const token = parseCookie(req)[SESSION_COOKIE];
  if (!token) return null;
  const row = await env.DB.prepare(
    'SELECT s.uid AS uid, u.username AS username, u.email AS email, u.role AS role, u.vip AS vip, u.coins AS coins, u.avatar AS avatar, u.extra_json AS extra_json, u.created_at AS created_at, u.updated_at AS updated_at FROM sessions s JOIN users u ON u.uid = s.uid WHERE s.token = ?1 AND s.expires_at > ?2'
  ).bind(token, now()).first();
  return row ? rowToUser(row) : null;
}

function rowToUser(r) {
  if (!r) return null;
  let extra = {};
  try { extra = JSON.parse(r.extra_json || '{}'); } catch (_) { }
  return {
    uid: r.uid,
    username: r.username || 'AZURA User',
    email: r.email || '',
    role: r.uid === OWNER_UID ? 'owner' : (r.role || 'user'),
    vip: !!r.vip,
    coins: Number(r.coins || 0),
    avatar: r.avatar || '',
    extra,
    createdAt: Number(r.created_at || now()),
    updatedAt: Number(r.updated_at || now())
  };
}
function userToRow(u) {
  return {
    uid: String(u.uid || '').toUpperCase(),
    username: String(u.username || 'AZURA User'),
    email: String(u.email || ''),
    role: String(u.role || 'user'),
    vip: u.vip ? 1 : 0,
    coins: Math.max(0, Number(u.coins || 0)),
    provider: String(u.provider || 'local'),
    avatar: String(u.avatar || ''),
    extra_json: JSON.stringify(u.extra || {}),
    created_at: Number(u.createdAt || now()),
    updated_at: now()
  };
}

// ---- Routes -----------------------------------------------------------------
async function api(env, req, url) {
  const p = url.pathname;
  const m = req.method;

  if (p === '/api/health') return json({ ok: true, time: now() });

  if (p === '/api/catalog' && m === 'GET') {
    const r = await env.DB.prepare(
      'SELECT id,title,status,type,genres_json,rating,views,cover,description,is_adult FROM manhwa ORDER BY updated_at DESC'
    ).all();
    const items = (r.results || []).map(x => ({
      id: x.id, title: x.title, status: x.status, type: x.type,
      genres: JSON.parse(x.genres_json || '[]'),
      rating: Number(x.rating || 0), views: Number(x.views || 0),
      cover: x.cover, description: x.description, isAdult: !!x.is_adult
    }));
    return json({ items });
  }
  if (p.startsWith('/api/catalog/') && m === 'GET') {
    const id = decodeURIComponent(p.slice('/api/catalog/'.length));
    const x = await env.DB.prepare('SELECT * FROM manhwa WHERE id = ?1').bind(id).first();
    if (!x) return err('not found', 404);
    return json({
      item: {
        id: x.id, title: x.title, status: x.status, type: x.type,
        genres: JSON.parse(x.genres_json || '[]'),
        rating: Number(x.rating || 0), views: Number(x.views || 0),
        cover: x.cover, description: x.description, isAdult: !!x.is_adult
      }
    });
  }

  // ---- Users
  if (p === '/api/users' && m === 'GET') {
    const r = await env.DB.prepare('SELECT * FROM users ORDER BY created_at DESC').all();
    return json({ users: (r.results || []).map(rowToUser) });
  }
  if (p === '/api/users' && m === 'POST') {
    const body = await req.json().catch(() => ({}));
    const u = userToRow(body);
    if (!u.uid) return err('uid required');
    await env.DB.prepare(
      'INSERT INTO users (uid,username,email,role,vip,coins,provider,avatar,extra_json,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11) ON CONFLICT(uid) DO UPDATE SET username=excluded.username,email=excluded.email,role=excluded.role,vip=excluded.vip,coins=excluded.coins,avatar=excluded.avatar,extra_json=excluded.extra_json,updated_at=excluded.updated_at'
    ).bind(u.uid, u.username, u.email, u.role, u.vip, u.coins, u.provider, u.avatar, u.extra_json, u.created_at, u.updated_at).run();
    const fresh = await env.DB.prepare('SELECT * FROM users WHERE uid=?1').bind(u.uid).first();
    return json({ user: rowToUser(fresh) });
  }
  if (p === '/api/users' && m === 'PATCH') {
    const body = await req.json().catch(() => ({}));
    const uid = String(body.uid || '').toUpperCase();
    if (!uid) return err('uid required');
    const u = await env.DB.prepare('SELECT * FROM users WHERE uid=?1').bind(uid).first();
    if (!u) return err('user not found', 404);
    const action = body.action;
    if (uid === OWNER_UID && (action === 'role' || action === 'softDelete')) return json({ user: rowToUser(u) });
    if (action === 'coins') {
      await env.DB.prepare('UPDATE users SET coins=?2, updated_at=?3 WHERE uid=?1').bind(uid, Math.max(0, Number(body.coins || 0)), now()).run();
    } else if (action === 'vip') {
      await env.DB.prepare('UPDATE users SET vip=?2, updated_at=?3 WHERE uid=?1').bind(uid, body.vip ? 1 : 0, now()).run();
    } else if (action === 'role') {
      await env.DB.prepare('UPDATE users SET role=?2, updated_at=?3 WHERE uid=?1').bind(uid, String(body.role || 'user'), now()).run();
    } else if (action === 'softDelete') {
      const extra = JSON.parse(u.extra_json || '{}');
      extra.deletedAt = now();
      extra.deletedReason = String(body.reason || 'Blocked');
      await env.DB.prepare('UPDATE users SET extra_json=?2, updated_at=?3 WHERE uid=?1').bind(uid, JSON.stringify(extra), now()).run();
    } else if (action === 'restore') {
      const extra = JSON.parse(u.extra_json || '{}');
      extra.deletedAt = 0; extra.deletedReason = '';
      await env.DB.prepare('UPDATE users SET extra_json=?2, updated_at=?3 WHERE uid=?1').bind(uid, JSON.stringify(extra), now()).run();
    } else return err('unknown action');
    const fresh = await env.DB.prepare('SELECT * FROM users WHERE uid=?1').bind(uid).first();
    return json({ user: rowToUser(fresh) });
  }

  // ---- Auth
  if (p === '/api/auth' && m === 'GET') {
    const u = await getSessionUser(env, req);
    return json({ user: u });
  }
  if (p === '/api/auth/login' && m === 'POST') {
    const body = await req.json().catch(() => ({}));
    const uid = String(body.uid || '').toUpperCase();
    if (!uid) return err('uid required');
    const u = await env.DB.prepare('SELECT * FROM users WHERE uid=?1').bind(uid).first();
    if (!u) return err('user not found', 404);
    const token = crypto.randomUUID().replace(/-/g, '');
    const exp = now() + SESSION_TTL;
    await env.DB.prepare(
      'INSERT INTO sessions (token,uid,created_at,expires_at,user_agent,ip) VALUES (?1,?2,?3,?4,?5,?6)'
    ).bind(token, uid, now(), exp, req.headers.get('user-agent') || '', req.headers.get('cf-connecting-ip') || '').run();
    return json({ user: rowToUser(u) }, {
      headers: { 'set-cookie': setCookie(SESSION_COOKIE, token, { maxAge: SESSION_TTL }) }
    });
  }
  if (p === '/api/auth/logout' && m === 'POST') {
    const token = parseCookie(req)[SESSION_COOKIE];
    if (token) await env.DB.prepare('DELETE FROM sessions WHERE token=?1').bind(token).run();
    return json({ ok: true }, {
      headers: { 'set-cookie': setCookie(SESSION_COOKIE, '', { maxAge: -1000 }) }
    });
  }

  // ---- Library
  if (p === '/api/library' && m === 'GET') {
    const uid = url.searchParams.get('uid') || '';
    const r = await env.DB.prepare(
      'SELECT * FROM library WHERE uid=?1 ORDER BY last_read_at DESC, updated_at DESC'
    ).bind(uid).all();
    return json({ items: (r.results || []).map(x => ({
      uid: x.uid, manhwaId: x.manhwa_id, state: x.state, favorite: !!x.favorite,
      progress: Number(x.progress || 0), lastChapterId: x.last_chapter_id || '',
      lastReadAt: Number(x.last_read_at || 0), updatedAt: Number(x.updated_at || 0)
    })) });
  }
  if (p === '/api/library' && m === 'POST') {
    const body = await req.json().catch(() => ({}));
    const uid = String(body.uid || '').toUpperCase();
    const it = body.item || {};
    if (!uid || !it.manhwaId) return err('uid + manhwaId required');
    await env.DB.prepare(
      'INSERT INTO library (uid,manhwa_id,state,favorite,progress,last_chapter_id,last_read_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8) ON CONFLICT(uid,manhwa_id) DO UPDATE SET state=excluded.state,favorite=excluded.favorite,progress=excluded.progress,last_chapter_id=excluded.last_chapter_id,last_read_at=excluded.last_read_at,updated_at=excluded.updated_at'
    ).bind(uid, String(it.manhwaId), String(it.state || 'saved'), it.favorite ? 1 : 0,
      Number(it.progress || 0), String(it.lastChapterId || ''),
      Number(it.lastReadAt || 0), now()).run();
    const r = await env.DB.prepare('SELECT * FROM library WHERE uid=?1 ORDER BY last_read_at DESC').bind(uid).all();
    return json({ items: (r.results || []).map(x => ({
      uid: x.uid, manhwaId: x.manhwa_id, state: x.state, favorite: !!x.favorite,
      progress: Number(x.progress || 0), lastChapterId: x.last_chapter_id || '',
      lastReadAt: Number(x.last_read_at || 0), updatedAt: Number(x.updated_at || 0)
    })) });
  }
  if (p === '/api/library/stats' && m === 'GET') {
    const uid = url.searchParams.get('uid') || '';
    const r = await env.DB.prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN state='saved' THEN 1 ELSE 0 END) AS saved,
              SUM(CASE WHEN state='reading' THEN 1 ELSE 0 END) AS reading,
              SUM(CASE WHEN state='completed' OR progress >= 96 THEN 1 ELSE 0 END) AS completed,
              SUM(CASE WHEN favorite=1 THEN 1 ELSE 0 END) AS favorites
       FROM library WHERE uid=?1`
    ).bind(uid).first();
    return json({ stats: {
      total: Number(r.total || 0), saved: Number(r.saved || 0),
      reading: Number(r.reading || 0), completed: Number(r.completed || 0),
      favorites: Number(r.favorites || 0)
    }});
  }

  // ---- Progress
  if (p === '/api/progress' && m === 'GET') {
    const uid = url.searchParams.get('uid') || '';
    const r = await env.DB.prepare(
      'SELECT * FROM reading_progress WHERE uid=?1 ORDER BY last_read_at DESC'
    ).bind(uid).all();
    return json({ items: (r.results || []).map(x => ({
      uid: x.uid, manhwaId: x.manhwa_id, chapterId: x.chapter_id,
      percent: Number(x.percent || 0), lastRead: Number(x.last_read_at || 0)
    })) });
  }
  if (p === '/api/progress' && m === 'POST') {
    const body = await req.json().catch(() => ({}));
    const uid = String(body.uid || '').toUpperCase();
    const e = body.entry || {};
    if (!uid || !e.chapterId) return err('uid + chapterId required');
    const t = now();
    await env.DB.prepare(
      'INSERT INTO reading_progress (uid,chapter_id,manhwa_id,percent,last_read_at) VALUES (?1,?2,?3,?4,?5) ON CONFLICT(uid,chapter_id) DO UPDATE SET manhwa_id=excluded.manhwa_id,percent=excluded.percent,last_read_at=excluded.last_read_at'
    ).bind(uid, String(e.chapterId), String(e.manhwaId || ''),
      Math.max(0, Math.min(100, Number(e.percent || 0))), t).run();
    if (e.manhwaId) {
      const state = Number(e.percent || 0) >= 96 ? 'completed' : 'reading';
      await env.DB.prepare(
        'INSERT INTO library (uid,manhwa_id,state,favorite,progress,last_chapter_id,last_read_at,updated_at) VALUES (?1,?2,?3,0,?4,?5,?6,?7) ON CONFLICT(uid,manhwa_id) DO UPDATE SET state=excluded.state,progress=excluded.progress,last_chapter_id=excluded.last_chapter_id,last_read_at=excluded.last_read_at,updated_at=excluded.updated_at'
      ).bind(uid, String(e.manhwaId), state, Number(e.percent || 0), String(e.chapterId), t, t).run();
    }
    return json({ item: { uid, manhwaId: e.manhwaId || '', chapterId: e.chapterId, percent: Number(e.percent || 0), lastRead: t }});
  }

  // ---- Chapters
  if (p === '/api/chapters' && m === 'GET') {
    const manhwaId = url.searchParams.get('manhwaId');
    const r = manhwaId
      ? await env.DB.prepare('SELECT * FROM chapters WHERE manhwa_id=?1 ORDER BY chapter_no ASC').bind(manhwaId).all()
      : await env.DB.prepare('SELECT * FROM chapters ORDER BY updated_at DESC LIMIT 1000').all();
    return json({ items: (r.results || []).map(chapterRowToObj) });
  }
  if (p === '/api/chapters' && m === 'POST') {
    const body = await req.json().catch(() => ({}));
    const rows = Array.isArray(body.rows) ? body.rows : [];
    const stmts = rows.map(c => env.DB.prepare(
      'INSERT INTO chapters (id,manhwa_id,chapter_no,title,content_type,access_type,coin_price,vip_only,status,format,page_count,pdf_id,extra_json,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15) ON CONFLICT(id) DO UPDATE SET manhwa_id=excluded.manhwa_id,chapter_no=excluded.chapter_no,title=excluded.title,content_type=excluded.content_type,access_type=excluded.access_type,coin_price=excluded.coin_price,vip_only=excluded.vip_only,status=excluded.status,format=excluded.format,page_count=excluded.page_count,pdf_id=excluded.pdf_id,extra_json=excluded.extra_json,updated_at=excluded.updated_at'
    ).bind(
      String(c.id || `ch_${now()}_${rid()}`), String(c.manhwaId || ''),
      Number(c.chapterNo || c.number || 1), String(c.title || ''),
      String(c.contentType || 'manhwa'), String(c.access || c.accessType || 'free'),
      Number(c.coinPrice || c.price || 0), c.vip || c.vipOnly ? 1 : 0,
      String(c.status || 'published'), String(c.format || 'webp'),
      Number(c.pageCount || 0), c.pdfId || null,
      JSON.stringify(c.extra || {}), Number(c.createdAt || now()), now()
    ));
    if (stmts.length) await env.DB.batch(stmts);
    return json({ items: rows });
  }
  if (p === '/api/chapters/patch' && m === 'POST') {
    const c = await req.json().catch(() => ({}));
    if (!c.id) return err('id required');
    await env.DB.prepare(
      'UPDATE chapters SET manhwa_id=?2,chapter_no=?3,title=?4,access_type=?5,coin_price=?6,vip_only=?7,status=?8,format=?9,page_count=?10,extra_json=?11,updated_at=?12 WHERE id=?1'
    ).bind(
      String(c.id), String(c.manhwaId || ''), Number(c.chapterNo || c.number || 1),
      String(c.title || ''), String(c.access || c.accessType || 'free'),
      Number(c.coinPrice || c.price || 0), c.vip || c.vipOnly ? 1 : 0,
      String(c.status || 'published'), String(c.format || 'webp'),
      Number(c.pageCount || 0), JSON.stringify(c.extra || {}), now()
    ).run();
    return json({ item: c });
  }
  if (p === '/api/chapters/delete' && m === 'POST') {
    const body = await req.json().catch(() => ({}));
    if (!body.id) return err('id required');
    await env.DB.prepare('DELETE FROM chapter_pages WHERE chapter_id=?1').bind(body.id).run();
    await env.DB.prepare('DELETE FROM chapters WHERE id=?1').bind(body.id).run();
    return json({ ok: true });
  }

  // ---- Media: metadata in D1, blob in R2
  if (p === '/api/media' && m === 'GET') {
    const r = await env.DB.prepare('SELECT * FROM media_assets ORDER BY created_at DESC LIMIT 500').all();
    return json({ items: (r.results || []).map(mediaRowToObj) });
  }
  if (p === '/api/media' && m === 'POST') {
    const body = await req.json().catch(() => ({}));
    const id = String(body.id || `media_${now()}_${rid()}`);
    let r2Key = body.r2Key || body.key || '';

    // If client sent a base64 data URL, upload it to R2 right here.
    if (!r2Key && typeof body.dataUrl === 'string' && body.dataUrl.startsWith('data:')) {
      const i = body.dataUrl.indexOf(',');
      const meta = body.dataUrl.slice(0, i);
      const isB64 = /;base64$/i.test(meta);
      const payload = body.dataUrl.slice(i + 1);
      const bytes = isB64
        ? Uint8Array.from(atob(payload), c => c.charCodeAt(0))
        : new TextEncoder().encode(decodeURIComponent(payload));
      const ext = (body.mimeType || '').includes('png') ? 'png' :
                  (body.mimeType || '').includes('webp') ? 'webp' :
                  (body.mimeType || '').includes('mp4') ? 'mp4' : 'bin';
      r2Key = `${body.folder || 'uploads'}/${id}.${ext}`;
      await env.MEDIA.put(r2Key, bytes, {
        httpMetadata: { contentType: body.mimeType || 'application/octet-stream' }
      });
    }

    await env.DB.prepare(
      'INSERT INTO media_assets (id,kind,folder,filename,mime_type,size_bytes,r2_key,poster_key,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,folder=excluded.folder,filename=excluded.filename,mime_type=excluded.mime_type,size_bytes=excluded.size_bytes,r2_key=excluded.r2_key,poster_key=excluded.poster_key,updated_at=excluded.updated_at'
    ).bind(
      id, String(body.kind || 'image'), String(body.folder || ''),
      String(body.filename || ''), String(body.mimeType || ''),
      Number(body.size || 0), r2Key, String(body.posterKey || ''),
      now(), now()
    ).run();
    return json({ id, r2Key, url: r2Key ? `/media/${r2Key}` : '' });
  }

  return null; // not an API route
}

function chapterRowToObj(x) {
  let extra = {};
  try { extra = JSON.parse(x.extra_json || '{}'); } catch (_) { }
  return {
    id: x.id, manhwaId: x.manhwa_id,
    chapterNo: Number(x.chapter_no || 1), number: Number(x.chapter_no || 1),
    title: x.title || '',
    contentType: x.content_type || 'manhwa',
    access: x.access_type, accessType: x.access_type,
    price: Number(x.coin_price || 0), coinPrice: Number(x.coin_price || 0),
    vip: !!x.vip_only, vipOnly: !!x.vip_only,
    status: x.status, format: x.format,
    pageCount: Number(x.page_count || 0),
    pdfId: x.pdf_id, extra,
    createdAt: Number(x.created_at || 0), updatedAt: Number(x.updated_at || 0)
  };
}
function mediaRowToObj(x) {
  return {
    id: x.id, kind: x.kind, folder: x.folder, filename: x.filename,
    mimeType: x.mime_type, size: Number(x.size_bytes || 0),
    r2Key: x.r2_key, posterKey: x.poster_key,
    url: x.r2_key ? `/media/${x.r2_key}` : '',
    createdAt: Number(x.created_at || 0), updatedAt: Number(x.updated_at || 0)
  };
}

// ---- R2 media handler -------------------------------------------------------
async function media(env, req, url) {
  const key = decodeURIComponent(url.pathname.slice('/media/'.length));
  if (!key) return err('key required', 400);
  const obj = await env.MEDIA.get(key);
  if (!obj) return err('not found', 404);
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  return new Response(obj.body, { headers });
}

// ---- Worker entry -----------------------------------------------------------
export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);

    // Health-check / API
    if (url.pathname.startsWith('/api/')) {
      try {
        const out = await api(env, req, url);
        if (out) return out;
        return err('not found', 404);
      } catch (e) {
        console.error('[worker]', e);
        return err(e.message || 'server error', 500);
      }
    }
    if (url.pathname.startsWith('/media/')) {
      try { return await media(env, req, url); }
      catch (e) { return err(e.message || 'media error', 500); }
    }

    // Static assets via Pages binding (deployment via Cloudflare Pages)
    if (env.ASSETS && typeof env.ASSETS.fetch === 'function') {
      return env.ASSETS.fetch(req);
    }
    return err('no asset binding', 500);
  }
};
