/**
 * AZURA Cloudflare Worker v17 — Production
 *
 * KEY FIXES vs v16:
 *  ✅ FIX 1 — /api/chapters: user-facing GET no longer filters by status=published
 *             by default, but now DOES filter published-only unless admin passes
 *             ?status=all. Previously no default filter = drafts visible;
 *             now default is status='published' for unauthenticated callers.
 *  ✅ FIX 2 — /api/chapters: SQL injection risk in whereStatus removed —
 *             status param now uses a proper bind variable (?2) instead of
 *             string interpolation.
 *  ✅ FIX 3 — /api/chapters/latest: scheduled chapters (scheduled_at in the
 *             future) now excluded. Were previously leaking to public feed.
 *  ✅ FIX 4 — /api/banners: removed unconditional date-range filter —
 *             newly created banners with no start_date/end_date were STILL
 *             being hidden because the WHERE clause always added both date
 *             conditions. Now date filter is opt-in via ?dated=1.
 *             Default public fetch returns all active banners regardless of
 *             whether start_date/end_date are set.
 *  ✅ FIX 5 — /api/banners: when ?active param is absent (public homepage
 *             call), active=1 is now the default filter so only live banners
 *             are returned. Previously inactive banners were shown to users
 *             unless frontend explicitly passed active=1.
 *  ✅ FIX 6 — Service-worker API caching: sw.js was putting /api/catalog,
 *             /api/chapters, /api/chapters/latest responses into RUNTIME_CACHE
 *             on every successful fetch, meaning the next offline/slow request
 *             would serve stale data. Worker now sends
 *             Cache-Control: no-store + Pragma: no-cache + Expires: 0
 *             so the SW never caches API responses (SW respects these headers
 *             when using the native fetch path).
 *  ✅ FIX 7 — /api/chapters GET now also returns `updatedAt` correctly mapped;
 *             chapterRowToObj already had it but the field wasn't being
 *             populated for the manhwaId-filtered query path.
 *  ✅ FIX 8 — Cache-Control header on json() helper upgraded from
 *             "no-store, no-cache, must-revalidate" to also include
 *             "Pragma: no-cache" and "Expires: 0" for maximum compatibility
 *             with CDN edge nodes and older proxies.
 *  ✅ FIX 9 — /media/:key R2 responses: removed "immutable" from
 *             cache-control. Covers/banners can be replaced; immutable
 *             prevented browsers from ever re-fetching updated assets.
 *             Changed to: public, max-age=3600, stale-while-revalidate=86400
 *  ✅ FIX 10— Vary: Cookie header added to all /api/* responses so that
 *             CDN/proxy layers (Cloudflare itself, any shared cache) do not
 *             serve one user's cached response to another user.
 *
 * Bindings (wrangler.toml):
 *   DB      → D1 (azura_db)
 *   MEDIA   → R2 (azura-media)
 *   ASSETS  → Pages static assets
 *   AZURA_OWNER_UID → secret
 */

// ── Helpers ──────────────────────────────────────────────────────────────────
const json = (data, init = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // FIX 8: Maximum cache busting — covers CDNs, proxies, and legacy clients.
      // Pragma + Expires are HTTP/1.0 compat; SW fetch() respects no-store.
      'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
      'pragma': 'no-cache',
      'expires': '0',
      // FIX 10: Vary on Cookie so shared caches (CF edge, any reverse proxy)
      // never serve one user's session response to another user.
      'vary': 'Cookie',
      'x-content-type-options': 'nosniff',
      ...(init.headers || {}),
    },
  });

const err  = (msg, status = 400) => json({ error: msg }, { status });
const now  = () => Date.now();
const rid  = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12);

const SESSION_COOKIE = 'azura_session';
const SESSION_TTL    = 30 * 24 * 60 * 60 * 1000; // 30 days

// ── Cookie helpers ────────────────────────────────────────────────────────────
function parseCookie(req) {
  const out = {};
  (req.headers.get('cookie') || '').split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i < 0) return;
    out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

function setCookie(name, value, opts = {}) {
  const p = [`${name}=${encodeURIComponent(value)}`, 'Path=/'];
  p.push('HttpOnly', 'Secure', 'SameSite=Strict');
  if (opts.maxAge != null) p.push(`Max-Age=${Math.floor(opts.maxAge / 1000)}`);
  return p.join('; ');
}

// ── Auth ──────────────────────────────────────────────────────────────────────
async function getSessionUser(env, req) {
  const token = parseCookie(req)[SESSION_COOKIE];
  if (!token) return null;
  const row = await env.DB.prepare(`
    SELECT s.uid, u.username, u.email, u.role, u.vip, u.coins,
           u.avatar, u.extra_json, u.created_at, u.updated_at
    FROM sessions s JOIN users u ON u.uid = s.uid
    WHERE s.token = ?1 AND s.expires_at > ?2
  `).bind(token, now()).first();
  return row ? rowToUser(row) : null;
}

const ownerUid = env => env.AZURA_OWNER_UID || 'AZR-YJTF-QYGT';

async function requireAuth(env, req) {
  const u = await getSessionUser(env, req);
  return u || err('unauthorized', 401);
}
async function requireAdmin(env, req) {
  const u = await getSessionUser(env, req);
  if (!u) return err('unauthorized', 401);
  if (u.role !== 'owner' && u.role !== 'admin') return err('forbidden', 403);
  return u;
}
async function requireOwner(env, req) {
  const u = await getSessionUser(env, req);
  if (!u) return err('unauthorized', 401);
  if (u.role !== 'owner') return err('forbidden', 403);
  return u;
}

const isErr = x => x instanceof Response;

// ── Row mappers ───────────────────────────────────────────────────────────────
function rowToUser(r) {
  let extra = {};
  try { extra = JSON.parse(r.extra_json || '{}'); } catch (_) {}
  return {
    uid: r.uid, username: r.username, email: r.email || '',
    role: r.role || 'user', vip: !!r.vip, coins: Number(r.coins || 0),
    avatar: r.avatar || '', extra,
    createdAt: Number(r.created_at || 0),
    updatedAt: Number(r.updated_at || 0),
  };
}

function userToRow(u) {
  return {
    uid: String(u.uid || '').toUpperCase(),
    username: String(u.username || ''),
    email: String(u.email || ''),
    role: String(u.role || 'user'),
    vip: u.vip ? 1 : 0,
    coins: Math.max(0, Number(u.coins || 0)),
    provider: String(u.provider || 'local'),
    avatar: String(u.avatar || ''),
    extra_json: JSON.stringify(u.extra || {}),
    created_at: Number(u.createdAt || now()),
    updated_at: now(),
  };
}

function manhwaRowToObj(x) {
  return {
    id: x.id, title: x.title, status: x.status, type: x.type,
    genres: safeJsonParse(x.genres_json, []),
    rating: Number(x.rating || 0), views: Number(x.views || 0),
    cover: x.cover || '', banner: x.banner || '',
    description: x.description || '',
    isAdult: !!x.is_adult,
    extra: safeJsonParse(x.extra_json, {}),
    createdAt: Number(x.created_at || 0),
    updatedAt: Number(x.updated_at || 0),
  };
}

function chapterRowToObj(x) {
  return {
    id: x.id, manhwaId: x.manhwa_id,
    chapterNo: Number(x.chapter_no || 1), number: Number(x.chapter_no || 1),
    title: x.title || '',
    contentType: x.content_type || 'manhwa',
    access: x.access_type, accessType: x.access_type,
    price: Number(x.coin_price || 0), coinPrice: Number(x.coin_price || 0),
    vip: !!x.vip_only, vipOnly: !!x.vip_only,
    status: x.status, format: x.format || 'webp',
    pageCount: Number(x.page_count || 0),
    pdfId: x.pdf_id || null,
    scheduledAt: x.scheduled_at || null,
    extra: safeJsonParse(x.extra_json, {}),
    createdAt: Number(x.created_at || 0),
    updatedAt: Number(x.updated_at || 0),
  };
}

function bannerRowToObj(x) {
  return {
    id: x.id, title: x.title, slot: x.slot,
    mediaType: x.media_type || 'image',
    r2Key: x.r2_key || '',
    posterKey: x.poster_key || '',
    // Serve via /media/ route
    media: x.r2_key ? `/media/${x.r2_key}` : '',
    poster: x.poster_key ? `/media/${x.poster_key}` : '',
    link: x.link || '',
    order: Number(x.display_order || 1),
    active: !!x.active,
    startDate: x.start_date || '',
    endDate: x.end_date || '',
    createdBy: x.created_by || '',
    createdAt: Number(x.created_at || 0),
    updatedAt: Number(x.updated_at || 0),
  };
}

function mediaRowToObj(x) {
  return {
    id: x.id, kind: x.kind, folder: x.folder, filename: x.filename,
    mimeType: x.mime_type, size: Number(x.size_bytes || 0),
    r2Key: x.r2_key, posterKey: x.poster_key || '',
    url: x.r2_key ? `/media/${x.r2_key}` : '',
    posterUrl: x.poster_key ? `/media/${x.poster_key}` : '',
    createdAt: Number(x.created_at || 0),
    updatedAt: Number(x.updated_at || 0),
  };
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function safeJsonParse(str, fallback) {
  try { return JSON.parse(str || null) ?? fallback; } catch (_) { return fallback; }
}

async function safeJson(req) {
  try {
    const cl = parseInt(req.headers.get('content-length') || '0', 10);
    if (cl > 52_428_800) throw new Error('payload too large'); // 50MB limit
    return await req.json();
  } catch (_) { return null; }
}

// Upload base64 dataUrl or raw bytes to R2, return r2Key
async function uploadToR2(env, { folder = 'uploads', id, ext, mimeType, bytes }) {
  const key = `${folder}/${id}.${ext}`;
  await env.MEDIA.put(key, bytes, {
    httpMetadata: { contentType: mimeType || 'application/octet-stream' },
  });
  return key;
}

function dataUrlToBytes(dataUrl) {
  const i = dataUrl.indexOf(',');
  const meta = dataUrl.slice(0, i);
  const isB64 = /;base64$/i.test(meta);
  const payload = dataUrl.slice(i + 1);
  return isB64
    ? Uint8Array.from(atob(payload), c => c.charCodeAt(0))
    : new TextEncoder().encode(decodeURIComponent(payload));
}

function mimeToExt(mime) {
  if (mime.includes('png'))  return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('jpg') || mime.includes('jpeg')) return 'jpg';
  if (mime.includes('gif'))  return 'gif';
  if (mime.includes('mp4'))  return 'mp4';
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('pdf'))  return 'pdf';
  return 'bin';
}

// ── CORS ──────────────────────────────────────────────────────────────────────
const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'access-control-allow-headers': 'content-type, authorization, cookie',
  'access-control-allow-credentials': 'true',
  'access-control-max-age': '86400',
};

function withCors(res) {
  const h = new Headers(res.headers);
  Object.entries(CORS_HEADERS).forEach(([k, v]) => h.set(k, v));
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

// ── API Routes ────────────────────────────────────────────────────────────────
async function api(env, req, url) {
  const p = url.pathname;
  const m = req.method;

  // ── Health ──────────────────────────────────────────────────────────────────
  if (p === '/api/health' && m === 'GET') {
    return json({ ok: true, time: now(), v: 'v16', runtime: env.AZURA_RUNTIME || 'production' });
  }

  // ── Auth ────────────────────────────────────────────────────────────────────
  if (p === '/api/auth' && m === 'GET') {
    const u = await getSessionUser(env, req);
    return json({ user: u });
  }

  if (p === '/api/auth/login' && m === 'POST') {
    const body = await safeJson(req) || {};
    const uid  = String(body.uid || '').toUpperCase();
    if (!uid) return err('uid required');

    // Rate limit: max 10 logins per IP per 15 min
    const clientIp = req.headers.get('cf-connecting-ip') || 'unknown';
    const rateRow = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM sessions WHERE ip = ?1 AND created_at > ?2`
    ).bind(clientIp, now() - 15 * 60 * 1000).first();
    if (rateRow && Number(rateRow.c) > 10) return err('too many login attempts', 429);

    const u = await env.DB.prepare('SELECT * FROM users WHERE uid = ?1').bind(uid).first();
    if (!u) return err('user not found', 404);

    const extra = safeJsonParse(u.extra_json, {});
    if (extra.deletedAt) return err('account blocked', 403);

    // Clean expired sessions
    await env.DB.prepare('DELETE FROM sessions WHERE uid = ?1 AND expires_at < ?2')
      .bind(uid, now()).run();

    // Limit active sessions per user
    const cnt = await env.DB.prepare('SELECT COUNT(*) AS c FROM sessions WHERE uid = ?1').bind(uid).first();
    if (cnt && cnt.c >= 20) {
      await env.DB.prepare(
        'DELETE FROM sessions WHERE uid = ?1 ORDER BY created_at ASC LIMIT 5'
      ).bind(uid).run();
    }

    const token = crypto.randomUUID().replace(/-/g, '');
    await env.DB.prepare(
      `INSERT INTO sessions (token, uid, created_at, expires_at, user_agent, ip)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
    ).bind(token, uid, now(), now() + SESSION_TTL,
      (req.headers.get('user-agent') || '').slice(0, 300),
      clientIp
    ).run();

    return json({ user: rowToUser(u) }, {
      headers: { 'set-cookie': setCookie(SESSION_COOKIE, token, { maxAge: SESSION_TTL }) },
    });
  }

  if (p === '/api/auth/logout' && m === 'POST') {
    const token = parseCookie(req)[SESSION_COOKIE];
    if (token) await env.DB.prepare('DELETE FROM sessions WHERE token = ?1').bind(token).run();
    return json({ ok: true }, {
      headers: { 'set-cookie': setCookie(SESSION_COOKIE, '', { maxAge: 0 }) },
    });
  }

  // ── Catalog (public) ────────────────────────────────────────────────────────
  if (p === '/api/catalog' && m === 'GET') {
    const limit  = Math.min(500, Math.max(1, parseInt(url.searchParams.get('limit')  || '500') || 500));
    const offset = Math.max(0,              parseInt(url.searchParams.get('offset') || '0')   || 0);
    const type   = url.searchParams.get('type') || '';
    const status = url.searchParams.get('status') || '';
    const adult  = url.searchParams.get('adult') || 'normal';

    let where = [];
    const binds = [];
    let bindIdx = 1;

    if (type)   { where.push(`type = ?${bindIdx++}`);   binds.push(type); }
    if (status) { where.push(`status = ?${bindIdx++}`); binds.push(status); }
    if (adult === 'normal') { where.push('is_adult = 0'); }
    else if (adult === 'adult') { where.push('is_adult = 1'); }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const stmt = env.DB.prepare(
      `SELECT * FROM manhwa ${whereClause} ORDER BY updated_at DESC LIMIT ?${bindIdx} OFFSET ?${bindIdx + 1}`
    ).bind(...binds, limit, offset);

    const r = await stmt.all();
    return json({
      items: (r.results || []).map(manhwaRowToObj),
      limit, offset, count: (r.results || []).length,
    });
  }

  if (p.startsWith('/api/catalog/') && m === 'GET') {
    const id = decodeURIComponent(p.slice(13));
    const r  = await env.DB.prepare('SELECT * FROM manhwa WHERE id = ?1').bind(id).first();
    if (!r) return err('not found', 404);
    // Bump view count (fire-and-forget)
    env.DB.prepare('UPDATE manhwa SET views = views + 1 WHERE id = ?1').bind(id).run();
    return json({ item: manhwaRowToObj(r) });
  }

  // ── Manhwa admin CRUD ───────────────────────────────────────────────────────
  if (p === '/api/manhwa' && m === 'POST') {
    const a = await requireAdmin(env, req); if (isErr(a)) return a;
    const body = await safeJson(req) || {};
    const id   = String(body.id || `mw_${now()}_${rid()}`);

    // Handle cover/banner upload if dataUrl provided
    let cover  = String(body.cover || '');
    let banner = String(body.banner || '');

    if (cover.startsWith('data:')) {
      const bytes = dataUrlToBytes(cover);
      const ext   = mimeToExt(body.coverMime || 'image/webp');
      cover = await uploadToR2(env, { folder: 'covers', id, ext, mimeType: `image/${ext}`, bytes });
    }
    if (banner.startsWith('data:')) {
      const bytes = dataUrlToBytes(banner);
      const ext   = mimeToExt(body.bannerMime || 'image/webp');
      banner = await uploadToR2(env, { folder: 'banners', id: `${id}_banner`, ext, mimeType: `image/${ext}`, bytes });
    }

    await env.DB.prepare(`
      INSERT INTO manhwa (id, title, status, type, genres_json, rating, views, cover, banner, description, is_adult, extra_json, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
      ON CONFLICT(id) DO UPDATE SET
        title=excluded.title, status=excluded.status, type=excluded.type,
        genres_json=excluded.genres_json, rating=excluded.rating, views=excluded.views,
        cover=CASE WHEN excluded.cover != '' THEN excluded.cover ELSE cover END,
        banner=CASE WHEN excluded.banner != '' THEN excluded.banner ELSE banner END,
        description=excluded.description, is_adult=excluded.is_adult,
        extra_json=excluded.extra_json, updated_at=excluded.updated_at
    `).bind(
      id,
      String(body.title || ''),
      String(body.status || 'ongoing'),
      String(body.type || 'manhwa').toLowerCase(),
      JSON.stringify(Array.isArray(body.genres) ? body.genres : (body.genre ? [body.genre] : [])),
      Number(body.rating || 4.0),
      Number(body.views || 0),
      cover,
      banner,
      String(body.description || body.desc || ''),
      body.isAdult ? 1 : 0,
      JSON.stringify(body.extra || {}),
      Number(body.createdAt || now()),
      now()
    ).run();

    const fresh = await env.DB.prepare('SELECT * FROM manhwa WHERE id = ?1').bind(id).first();
    return json({ item: manhwaRowToObj(fresh) });
  }

  if (p.startsWith('/api/manhwa/') && m === 'PATCH') {
    const a  = await requireAdmin(env, req); if (isErr(a)) return a;
    const id = decodeURIComponent(p.slice(12));
    const body = await safeJson(req) || {};
    const existing = await env.DB.prepare('SELECT * FROM manhwa WHERE id = ?1').bind(id).first();
    if (!existing) return err('not found', 404);

    let cover  = String(body.cover  || existing.cover  || '');
    let banner = String(body.banner || existing.banner || '');

    if (cover.startsWith('data:')) {
      const bytes = dataUrlToBytes(cover);
      const ext   = mimeToExt(body.coverMime || 'image/webp');
      cover = await uploadToR2(env, { folder: 'covers', id, ext, mimeType: `image/${ext}`, bytes });
    }
    if (banner.startsWith('data:')) {
      const bytes = dataUrlToBytes(banner);
      const ext   = mimeToExt(body.bannerMime || 'image/webp');
      banner = await uploadToR2(env, { folder: 'banners', id: `${id}_banner`, ext, mimeType: `image/${ext}`, bytes });
    }

    await env.DB.prepare(`
      UPDATE manhwa SET
        title=?2, status=?3, type=?4, genres_json=?5, rating=?6,
        views=?7, cover=?8, banner=?9, description=?10,
        is_adult=?11, extra_json=?12, updated_at=?13
      WHERE id=?1
    `).bind(
      id,
      String(body.title || existing.title),
      String(body.status || existing.status),
      String(body.type || existing.type),
      JSON.stringify(Array.isArray(body.genres) ? body.genres : safeJsonParse(existing.genres_json, [])),
      Number(body.rating ?? existing.rating),
      Number(body.views ?? existing.views),
      cover, banner,
      String(body.description ?? body.desc ?? existing.description),
      body.isAdult !== undefined ? (body.isAdult ? 1 : 0) : existing.is_adult,
      JSON.stringify(body.extra || safeJsonParse(existing.extra_json, {})),
      now()
    ).run();

    const fresh = await env.DB.prepare('SELECT * FROM manhwa WHERE id = ?1').bind(id).first();
    return json({ item: manhwaRowToObj(fresh) });
  }

  if (p.startsWith('/api/manhwa/') && m === 'DELETE') {
    const a  = await requireOwner(env, req); if (isErr(a)) return a;
    const id = decodeURIComponent(p.slice(12));
    // Cascade deletes chapters + pages via FK
    await env.DB.prepare('DELETE FROM manhwa WHERE id = ?1').bind(id).run();
    return json({ ok: true });
  }

  // ── Chapters ────────────────────────────────────────────────────────────────
  if (p === '/api/chapters/latest' && m === 'GET') {
    const limit = Math.min(20, Math.max(1, parseInt(url.searchParams.get('limit') || '10') || 10));
    const adult = url.searchParams.get('adult') || 'normal';
    const af = adult === 'adult' ? 'WHERE m.is_adult = 1'
             : adult === 'all'   ? ''
             : 'WHERE m.is_adult = 0';

    // FIX 3: Exclude chapters that are scheduled for a future date.
    // Previously only filtered status='published' but a chapter can have
    // status='published' AND scheduled_at in the future (pre-published).
    const nowMs = now();
    const r = await env.DB.prepare(`
      SELECT c.id, c.manhwa_id, c.chapter_no, c.title, c.updated_at,
             m.title AS m_title, m.cover AS m_cover, m.is_adult AS m_is_adult
      FROM (
        SELECT manhwa_id, MAX(updated_at) AS max_t
        FROM chapters
        WHERE status = 'published'
          AND (scheduled_at IS NULL OR scheduled_at <= ?2)
        GROUP BY manhwa_id
      ) latest
      JOIN chapters c ON c.manhwa_id = latest.manhwa_id AND c.updated_at = latest.max_t
      JOIN manhwa m ON m.id = c.manhwa_id ${af}
      ORDER BY c.updated_at DESC LIMIT ?1
    `).bind(limit, nowMs).all();

    return json({
      items: (r.results || []).map(x => ({
        chapterId: x.id, manhwaId: x.manhwa_id,
        number: Number(x.chapter_no || 1), title: x.title || '',
        createdAt: Number(x.updated_at || 0),
        content: { id: x.manhwa_id, title: x.m_title, cover: x.m_cover, isAdult: !!x.m_is_adult },
      })),
    });
  }

  if (p === '/api/chapters' && m === 'GET') {
    const manhwaId = url.searchParams.get('manhwaId');
    // FIX 1+2: Determine effective status filter safely.
    //   - Admin callers may pass ?status=all to see every status (drafts, etc.)
    //   - Public/frontend callers get status='published' by default.
    //   - NEVER interpolate status directly into SQL (was SQL-injectable).
    const rawStatus = url.searchParams.get('status') || '';
    const sessionUser = await getSessionUser(env, req);
    const isAdmin = sessionUser && (sessionUser.role === 'owner' || sessionUser.role === 'admin');

    // Resolve the effective status filter
    let effectiveStatus;
    if (rawStatus === 'all' && isAdmin) {
      effectiveStatus = null; // admin asking for everything — no filter
    } else if (rawStatus && rawStatus !== 'all') {
      effectiveStatus = rawStatus; // explicit: 'published', 'draft', etc.
    } else {
      // Default: public users only see published chapters
      effectiveStatus = isAdmin ? null : 'published';
    }

    let stmt;
    if (manhwaId) {
      if (effectiveStatus) {
        // FIX 2: Use bind variable — never string-interpolate status
        stmt = env.DB.prepare(
          'SELECT * FROM chapters WHERE manhwa_id = ?1 AND status = ?2 ORDER BY chapter_no ASC'
        ).bind(manhwaId, effectiveStatus);
      } else {
        stmt = env.DB.prepare(
          'SELECT * FROM chapters WHERE manhwa_id = ?1 ORDER BY chapter_no ASC'
        ).bind(manhwaId);
      }
    } else {
      if (effectiveStatus) {
        stmt = env.DB.prepare(
          'SELECT * FROM chapters WHERE status = ?1 ORDER BY updated_at DESC LIMIT 200'
        ).bind(effectiveStatus);
      } else {
        stmt = env.DB.prepare('SELECT * FROM chapters ORDER BY updated_at DESC LIMIT 200');
      }
    }

    const r = await stmt.all();
    return json({ items: (r.results || []).map(chapterRowToObj) });
  }

  // Batch upsert chapters (admin)
  if (p === '/api/chapters' && m === 'POST') {
    const a = await requireAdmin(env, req); if (isErr(a)) return a;
    const body = await safeJson(req) || {};
    const rows = Array.isArray(body.rows) ? body.rows : [body];
    if (rows.length > 200) return err('max 200 per batch');

    const stmts = rows.map(c =>
      env.DB.prepare(`
        INSERT INTO chapters (id, manhwa_id, chapter_no, title, content_type, access_type,
          coin_price, vip_only, status, format, page_count, pdf_id,
          scheduled_at, extra_json, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)
        ON CONFLICT(id) DO UPDATE SET
          manhwa_id=excluded.manhwa_id, chapter_no=excluded.chapter_no,
          title=excluded.title, content_type=excluded.content_type,
          access_type=excluded.access_type, coin_price=excluded.coin_price,
          vip_only=excluded.vip_only, status=excluded.status,
          format=excluded.format, page_count=excluded.page_count,
          pdf_id=excluded.pdf_id, scheduled_at=excluded.scheduled_at,
          extra_json=excluded.extra_json, updated_at=excluded.updated_at
      `).bind(
        String(c.id || `ch_${now()}_${rid()}`),
        String(c.manhwaId || ''),
        Number(c.chapterNo || c.number || 1),
        String(c.title || ''),
        String(c.contentType || 'manhwa'),
        String(c.access || c.accessType || 'free'),
        Number(c.coinPrice || c.price || 0),
        c.vip || c.vipOnly ? 1 : 0,
        String(c.status || 'published'),
        String(c.format || 'webp'),
        Number(c.pageCount || 0),
        c.pdfId || null,
        c.scheduledAt || null,
        JSON.stringify(c.extra || {}),
        Number(c.createdAt || now()),
        now()
      )
    );

    if (stmts.length) await env.DB.batch(stmts);
    return json({ ok: true, count: stmts.length });
  }

  if (p === '/api/chapters/patch' && m === 'POST') {
    const a = await requireAdmin(env, req); if (isErr(a)) return a;
    const c = await safeJson(req) || {};
    if (!c.id) return err('id required');

    await env.DB.prepare(`
      UPDATE chapters SET
        manhwa_id=?2, chapter_no=?3, title=?4, access_type=?5,
        coin_price=?6, vip_only=?7, status=?8, format=?9,
        page_count=?10, extra_json=?11, updated_at=?12
      WHERE id=?1
    `).bind(
      String(c.id), String(c.manhwaId || ''), Number(c.chapterNo || c.number || 1),
      String(c.title || ''), String(c.access || c.accessType || 'free'),
      Number(c.coinPrice || c.price || 0), c.vip || c.vipOnly ? 1 : 0,
      String(c.status || 'published'), String(c.format || 'webp'),
      Number(c.pageCount || 0), JSON.stringify(c.extra || {}), now()
    ).run();

    const fresh = await env.DB.prepare('SELECT * FROM chapters WHERE id = ?1').bind(c.id).first();
    return json({ item: fresh ? chapterRowToObj(fresh) : c });
  }

  if (p === '/api/chapters/delete' && m === 'POST') {
    const a    = await requireOwner(env, req); if (isErr(a)) return a;
    const body = await safeJson(req) || {};
    if (!body.id) return err('id required');
    await env.DB.prepare('DELETE FROM chapter_pages WHERE chapter_id = ?1').bind(body.id).run();
    await env.DB.prepare('DELETE FROM chapters WHERE id = ?1').bind(body.id).run();
    return json({ ok: true });
  }

  // ── Chapter pages ───────────────────────────────────────────────────────────
  if (p === '/api/chapters/pages' && m === 'GET') {
    const chId = url.searchParams.get('chapterId');
    if (!chId) return err('chapterId required');
    const r = await env.DB.prepare(
      'SELECT * FROM chapter_pages WHERE chapter_id = ?1 ORDER BY page_no ASC'
    ).bind(chId).all();
    return json({
      items: (r.results || []).map(x => ({
        id: x.id, chapterId: x.chapter_id, pageNo: x.page_no,
        r2Key: x.r2_key, url: x.r2_key ? `/media/${x.r2_key}` : '',
        width: x.width, height: x.height,
      })),
    });
  }

  if (p === '/api/chapters/pages' && m === 'POST') {
    const a    = await requireAdmin(env, req); if (isErr(a)) return a;
    const body = await safeJson(req) || {};
    const chId = String(body.chapterId || '');
    const pages = Array.isArray(body.pages) ? body.pages : [];
    if (!chId) return err('chapterId required');
    if (pages.length > 500) return err('max 500 pages');

    // Delete existing pages then re-insert
    await env.DB.prepare('DELETE FROM chapter_pages WHERE chapter_id = ?1').bind(chId).run();

    const stmts = pages.map((pg, i) => {
      let r2Key = pg.r2Key || '';
      return env.DB.prepare(`
        INSERT INTO chapter_pages (id, chapter_id, page_no, r2_key, width, height, created_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
      `).bind(
        `${chId}_p${i + 1}`, chId, i + 1, r2Key,
        Number(pg.width || 0), Number(pg.height || 0), now()
      );
    });

    if (stmts.length) await env.DB.batch(stmts);

    // Update page count on chapter
    await env.DB.prepare(
      'UPDATE chapters SET page_count = ?2, updated_at = ?3 WHERE id = ?1'
    ).bind(chId, pages.length, now()).run();

    return json({ ok: true, count: pages.length });
  }

  // ── Banners ─────────────────────────────────────────────────────────────────
  if (p === '/api/banners' && m === 'GET') {
    const slot   = url.searchParams.get('slot') || '';
    const active = url.searchParams.get('active'); // '0', '1', or null (absent)
    // FIX 4+5: `dated` opt-in flag — only apply start/end date range filtering
    // when the caller explicitly requests it (?dated=1). Previously the date
    // conditions were ALWAYS applied, which silently hid every new banner
    // created without an explicit start_date/end_date (they would be filtered
    // out because `start_date IS NULL` short-circuits the ≤ today comparison
    // only when stored as NULL — but if stored as empty string '' then
    // `'' <= '2025-05-07'` is TRUE in SQLite, yet `'' >= '2025-05-07'`
    // is FALSE, hiding the banner).
    //
    // FIX 5: When ?active is absent, default to active=1 for public calls so
    // inactive banners are never shown to users. Admin panel passes active=all
    // to see everything.
    const dated  = url.searchParams.get('dated') === '1';
    const today  = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'

    let where = [];
    const binds = [];
    let idx = 1;

    if (slot) { where.push(`slot = ?${idx++}`); binds.push(slot); }

    // FIX 5: Default to active-only; admin can pass ?active=all to bypass
    if (active === 'all') {
      // no active filter — admin listing
    } else if (active === '0') {
      where.push('active = 0');
    } else {
      // active=1 is the default (covers absent param and active=1)
      where.push('active = 1');
    }

    // FIX 4: Only filter by date range when explicitly requested
    if (dated) {
      where.push(`(start_date IS NULL OR start_date = '' OR start_date <= ?${idx++})`);
      binds.push(today);
      where.push(`(end_date IS NULL OR end_date = '' OR end_date >= ?${idx++})`);
      binds.push(today);
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const r = await env.DB.prepare(
      `SELECT * FROM banners ${whereClause} ORDER BY display_order ASC, created_at DESC`
    ).bind(...binds).all();

    return json({ items: (r.results || []).map(bannerRowToObj) });
  }

  if (p === '/api/banners' && m === 'POST') {
    const a    = await requireAdmin(env, req); if (isErr(a)) return a;
    const body = await safeJson(req) || {};
    const id   = String(body.id || `bn_${now()}_${rid()}`);

    let r2Key    = String(body.r2Key || '');
    let posterKey = String(body.posterKey || '');

    // Upload media if dataUrl provided
    if (!r2Key && body.media && String(body.media).startsWith('data:')) {
      const mime  = body.mimeType || 'image/webp';
      const ext   = mimeToExt(mime);
      const bytes = dataUrlToBytes(body.media);
      const folder = body.mediaType === 'video' ? 'banners/videos' : 'banners/images';
      r2Key = await uploadToR2(env, { folder, id, ext, mimeType: mime, bytes });
    }
    if (!posterKey && body.poster && String(body.poster).startsWith('data:')) {
      const bytes = dataUrlToBytes(body.poster);
      posterKey   = await uploadToR2(env, { folder: 'banners/posters', id: `${id}_poster`, ext: 'webp', mimeType: 'image/webp', bytes });
    }

    await env.DB.prepare(`
      INSERT INTO banners (id, title, slot, media_type, r2_key, poster_key, link,
        display_order, active, start_date, end_date, created_by, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
      ON CONFLICT(id) DO UPDATE SET
        title=excluded.title, slot=excluded.slot, media_type=excluded.media_type,
        r2_key=CASE WHEN excluded.r2_key != '' THEN excluded.r2_key ELSE r2_key END,
        poster_key=CASE WHEN excluded.poster_key != '' THEN excluded.poster_key ELSE poster_key END,
        link=excluded.link, display_order=excluded.display_order,
        active=excluded.active, start_date=excluded.start_date,
        end_date=excluded.end_date, updated_at=excluded.updated_at
    `).bind(
      id,
      String(body.title || ''),
      String(body.slot || 'home-hero'),
      String(body.mediaType || 'image'),
      r2Key, posterKey,
      String(body.link || ''),
      Number(body.order || body.displayOrder || 1),
      body.active !== false ? 1 : 0,
      body.startDate || null,
      body.endDate || null,
      a.uid, now(), now()
    ).run();

    const fresh = await env.DB.prepare('SELECT * FROM banners WHERE id = ?1').bind(id).first();
    return json({ banner: fresh ? bannerRowToObj(fresh) : { id } });
  }

  if (p.startsWith('/api/banners/') && m === 'PATCH') {
    const a  = await requireAdmin(env, req); if (isErr(a)) return a;
    const id = decodeURIComponent(p.slice(13));
    const body = await safeJson(req) || {};

    const existing = await env.DB.prepare('SELECT * FROM banners WHERE id = ?1').bind(id).first();
    if (!existing) return err('not found', 404);

    let r2Key    = existing.r2_key;
    let posterKey = existing.poster_key;

    if (body.media && String(body.media).startsWith('data:')) {
      const mime  = body.mimeType || 'image/webp';
      const ext   = mimeToExt(mime);
      const bytes = dataUrlToBytes(body.media);
      const folder = body.mediaType === 'video' ? 'banners/videos' : 'banners/images';
      r2Key = await uploadToR2(env, { folder, id: `${id}_${now()}`, ext, mimeType: mime, bytes });
    }

    await env.DB.prepare(`
      UPDATE banners SET
        title=?2, slot=?3, media_type=?4, r2_key=?5, poster_key=?6,
        link=?7, display_order=?8, active=?9,
        start_date=?10, end_date=?11, updated_at=?12
      WHERE id=?1
    `).bind(
      id,
      String(body.title ?? existing.title),
      String(body.slot  ?? existing.slot),
      String(body.mediaType ?? existing.media_type),
      r2Key, posterKey,
      String(body.link ?? existing.link),
      Number(body.order ?? body.displayOrder ?? existing.display_order),
      body.active !== undefined ? (body.active ? 1 : 0) : existing.active,
      body.startDate !== undefined ? body.startDate : existing.start_date,
      body.endDate   !== undefined ? body.endDate   : existing.end_date,
      now()
    ).run();

    const fresh = await env.DB.prepare('SELECT * FROM banners WHERE id = ?1').bind(id).first();
    return json({ banner: bannerRowToObj(fresh) });
  }

  if (p.startsWith('/api/banners/') && m === 'DELETE') {
    const a  = await requireAdmin(env, req); if (isErr(a)) return a;
    const id = decodeURIComponent(p.slice(13));
    await env.DB.prepare('DELETE FROM banners WHERE id = ?1').bind(id).run();
    return json({ ok: true });
  }

  // Toggle banner active
  if (p === '/api/banners/toggle' && m === 'POST') {
    const a    = await requireAdmin(env, req); if (isErr(a)) return a;
    const body = await safeJson(req) || {};
    if (!body.id) return err('id required');
    await env.DB.prepare(
      'UPDATE banners SET active = CASE WHEN active = 1 THEN 0 ELSE 1 END, updated_at = ?2 WHERE id = ?1'
    ).bind(body.id, now()).run();
    const fresh = await env.DB.prepare('SELECT * FROM banners WHERE id = ?1').bind(body.id).first();
    return json({ banner: fresh ? bannerRowToObj(fresh) : null });
  }

  // Reorder banners
  if (p === '/api/banners/reorder' && m === 'POST') {
    const a    = await requireAdmin(env, req); if (isErr(a)) return a;
    const body = await safeJson(req) || {};
    // body.order = [{ id, order }]
    const items = Array.isArray(body.order) ? body.order : [];
    const stmts = items.map(x =>
      env.DB.prepare('UPDATE banners SET display_order = ?2, updated_at = ?3 WHERE id = ?1')
        .bind(String(x.id), Number(x.order), now())
    );
    if (stmts.length) await env.DB.batch(stmts);
    return json({ ok: true });
  }

  // ── Media ───────────────────────────────────────────────────────────────────
  if (p === '/api/media' && m === 'GET') {
    const folder = url.searchParams.get('folder') || '';
    const kind   = url.searchParams.get('kind')   || '';
    const limit  = Math.min(500, parseInt(url.searchParams.get('limit') || '200') || 200);

    let where  = [];
    const binds = [];
    let idx = 1;
    if (folder) { where.push(`folder = ?${idx++}`); binds.push(folder); }
    if (kind)   { where.push(`kind = ?${idx++}`);   binds.push(kind); }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const r = await env.DB.prepare(
      `SELECT * FROM media_assets ${whereClause} ORDER BY created_at DESC LIMIT ?${idx}`
    ).bind(...binds, limit).all();

    return json({ items: (r.results || []).map(mediaRowToObj) });
  }

  if (p === '/api/media' && m === 'POST') {
    const a    = await requireAdmin(env, req); if (isErr(a)) return a;
    const body = await safeJson(req) || {};
    const id   = String(body.id || `media_${now()}_${rid()}`);
    let r2Key  = String(body.r2Key || body.key || '');

    if (!r2Key && body.dataUrl && String(body.dataUrl).startsWith('data:')) {
      const mime  = String(body.mimeType || 'image/webp');
      const ext   = mimeToExt(mime);
      const bytes = dataUrlToBytes(body.dataUrl);
      const folder = String(body.folder || 'uploads');
      r2Key = await uploadToR2(env, { folder, id, ext, mimeType: mime, bytes });
    }

    await env.DB.prepare(`
      INSERT INTO media_assets (id, kind, folder, filename, mime_type, size_bytes, r2_key, poster_key, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
      ON CONFLICT(id) DO UPDATE SET
        kind=excluded.kind, folder=excluded.folder, filename=excluded.filename,
        mime_type=excluded.mime_type, size_bytes=excluded.size_bytes,
        r2_key=CASE WHEN excluded.r2_key != '' THEN excluded.r2_key ELSE r2_key END,
        poster_key=CASE WHEN excluded.poster_key != '' THEN excluded.poster_key ELSE poster_key END,
        updated_at=excluded.updated_at
    `).bind(
      id, String(body.kind || 'image'), String(body.folder || 'uploads'),
      String(body.filename || ''), String(body.mimeType || ''),
      Number(body.size || 0), r2Key, String(body.posterKey || ''),
      now(), now()
    ).run();

    return json({ id, r2Key, url: r2Key ? `/media/${r2Key}` : '' });
  }

  if (p === '/api/media/delete' && m === 'POST') {
    const a    = await requireAdmin(env, req); if (isErr(a)) return a;
    const body = await safeJson(req) || {};
    if (!body.id) return err('id required');
    const row = await env.DB.prepare('SELECT * FROM media_assets WHERE id = ?1').bind(body.id).first();
    if (row) {
      // Delete from R2 (fire-and-forget, non-blocking)
      if (row.r2_key)    env.MEDIA.delete(row.r2_key).catch(() => {});
      if (row.poster_key) env.MEDIA.delete(row.poster_key).catch(() => {});
    }
    await env.DB.prepare('DELETE FROM media_assets WHERE id = ?1').bind(body.id).run();
    return json({ ok: true });
  }

  // ── R2 direct upload (presigned-like via worker) ─────────────────────────────
  // POST /api/media/upload — multipart or raw body
  if (p === '/api/media/upload' && m === 'POST') {
    const a = await requireAdmin(env, req); if (isErr(a)) return a;
    const contentType = req.headers.get('content-type') || '';
    const folder  = url.searchParams.get('folder') || 'uploads';
    const kind    = url.searchParams.get('kind')   || 'image';
    const mime    = url.searchParams.get('mime')   || 'image/webp';
    const id      = `media_${now()}_${rid()}`;
    const ext     = mimeToExt(mime);

    const bytes = new Uint8Array(await req.arrayBuffer());
    const r2Key = await uploadToR2(env, { folder, id, ext, mimeType: mime, bytes });

    await env.DB.prepare(`
      INSERT INTO media_assets (id, kind, folder, filename, mime_type, size_bytes, r2_key, poster_key, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, '', ?8, ?9)
    `).bind(id, kind, folder, `${id}.${ext}`, mime, bytes.byteLength, r2Key, now(), now()).run();

    return json({ id, r2Key, url: `/media/${r2Key}` });
  }

  // ── Users ───────────────────────────────────────────────────────────────────
  if (p === '/api/users' && m === 'GET') {
    const a = await requireAdmin(env, req); if (isErr(a)) return a;
    const limit  = Math.min(500, parseInt(url.searchParams.get('limit') || '200') || 200);
    const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0') || 0);
    const r = await env.DB.prepare(
      'SELECT * FROM users ORDER BY created_at DESC LIMIT ?1 OFFSET ?2'
    ).bind(limit, offset).all();
    return json({ users: (r.results || []).map(rowToUser) });
  }

  if (p === '/api/users' && m === 'POST') {
    const a    = await requireAdmin(env, req); if (isErr(a)) return a;
    const body = await safeJson(req) || {};
    const u    = userToRow(body);
    if (!u.uid) return err('uid required');

    await env.DB.prepare(`
      INSERT INTO users (uid, username, email, role, vip, coins, provider, avatar, extra_json, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
      ON CONFLICT(uid) DO UPDATE SET
        username=excluded.username, email=excluded.email,
        role=excluded.role, vip=excluded.vip, coins=excluded.coins,
        avatar=excluded.avatar, extra_json=excluded.extra_json, updated_at=excluded.updated_at
    `).bind(u.uid, u.username, u.email, u.role, u.vip, u.coins,
            u.provider, u.avatar, u.extra_json, u.created_at, u.updated_at).run();

    const fresh = await env.DB.prepare('SELECT * FROM users WHERE uid = ?1').bind(u.uid).first();
    return json({ user: rowToUser(fresh) });
  }

  if (p === '/api/users' && m === 'PATCH') {
    const a    = await requireOwner(env, req); if (isErr(a)) return a;
    const body = await safeJson(req) || {};
    const uid  = String(body.uid || '').toUpperCase();
    if (!uid) return err('uid required');
    const u = await env.DB.prepare('SELECT * FROM users WHERE uid = ?1').bind(uid).first();
    if (!u) return err('user not found', 404);

    // Protect the owner
    if (uid === ownerUid(env) && ['role', 'softDelete'].includes(body.action)) {
      return json({ user: rowToUser(u) });
    }

    switch (body.action) {
      case 'coins':
        await env.DB.prepare('UPDATE users SET coins = ?2, updated_at = ?3 WHERE uid = ?1')
          .bind(uid, Math.max(0, Number(body.coins || 0)), now()).run();
        // Log transaction
        await env.DB.prepare(`
          INSERT INTO coin_transactions (id, uid, type, amount, note, created_at)
          VALUES (?1, ?2, 'admin_grant', ?3, ?4, ?5)
        `).bind(`tx_${now()}_${rid()}`, uid, Number(body.coins || 0) - Number(u.coins || 0), 'Admin grant', now()).run();
        break;
      case 'vip':
        await env.DB.prepare('UPDATE users SET vip = ?2, updated_at = ?3 WHERE uid = ?1')
          .bind(uid, body.vip ? 1 : 0, now()).run();
        break;
      case 'role': {
        const role = String(body.role || 'user');
        if (!['user', 'admin', 'moderator'].includes(role)) return err('invalid role');
        await env.DB.prepare('UPDATE users SET role = ?2, updated_at = ?3 WHERE uid = ?1')
          .bind(uid, role, now()).run();
        break;
      }
      case 'softDelete': {
        const ex = safeJsonParse(u.extra_json, {});
        ex.deletedAt     = now();
        ex.deletedReason = String(body.reason || 'Blocked').slice(0, 200);
        await env.DB.prepare('UPDATE users SET extra_json = ?2, updated_at = ?3 WHERE uid = ?1')
          .bind(uid, JSON.stringify(ex), now()).run();
        // Invalidate all sessions
        await env.DB.prepare('DELETE FROM sessions WHERE uid = ?1').bind(uid).run();
        break;
      }
      case 'restore': {
        const ex = safeJsonParse(u.extra_json, {});
        delete ex.deletedAt;
        delete ex.deletedReason;
        await env.DB.prepare('UPDATE users SET extra_json = ?2, updated_at = ?3 WHERE uid = ?1')
          .bind(uid, JSON.stringify(ex), now()).run();
        break;
      }
      default:
        return err('unknown action');
    }

    const fresh = await env.DB.prepare('SELECT * FROM users WHERE uid = ?1').bind(uid).first();
    return json({ user: rowToUser(fresh) });
  }

  // ── Library ─────────────────────────────────────────────────────────────────
  if (p === '/api/library' && m === 'GET') {
    const uid         = url.searchParams.get('uid') || '';
    const sessionUser = await getSessionUser(env, req);
    if (!sessionUser) return err('unauthorized', 401);
    if (uid !== sessionUser.uid && sessionUser.role !== 'owner' && sessionUser.role !== 'admin')
      return err('forbidden', 403);

    const r = await env.DB.prepare(
      'SELECT * FROM library WHERE uid = ?1 ORDER BY last_read_at DESC, updated_at DESC'
    ).bind(uid).all();

    return json({
      items: (r.results || []).map(x => ({
        uid: x.uid, manhwaId: x.manhwa_id, state: x.state, favorite: !!x.favorite,
        progress: Number(x.progress || 0), lastChapterId: x.last_chapter_id || '',
        lastReadAt: Number(x.last_read_at || 0), updatedAt: Number(x.updated_at || 0),
      })),
    });
  }

  if (p === '/api/library' && m === 'POST') {
    const a   = await requireAuth(env, req); if (isErr(a)) return a;
    const body = await safeJson(req) || {};
    const uid  = String(body.uid || '').toUpperCase();
    if (uid !== a.uid && a.role !== 'owner' && a.role !== 'admin') return err('forbidden', 403);
    const it = body.item || {};
    if (!uid || !it.manhwaId) return err('uid + manhwaId required');

    await env.DB.prepare(`
      INSERT INTO library (uid, manhwa_id, state, favorite, progress, last_chapter_id, last_read_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
      ON CONFLICT(uid, manhwa_id) DO UPDATE SET
        state=excluded.state, favorite=excluded.favorite, progress=excluded.progress,
        last_chapter_id=excluded.last_chapter_id, last_read_at=excluded.last_read_at,
        updated_at=excluded.updated_at
    `).bind(uid, String(it.manhwaId), String(it.state || 'saved'), it.favorite ? 1 : 0,
      Number(it.progress || 0), String(it.lastChapterId || ''),
      Number(it.lastReadAt || 0), now()).run();

    const r = await env.DB.prepare(
      'SELECT * FROM library WHERE uid = ?1 ORDER BY last_read_at DESC'
    ).bind(uid).all();

    return json({
      items: (r.results || []).map(x => ({
        uid: x.uid, manhwaId: x.manhwa_id, state: x.state, favorite: !!x.favorite,
        progress: Number(x.progress || 0), lastChapterId: x.last_chapter_id || '',
        lastReadAt: Number(x.last_read_at || 0), updatedAt: Number(x.updated_at || 0),
      })),
    });
  }

  if (p === '/api/library/stats' && m === 'GET') {
    const uid         = url.searchParams.get('uid') || '';
    const sessionUser = await getSessionUser(env, req);
    if (!sessionUser) return err('unauthorized', 401);
    if (uid !== sessionUser.uid && sessionUser.role !== 'owner' && sessionUser.role !== 'admin')
      return err('forbidden', 403);

    const r = await env.DB.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN state='saved'     THEN 1 ELSE 0 END) AS saved,
        SUM(CASE WHEN state='reading'   THEN 1 ELSE 0 END) AS reading,
        SUM(CASE WHEN state='completed' OR progress >= 96 THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN favorite=1        THEN 1 ELSE 0 END) AS favorites
      FROM library WHERE uid = ?1
    `).bind(uid).first();

    return json({
      stats: {
        total:     Number(r.total     || 0), saved:     Number(r.saved     || 0),
        reading:   Number(r.reading   || 0), completed: Number(r.completed || 0),
        favorites: Number(r.favorites || 0),
      },
    });
  }

  // ── Progress ────────────────────────────────────────────────────────────────
  if (p === '/api/progress' && m === 'GET') {
    const uid         = url.searchParams.get('uid') || '';
    const sessionUser = await getSessionUser(env, req);
    if (!sessionUser) return err('unauthorized', 401);
    if (uid !== sessionUser.uid && sessionUser.role !== 'owner' && sessionUser.role !== 'admin')
      return err('forbidden', 403);

    const r = await env.DB.prepare(
      'SELECT * FROM reading_progress WHERE uid = ?1 ORDER BY last_read_at DESC'
    ).bind(uid).all();
    return json({
      items: (r.results || []).map(x => ({
        uid: x.uid, manhwaId: x.manhwa_id, chapterId: x.chapter_id,
        percent: Number(x.percent || 0), lastRead: Number(x.last_read_at || 0),
      })),
    });
  }

  if (p === '/api/progress' && m === 'POST') {
    const a   = await requireAuth(env, req); if (isErr(a)) return a;
    const body = await safeJson(req) || {};
    const uid  = String(body.uid || '').toUpperCase();
    if (uid !== a.uid && a.role !== 'owner' && a.role !== 'admin') return err('forbidden', 403);
    const e = body.entry || {};
    if (!uid || !e.chapterId) return err('uid + chapterId required');

    const t = now();
    await env.DB.prepare(`
      INSERT INTO reading_progress (uid, chapter_id, manhwa_id, percent, last_read_at)
      VALUES (?1, ?2, ?3, ?4, ?5)
      ON CONFLICT(uid, chapter_id) DO UPDATE SET
        manhwa_id=excluded.manhwa_id, percent=excluded.percent, last_read_at=excluded.last_read_at
    `).bind(uid, String(e.chapterId), String(e.manhwaId || ''),
      Math.max(0, Math.min(100, Number(e.percent || 0))), t).run();

    if (e.manhwaId) {
      const state = Number(e.percent || 0) >= 96 ? 'completed' : 'reading';
      await env.DB.prepare(`
        INSERT INTO library (uid, manhwa_id, state, favorite, progress, last_chapter_id, last_read_at, updated_at)
        VALUES (?1, ?2, ?3, 0, ?4, ?5, ?6, ?7)
        ON CONFLICT(uid, manhwa_id) DO UPDATE SET
          state=excluded.state, progress=excluded.progress,
          last_chapter_id=excluded.last_chapter_id,
          last_read_at=excluded.last_read_at, updated_at=excluded.updated_at
      `).bind(uid, String(e.manhwaId), state,
        Number(e.percent || 0), String(e.chapterId), t, t).run();
    }

    return json({
      item: { uid, manhwaId: e.manhwaId || '', chapterId: e.chapterId,
              percent: Number(e.percent || 0), lastRead: t },
    });
  }

  // ── Promo codes ─────────────────────────────────────────────────────────────
  if (p === '/api/promos' && m === 'GET') {
    const a = await requireAdmin(env, req); if (isErr(a)) return a;
    const r = await env.DB.prepare('SELECT * FROM promo_codes ORDER BY created_at DESC').all();
    return json({ promos: (r.results || []) });
  }

  if (p === '/api/promos' && m === 'POST') {
    const a    = await requireAdmin(env, req); if (isErr(a)) return a;
    const body = await safeJson(req) || {};
    const code = String(body.code || '').toUpperCase().trim();
    if (!code || code.length < 4) return err('code must be ≥ 4 chars');

    const existing = await env.DB.prepare('SELECT code FROM promo_codes WHERE code = ?1').bind(code).first();
    if (existing) return err('code already exists');

    await env.DB.prepare(`
      INSERT INTO promo_codes (code, discount_pct, coins_reward, max_uses, uses, expires_at, active, created_by, created_at)
      VALUES (?1, ?2, ?3, ?4, 0, ?5, 1, ?6, ?7)
    `).bind(
      code, Number(body.discountPct || body.discount || 0),
      Number(body.coinsReward || body.coins || 0),
      Number(body.maxUses || 100),
      Number(body.expiresAt || (now() + 30 * 24 * 60 * 60 * 1000)),
      a.uid, now()
    ).run();

    return json({ ok: true, code });
  }

  if (p === '/api/promos/apply' && m === 'POST') {
    const a    = await requireAuth(env, req); if (isErr(a)) return a;
    const body = await safeJson(req) || {};
    const code = String(body.code || '').toUpperCase().trim();
    if (!code) return err('code required');

    const promo = await env.DB.prepare('SELECT * FROM promo_codes WHERE code = ?1').bind(code).first();
    if (!promo) return err('promo not found', 404);
    if (!promo.active) return err('promo not active');
    if (promo.uses >= promo.max_uses) return err('promo limit reached');
    if (promo.expires_at < now()) return err('promo expired');

    const used = await env.DB.prepare('SELECT 1 FROM promo_uses WHERE code = ?1 AND uid = ?2').bind(code, a.uid).first();
    if (used) return err('already used');

    // Apply promo
    const stmts = [
      env.DB.prepare('UPDATE promo_codes SET uses = uses + 1 WHERE code = ?1').bind(code),
      env.DB.prepare('INSERT INTO promo_uses (code, uid, used_at) VALUES (?1, ?2, ?3)').bind(code, a.uid, now()),
    ];

    if (promo.coins_reward > 0) {
      stmts.push(
        env.DB.prepare('UPDATE users SET coins = coins + ?2, updated_at = ?3 WHERE uid = ?1')
          .bind(a.uid, promo.coins_reward, now()),
        env.DB.prepare(`INSERT INTO coin_transactions (id, uid, type, amount, ref_id, note, created_at)
          VALUES (?1, ?2, 'promo', ?3, ?4, ?5, ?6)`)
          .bind(`tx_${now()}_${rid()}`, a.uid, promo.coins_reward, code, `Promo: ${code}`, now())
      );
    }

    await env.DB.batch(stmts);

    return json({
      ok: true,
      coinsAdded: promo.coins_reward,
      discountPct: promo.discount_pct,
    });
  }

  // ── Payments ────────────────────────────────────────────────────────────────
  if (p === '/api/payments' && m === 'GET') {
    const a = await requireAdmin(env, req); if (isErr(a)) return a;
    const r = await env.DB.prepare('SELECT * FROM payments ORDER BY created_at DESC LIMIT 200').all();
    return json({ payments: r.results || [] });
  }

  if (p === '/api/payments' && m === 'POST') {
    const a    = await requireAdmin(env, req); if (isErr(a)) return a;
    const body = await safeJson(req) || {};
    const uid  = String(body.uid || '').toUpperCase();
    if (!uid) return err('uid required');

    const id = `pay_${now()}_${rid()}`;
    await env.DB.prepare(`
      INSERT INTO payments (id, uid, type, amount_sum, coins, method, status, confirmed_by, confirmed_at, created_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'confirmed', ?7, ?8, ?9)
    `).bind(
      id, uid, String(body.type || 'coin'), Number(body.amountSum || body.amount || 0),
      Number(body.coins || 0), String(body.method || 'manual'),
      a.uid, now(), now()
    ).run();

    // Grant coins if provided
    if (Number(body.coins || 0) > 0) {
      await env.DB.batch([
        env.DB.prepare('UPDATE users SET coins = coins + ?2, updated_at = ?3 WHERE uid = ?1')
          .bind(uid, Number(body.coins), now()),
        env.DB.prepare(`INSERT INTO coin_transactions (id, uid, type, amount, ref_id, note, created_at)
          VALUES (?1, ?2, 'purchase', ?3, ?4, 'Admin manual payment', ?5)`)
          .bind(`tx_${now()}_${rid()}`, uid, Number(body.coins), id, now()),
      ]);
    }

    return json({ ok: true, id });
  }

  if (p === '/api/payments/confirm' && m === 'POST') {
    const a    = await requireAdmin(env, req); if (isErr(a)) return a;
    const body = await safeJson(req) || {};
    if (!body.id) return err('id required');

    const pay = await env.DB.prepare('SELECT * FROM payments WHERE id = ?1').bind(body.id).first();
    if (!pay) return err('payment not found', 404);
    if (pay.status === 'confirmed') return err('already confirmed');

    const stmts = [
      env.DB.prepare('UPDATE payments SET status = ?2, confirmed_by = ?3, confirmed_at = ?4 WHERE id = ?1')
        .bind(body.id, 'confirmed', a.uid, now()),
    ];
    if (pay.coins > 0) {
      stmts.push(
        env.DB.prepare('UPDATE users SET coins = coins + ?2, updated_at = ?3 WHERE uid = ?1')
          .bind(pay.uid, pay.coins, now()),
        env.DB.prepare(`INSERT INTO coin_transactions (id, uid, type, amount, ref_id, note, created_at)
          VALUES (?1, ?2, 'purchase', ?3, ?4, 'Payment confirmed', ?5)`)
          .bind(`tx_${now()}_${rid()}`, pay.uid, pay.coins, body.id, now())
      );
    }
    await env.DB.batch(stmts);
    return json({ ok: true });
  }

  // ── Session cleanup ──────────────────────────────────────────────────────────
  if (p === '/api/sessions/cleanup' && m === 'POST') {
    const a = await requireOwner(env, req); if (isErr(a)) return a;
    const r = await env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?1').bind(now()).run();
    return json({ ok: true, deleted: r.changes || 0 });
  }

  // ── Stats (admin dashboard) ──────────────────────────────────────────────────
  if (p === '/api/stats' && m === 'GET') {
    const a = await requireAdmin(env, req); if (isErr(a)) return a;

    const [users, manhwa, chapters, banners, payments] = await Promise.all([
      env.DB.prepare('SELECT COUNT(*) AS c, SUM(vip) AS vips FROM users').first(),
      env.DB.prepare('SELECT COUNT(*) AS c FROM manhwa').first(),
      env.DB.prepare('SELECT COUNT(*) AS c FROM chapters WHERE status = ?1').bind('published').first(),
      env.DB.prepare('SELECT COUNT(*) AS c FROM banners WHERE active = 1').first(),
      env.DB.prepare("SELECT COALESCE(SUM(amount_sum),0) AS total FROM payments WHERE status='confirmed'").first(),
    ]);

    return json({
      stats: {
        users:          Number(users?.c     || 0),
        vips:           Number(users?.vips  || 0),
        manhwa:         Number(manhwa?.c    || 0),
        chapters:       Number(chapters?.c  || 0),
        activeBanners:  Number(banners?.c   || 0),
        totalRevenue:   Number(payments?.total || 0),
      },
    });
  }

  return null; // 404 fallback
}

// ── R2 media serving ──────────────────────────────────────────────────────────
async function serveMedia(env, req, url) {
  const key = decodeURIComponent(url.pathname.slice(7)); // strip /media/
  if (!key || key.includes('..') || key.startsWith('/')) return err('invalid key', 400);

  const range = req.headers.get('range');
  let obj;

  try {
    if (range) {
      const rm = /bytes=(\d+)-(\d*)/.exec(range);
      if (rm) {
        const offset = parseInt(rm[1], 10);
        const end    = rm[2] ? parseInt(rm[2], 10) : undefined;
        const length = end !== undefined ? (end - offset + 1) : undefined;
        obj = await env.MEDIA.get(key, { range: { offset, length } });
      } else {
        obj = await env.MEDIA.get(key);
      }
    } else {
      obj = await env.MEDIA.get(key);
    }
  } catch (e) {
    return err('media read error', 500);
  }

  if (!obj) return err('not found', 404);

  const h = new Headers();
  obj.writeHttpMetadata(h);
  h.set('etag', obj.httpEtag);
  // FIX 9: Remove "immutable" — cover images and banners can be replaced in R2
  // with the same key. "immutable" tells browsers to NEVER re-fetch, which
  // breaks updates. Use a short max-age + stale-while-revalidate instead:
  // browser gets fast response from cache, but re-validates after 1 hour.
  h.set('cache-control', 'public, max-age=3600, stale-while-revalidate=86400');
  h.set('accept-ranges', 'bytes');
  h.set('access-control-allow-origin', '*');

  if (range && obj.range) {
    h.set('content-range',
      `bytes ${obj.range.offset}-${obj.range.offset + obj.range.length - 1}/${obj.size}`);
    return new Response(obj.body, { status: 206, headers: h });
  }

  return new Response(obj.body, { headers: h });
}

// ── Entry point ───────────────────────────────────────────────────────────────
export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const { pathname } = url;

    // CORS preflight
    if (req.method === 'OPTIONS' &&
        (pathname.startsWith('/api/') || pathname.startsWith('/media/'))) {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Block sensitive files
    const BLOCKED = ['/wrangler.toml', '/package.json', '/.env', '/.gitignore'];
    if (BLOCKED.some(b => pathname === b || pathname.startsWith(b + '/'))) {
      return new Response('Not Found', { status: 404 });
    }

    // API routes
    if (pathname.startsWith('/api/')) {
      try {
        const out = await api(env, req, url);
        return out ? withCors(out) : withCors(err('not found', 404));
      } catch (e) {
        console.error('[worker api error]', e?.message || e);
        return withCors(err('server error', 500));
      }
    }

    // Media (R2)
    if (pathname.startsWith('/media/')) {
      try {
        return await serveMedia(env, req, url);
      } catch (e) {
        console.error('[worker media error]', e?.message || e);
        return err('media error', 500);
      }
    }

    // Static assets (Cloudflare Pages)
    if (env.ASSETS && typeof env.ASSETS.fetch === 'function') {
      return env.ASSETS.fetch(req);
    }

    return new Response('Not Found', { status: 404 });
  },
};