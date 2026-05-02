import {
  json,
  empty,
  corsHeaders,
  streamR2,
  requireStaff,
  cleanSlug,
  cleanText,
  badRequest,
  payloadTooLarge,
  clampInt,
  clampNumber,
  unprocessable,
  notFound,
  safeParse,
  requestId,
  ensureSchema,
} from './_common.js';

const SMALL_UPLOAD_MAX_BYTES = 64 * 1024 * 1024;
const DEFAULT_PART_SIZE = 32 * 1024 * 1024;
const MIN_PART_SIZE = 5 * 1024 * 1024;
const MAX_PART_SIZE = 256 * 1024 * 1024;
const MAX_PARTS = 10000;
const ALLOWED_MIME_PREFIXES = ['image/', 'video/', 'audio/'];
const ALLOWED_MIME_EXACT = new Set([
  'application/pdf',
  'application/zip',
  'application/json',
  'application/octet-stream',
  'text/plain',
]);

function withReqId(response, reqId) {
  const headers = new Headers((response && response.headers) || {});
  headers.set('x-azura-request-id', reqId);
  return new Response(response ? response.body : null, {
    status: response ? response.status : 500,
    statusText: response ? response.statusText : '',
    headers,
  });
}

function safeErrorDetail(error) {
  const detail = String((error && error.message) || error || '').trim();
  return detail ? detail.slice(0, 320) : '';
}

function jsonError(reqId, status, error, code, extra) {
  const payload = {
    ok: false,
    error: String(error || 'So‘rov bajarilmadi'),
    code: String(code || 'media_unknown_error'),
    requestId: reqId,
  };
  if (extra && typeof extra === 'object') {
    Object.keys(extra).forEach(function (key) {
      if (extra[key] !== undefined) payload[key] = extra[key];
    });
  }
  return json(payload, status, { 'x-azura-request-id': reqId });
}

function normalizeFailure(reqId, error) {
  const status = Number(error && error.statusCode) || (/Autentifikatsiya/i.test(String(error && error.message || '')) ? 401 : 500);
  const code = String(error && error.code || (status >= 500 ? 'media_unknown_error' : 'request_error'));
  const safeMessage = status >= 500 ? 'Server xatosi' : String((error && error.message) || 'So‘rov bajarilmadi');
  const extra = {};
  const detail = safeErrorDetail(error);
  if (detail && status >= 500) extra.detail = detail;
  return jsonError(reqId, status, safeMessage, code, extra);
}

async function runMedia(request, env, handler) {
  const reqId = requestId();
  try {
    const response = await handler(reqId);
    return withReqId(response instanceof Response ? response : json(response), reqId);
  } catch (error) {
    return normalizeFailure(reqId, error);
  }
}

function sanitizeName(value, fallback = 'media') {
  const raw = String(value || fallback).trim().replace(/[^a-zA-Z0-9._-]/g, '-');
  return raw.replace(/-+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 180) || fallback;
}

function sanitizeFolder(value, fallback = 'uploads') {
  const safe = String(value || fallback)
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .map(seg => cleanSlug(seg, '').replace(/^[-_.]+|[-_.]+$/g, ''))
    .filter(Boolean)
    .join('/');
  return safe || fallback;
}

function normalizeMediaKey(value) {
  return String(value || '')
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .map(seg => String(seg || '').replace(/[^a-zA-Z0-9._-]/g, ''))
    .filter(Boolean)
    .join('/')
    .slice(0, 512);
}

function mediaUrlForKey(key) {
  return '/api/media/' + String(key || '').split('/').filter(Boolean).map(seg => encodeURIComponent(seg)).join('/');
}

function legacyMediaUrlForKey(key) {
  return '/api/media?key=' + encodeURIComponent(String(key || ''));
}

function safeObjectKey(folder, filename) {
  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return sanitizeFolder(folder) + '/' + yyyy + '/' + mm + '/' + stamp + '-' + rand + '-' + sanitizeName(filename);
}

function isAllowedMime(mime) {
  const normalized = String(mime || '').toLowerCase();
  return !!normalized && (ALLOWED_MIME_EXACT.has(normalized) || ALLOWED_MIME_PREFIXES.some(prefix => normalized.startsWith(prefix)));
}

function arrayBufferFromView(view) {
  if (view instanceof ArrayBuffer) return view;
  if (ArrayBuffer.isView(view)) return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
  return view;
}

function base64ToBytes(base64) {
  const clean = String(base64 || '').replace(/\s+/g, '');
  if (!clean || clean.length % 4 === 1) return null;
  try {
    const bin = atob(clean);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch (_) {
    return null;
  }
}

function dataUrlToBytes(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;,]+)(?:;[^,]*)?;base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) return null;
  const mime = String(match[1] || 'application/octet-stream').toLowerCase();
  const bytes = base64ToBytes(match[2]);
  if (!bytes) return null;
  return { mime, bytes };
}

async function parseJsonBody(request, reqId) {
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object') throw new Error('invalid');
    return body;
  } catch (_) {
    return { __parseError: jsonError(reqId, 400, 'JSON body o‘qilmadi', 'media_invalid_json') };
  }
}

async function parseUpload(request, reqId) {
  const contentType = String(request.headers.get('content-type') || '');

  if (/multipart\/form-data/i.test(contentType)) {
    let form;
    try {
      form = await request.formData();
    } catch (error) {
      return { error: jsonError(reqId, 400, 'multipart/form-data o‘qilmadi', 'media_invalid_payload', { detail: safeErrorDetail(error) }) };
    }
    const file = form.get('file') || form.get('media') || form.get('upload');
    if (!file || typeof file.arrayBuffer !== 'function') {
      return { error: jsonError(reqId, 400, 'file kerak', 'media_invalid_payload') };
    }
    const buffer = await file.arrayBuffer().catch(() => null);
    if (!buffer) return { error: jsonError(reqId, 400, 'Fayl o‘qilmadi', 'media_invalid_payload') };
    const mime = cleanText(form.get('contentType') || form.get('mime') || form.get('type') || file.type || 'application/octet-stream', 'application/octet-stream', 120).toLowerCase();
    return {
      mode: 'multipart',
      filename: sanitizeName(form.get('filename') || file.name || 'media_' + Date.now()),
      folder: sanitizeFolder(form.get('folder') || form.get('kind') || 'uploads'),
      kind: cleanText(form.get('kind') || form.get('folder') || 'upload', 'upload', 64),
      mime,
      binary: new Uint8Array(buffer),
      size: buffer.byteLength,
      metadataOnly: false,
    };
  }

  if (/application\/json|text\/plain|^$/i.test(contentType)) {
    const body = await parseJsonBody(request, reqId);
    if (body && body.__parseError) return { error: body.__parseError };

    const filename = sanitizeName(body.filename || body.name || ('media_' + Date.now()));
    const folder = sanitizeFolder(body.folder || body.kind || 'uploads');
    const kind = cleanText(body.kind || body.folder || 'upload', 'upload', 64);
    const dataUrl = String(body.dataUrl || body.dataURL || body.data || '');
    if (dataUrl.startsWith('data:')) {
      const parsed = dataUrlToBytes(dataUrl);
      if (!parsed) return { error: jsonError(reqId, 400, 'dataURL formati noto‘g‘ri', 'media_invalid_payload') };
      return {
        mode: 'json-data-url',
        filename,
        folder,
        kind,
        mime: cleanText(body.contentType || body.mime || parsed.mime || 'application/octet-stream', 'application/octet-stream', 120).toLowerCase(),
        binary: parsed.bytes,
        size: parsed.bytes.byteLength,
        metadataOnly: false,
      };
    }

    const base64 = String(body.contentBase64 || body.base64 || body.fileBase64 || '');
    if (base64) {
      const bytes = base64ToBytes(base64);
      if (!bytes) return { error: jsonError(reqId, 400, 'base64 formati noto‘g‘ri', 'media_invalid_payload') };
      return {
        mode: 'json-base64',
        filename,
        folder,
        kind,
        mime: cleanText(body.contentType || body.mime || 'application/octet-stream', 'application/octet-stream', 120).toLowerCase(),
        binary: bytes,
        size: bytes.byteLength,
        metadataOnly: false,
      };
    }

    if (body.key || body.url) {
      return {
        mode: 'metadata-only',
        filename,
        folder,
        kind,
        mime: cleanText(body.contentType || body.mime || 'application/octet-stream', 'application/octet-stream', 120).toLowerCase(),
        binary: null,
        size: clampInt(body.size || 0, 0, Number.MAX_SAFE_INTEGER, 0),
        metadataOnly: true,
        key: normalizeMediaKey(body.key || ''),
        url: String(body.url || ''),
        extra: body.extra && typeof body.extra === 'object' ? body.extra : {},
      };
    }

    return { error: jsonError(reqId, 400, 'dataURL, contentBase64, metadata yoki multipart file kerak', 'media_invalid_payload') };
  }

  return { error: jsonError(reqId, 400, 'Qo‘llab-quvvatlanmagan content-type', 'media_invalid_payload') };
}

function getPathKey(request) {
  const url = new URL(request.url);
  const pathname = String(url.pathname || '');
  const prefix = '/api/media/';
  if (pathname.startsWith(prefix) && pathname.length > prefix.length) {
    return normalizeMediaKey(pathname.slice(prefix.length).split('/').filter(Boolean).map(function (part) {
      try { return decodeURIComponent(part); } catch (_) { return part; }
    }).join('/'));
  }
  return normalizeMediaKey(url.searchParams.get('key') || '');
}

function supportedMethodsPayload() {
  return {
    ok: true,
    endpoint: 'media',
    methods: ['GET', 'POST', 'HEAD', 'OPTIONS', 'PUT', 'DELETE'],
    uploads: ['json:dataUrl', 'json:contentBase64', 'multipart/form-data', 'metadata-only'],
  };
}

async function audit(env, actorUid, action, targetId, meta) {
  if (!env || !env.DB) return;
  try {
    const t = Date.now();
    await env.DB.prepare(
      'INSERT INTO audit_log (id, actorUid, action, targetType, targetId, meta, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind('audit_' + t + '_' + Math.random().toString(36).slice(2, 7), actorUid || '', action || '', 'media', targetId || '', JSON.stringify(meta || {}), t).run();
  } catch (_) {}
}

async function saveMediaAsset(env, sessionUid, payload) {
  const t = Date.now();
  const row = {
    id: String(payload.id || ('media_' + t + '_' + Math.random().toString(36).slice(2, 7))),
    key: normalizeMediaKey(payload.key || ''),
    url: String(payload.url || mediaUrlForKey(payload.key || '')),
    filename: sanitizeName(payload.filename || 'media'),
    mime: cleanText(payload.mime || payload.contentType || 'application/octet-stream', 'application/octet-stream', 120).toLowerCase(),
    size: clampInt(payload.size || 0, 0, Number.MAX_SAFE_INTEGER, 0),
    folder: sanitizeFolder(payload.folder || 'uploads'),
    kind: cleanText(payload.kind || payload.folder || 'upload', 'upload', 64),
    createdBy: String(sessionUid || payload.createdBy || ''),
    createdAt: t,
    updatedAt: t,
    extra: JSON.stringify(payload.extra || {}),
  };

  if (!env || !env.DB) return { row, warning: 'metadata_db_missing' };

  try {
    await ensureSchema(env);
    await env.DB.prepare(
      `INSERT INTO media_assets (id, key, url, filename, mime, content_type, size, folder, kind, status, createdBy, created_by, createdAt, created_at, updatedAt, updated_at, extra)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         key=excluded.key,
         url=excluded.url,
         filename=excluded.filename,
         mime=excluded.mime,
         content_type=excluded.content_type,
         size=excluded.size,
         folder=excluded.folder,
         kind=excluded.kind,
         status='active',
         createdBy=excluded.createdBy,
         created_by=excluded.created_by,
         updatedAt=excluded.updatedAt,
         updated_at=excluded.updated_at,
         extra=excluded.extra`
    ).bind(
      row.id,
      row.key,
      row.url,
      row.filename,
      row.mime,
      row.mime,
      row.size,
      row.folder,
      row.kind,
      row.createdBy,
      row.createdBy,
      row.createdAt,
      row.createdAt,
      row.updatedAt,
      row.updatedAt,
      row.extra,
    ).run();
    return { row, warning: '' };
  } catch (error) {
    console.warn('[AZURA media metadata save]', safeErrorDetail(error));
    return { row, warning: 'metadata_save_failed' };
  }
}

async function requireStaffForMedia(env, request, reqId) {
  if (!env || !env.DB) {
    return { error: jsonError(reqId, 503, 'DB binding is not configured for authenticated media actions', 'db_binding_missing') };
  }
  try {
    await ensureSchema(env);
    const session = await requireStaff(env, request);
    return { session };
  } catch (error) {
    const status = Number(error && error.statusCode) || 401;
    const code = String(error && error.code || 'auth_failed');
    return { error: jsonError(reqId, status, String((error && error.message) || 'Autentifikatsiya talab qilinadi'), code) };
  }
}

function calcPartPlan(size, requestedPartSize) {
  const safeSize = clampNumber(size || 0, 0, Number.MAX_SAFE_INTEGER, 0);
  let partSize = clampInt(requestedPartSize || DEFAULT_PART_SIZE, MIN_PART_SIZE, MAX_PART_SIZE, DEFAULT_PART_SIZE);
  if (safeSize > 0) {
    partSize = Math.max(partSize, Math.ceil(safeSize / MAX_PARTS));
    partSize = Math.min(Math.max(partSize, MIN_PART_SIZE), MAX_PART_SIZE);
  }
  const partCount = safeSize > 0 ? Math.max(1, Math.ceil(safeSize / partSize)) : 1;
  if (partCount > MAX_PARTS) payloadTooLarge('Fayl bo‘laklari soni juda ko‘p', 'too_many_parts');
  return { partSize, partCount };
}

async function getUploadRow(env, uploadId) {
  if (!env || !env.DB) return null;
  return env.DB.prepare('SELECT * FROM multipart_uploads WHERE uploadId=? LIMIT 1').bind(String(uploadId || '')).first();
}

async function listUploadParts(env, uploadId) {
  if (!env || !env.DB) return [];
  const out = await env.DB.prepare('SELECT * FROM multipart_upload_parts WHERE uploadId=? ORDER BY partNumber ASC').bind(String(uploadId || '')).all().catch(() => ({ results: [] }));
  return (out.results || []).map(function (row) {
    return {
      uploadId: String(row.uploadId || ''),
      partNumber: Number(row.partNumber || 0),
      etag: String(row.etag || ''),
      size: Number(row.size || 0),
      createdAt: Number(row.createdAt || 0),
    };
  });
}

async function updateUploadStatus(env, uploadId, status, extra) {
  if (!env || !env.DB) return;
  const current = await getUploadRow(env, uploadId);
  const mergedExtra = Object.assign({}, safeParse(current && current.extra, {}) || {}, extra && typeof extra === 'object' ? extra : {});
  await env.DB.prepare('UPDATE multipart_uploads SET status=?, updatedAt=?, extra=? WHERE uploadId=?')
    .bind(String(status || (current && current.status) || 'initiated'), Date.now(), JSON.stringify(mergedExtra), String(uploadId || '')).run();
}

async function handleMultipartInit(request, env, session, reqId) {
  if (!env || !env.MEDIA || typeof env.MEDIA.createMultipartUpload !== 'function') {
    return jsonError(reqId, 503, 'R2 MEDIA binding is not configured', 'media_binding_missing');
  }
  if (!env.DB) {
    return jsonError(reqId, 503, 'DB binding is not configured for multipart uploads', 'db_binding_missing');
  }
  const body = await parseJsonBody(request, reqId);
  if (body.__parseError) return body.__parseError;
  const size = clampInt(body.size || 0, 0, Number.MAX_SAFE_INTEGER, 0);
  if (!size) badRequest('size kerak', 'missing_size');
  const filename = sanitizeName(body.filename || ('media_' + Date.now()));
  const folder = sanitizeFolder(body.folder || 'uploads');
  const kind = cleanText(body.kind || folder, folder, 64);
  const mime = cleanText(body.mime || body.contentType || 'application/octet-stream', 'application/octet-stream', 120).toLowerCase();
  if (!isAllowedMime(mime)) unprocessable('Bu media turi qo‘llab-quvvatlanmaydi', 'unsupported_media_type');
  const plan = calcPartPlan(size, body.partSize || 0);
  const key = safeObjectKey(folder, filename);

  let started;
  try {
    started = await env.MEDIA.createMultipartUpload(key, {
      httpMetadata: { contentType: mime, cacheControl: 'public, max-age=31536000, immutable' },
      customMetadata: { originalName: filename, uploadedBy: session.user.uid, kind },
    });
  } catch (error) {
    return jsonError(reqId, 502, 'R2 multipart boshlanmadi', 'media_r2_put_failed', { detail: safeErrorDetail(error) });
  }

  const t = Date.now();
  await env.DB.prepare(
    `INSERT INTO multipart_uploads (uploadId, key, filename, folder, mime, size, partSize, partCount, status, createdBy, createdAt, updatedAt, extra)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'initiated', ?, ?, ?, ?)
     ON CONFLICT(uploadId) DO UPDATE SET
       key=excluded.key,
       filename=excluded.filename,
       folder=excluded.folder,
       mime=excluded.mime,
       size=excluded.size,
       partSize=excluded.partSize,
       partCount=excluded.partCount,
       status='initiated',
       createdBy=excluded.createdBy,
       updatedAt=excluded.updatedAt,
       extra=excluded.extra`
  ).bind(
    started.uploadId,
    key,
    filename,
    folder,
    mime,
    size,
    plan.partSize,
    plan.partCount,
    session.user.uid,
    t,
    t,
    JSON.stringify({ kind, contentId: cleanSlug(body.contentId || '', ''), chapterId: cleanSlug(body.chapterId || '', ''), originalFilename: filename }),
  ).run();

  await audit(env, session.user.uid, 'media.multipart.init', started.uploadId, { key, folder, size, partSize: plan.partSize, partCount: plan.partCount, mime, kind });
  return json({
    ok: true,
    uploadId: started.uploadId,
    key,
    url: mediaUrlForKey(key),
    folder,
    filename,
    mime,
    kind,
    size,
    partSize: plan.partSize,
    partCount: plan.partCount,
    minPartSize: MIN_PART_SIZE,
    maxPartSize: MAX_PART_SIZE,
  });
}

async function handleMultipartPart(request, env, session, reqId) {
  if (!env || !env.MEDIA || typeof env.MEDIA.resumeMultipartUpload !== 'function') {
    return jsonError(reqId, 503, 'R2 MEDIA binding is not configured', 'media_binding_missing');
  }
  if (!env.DB) {
    return jsonError(reqId, 503, 'DB binding is not configured for multipart uploads', 'db_binding_missing');
  }
  const url = new URL(request.url);
  const uploadId = cleanText(url.searchParams.get('uploadId') || '', '', 256);
  const partNumber = clampInt(url.searchParams.get('partNumber') || 0, 1, MAX_PARTS, 0);
  if (!uploadId || !partNumber) return jsonError(reqId, 400, 'uploadId va partNumber kerak', 'media_invalid_payload');
  const uploadRow = await getUploadRow(env, uploadId);
  if (!uploadRow) return jsonError(reqId, 404, 'Multipart upload topilmadi', 'upload_not_found');
  if (!['initiated', 'uploading'].includes(String(uploadRow.status || ''))) return jsonError(reqId, 409, 'Multipart upload yopilgan', 'upload_closed');
  if (String(uploadRow.createdBy || '') !== String(session.user.uid || '') && session.user.role !== 'owner') return jsonError(reqId, 403, 'Bu upload sizga tegishli emas', 'forbidden');

  const bytes = await request.arrayBuffer().catch(() => null);
  if (!bytes) return jsonError(reqId, 400, 'Part body o‘qilmadi', 'media_invalid_payload');
  const size = bytes.byteLength;
  if (!size && partNumber !== Number(uploadRow.partCount || 1)) return jsonError(reqId, 400, 'Bo‘sh part faqat oxirgi bo‘lak uchun mumkin', 'empty_part');
  if (size > MAX_PART_SIZE) payloadTooLarge('Part juda katta');

  let uploaded;
  try {
    uploaded = await env.MEDIA.resumeMultipartUpload(String(uploadRow.key || ''), uploadId).uploadPart(partNumber, bytes);
  } catch (error) {
    const detail = safeErrorDetail(error);
    return jsonError(reqId, /NoSuchUpload/i.test(detail) ? 404 : 500, detail || 'Part upload xatosi', /NoSuchUpload/i.test(detail) ? 'upload_not_found' : 'media_r2_put_failed');
  }

  const etag = String((uploaded && (uploaded.etag || uploaded.httpEtag)) || '').replace(/^"|"$/g, '');
  const createdAt = Date.now();
  await env.DB.prepare(
    `INSERT INTO multipart_upload_parts (uploadId, partNumber, etag, size, createdAt)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(uploadId, partNumber) DO UPDATE SET etag=excluded.etag, size=excluded.size, createdAt=excluded.createdAt`
  ).bind(uploadId, partNumber, etag, size, createdAt).run();
  await updateUploadStatus(env, uploadId, 'uploading', { lastPartNumber: partNumber, lastPartAt: createdAt });

  return json({ ok: true, uploadId, partNumber, etag, size, uploadedAt: createdAt });
}

async function handleMultipartComplete(request, env, session, reqId) {
  if (!env || !env.MEDIA || typeof env.MEDIA.resumeMultipartUpload !== 'function') {
    return jsonError(reqId, 503, 'R2 MEDIA binding is not configured', 'media_binding_missing');
  }
  if (!env.DB) {
    return jsonError(reqId, 503, 'DB binding is not configured for multipart uploads', 'db_binding_missing');
  }
  const body = await parseJsonBody(request, reqId);
  if (body.__parseError) return body.__parseError;
  const uploadId = cleanText(body.uploadId || '', '', 256);
  if (!uploadId) return jsonError(reqId, 400, 'uploadId kerak', 'missing_upload_id');
  const uploadRow = await getUploadRow(env, uploadId);
  if (!uploadRow) return jsonError(reqId, 404, 'Multipart upload topilmadi', 'upload_not_found');
  if (!['initiated', 'uploading'].includes(String(uploadRow.status || ''))) return jsonError(reqId, 409, 'Multipart upload yopilgan', 'upload_closed');
  if (String(uploadRow.createdBy || '') !== String(session.user.uid || '') && session.user.role !== 'owner') return jsonError(reqId, 403, 'Bu upload sizga tegishli emas', 'forbidden');

  let parts = Array.isArray(body.parts) ? body.parts.map(function (part) {
    return { partNumber: clampInt(part && part.partNumber || 0, 1, MAX_PARTS, 0), etag: String(part && part.etag || '').replace(/^"|"$/g, '') };
  }).filter(function (part) { return part.partNumber && part.etag; }) : [];
  if (!parts.length) parts = await listUploadParts(env, uploadId);
  parts = parts.filter(function (part) { return part && part.partNumber; }).sort(function (a, b) { return Number(a.partNumber || 0) - Number(b.partNumber || 0); });
  if (!parts.length) return jsonError(reqId, 400, 'Multipart parts topilmadi', 'missing_parts');
  const expectedCount = Number(uploadRow.partCount || parts.length || 1);
  if (parts.length < expectedCount) return jsonError(reqId, 409, 'Hali barcha bo‘laklar yuklanmagan (' + parts.length + '/' + expectedCount + ')', 'parts_incomplete');

  let completed;
  try {
    completed = await env.MEDIA.resumeMultipartUpload(String(uploadRow.key || ''), uploadId)
      .complete(parts.map(function (part) { return { partNumber: Number(part.partNumber), etag: String(part.etag) }; }));
  } catch (error) {
    const detail = safeErrorDetail(error);
    return jsonError(reqId, /NoSuchUpload/i.test(detail) ? 404 : 500, detail || 'Multipart complete xatosi', /NoSuchUpload/i.test(detail) ? 'upload_not_found' : 'media_r2_put_failed');
  }

  const saved = await saveMediaAsset(env, session.user.uid, {
    key: String(uploadRow.key || ''),
    url: mediaUrlForKey(uploadRow.key || ''),
    filename: String(uploadRow.filename || ''),
    mime: String(uploadRow.mime || 'application/octet-stream'),
    size: Number(uploadRow.size || 0),
    folder: String(uploadRow.folder || 'uploads'),
    kind: cleanText((safeParse(uploadRow.extra, {}) || {}).kind || uploadRow.folder || 'upload', 'upload', 64),
    extra: { uploadId, partCount: parts.length, completedAt: Date.now(), etag: String((completed && (completed.httpEtag || completed.etag)) || '').replace(/^"|"$/g, '') },
  });

  await env.DB.prepare('UPDATE multipart_uploads SET status=\'completed\', updatedAt=?, completedAt=?, mediaAssetId=?, extra=? WHERE uploadId=?')
    .bind(Date.now(), Date.now(), saved.row.id, JSON.stringify(Object.assign({}, safeParse(uploadRow.extra, {}) || {}, { completedEtag: String((completed && (completed.httpEtag || completed.etag)) || '').replace(/^"|"$/g, ''), mediaAssetId: saved.row.id })), uploadId).run();

  await audit(env, session.user.uid, 'media.multipart.complete', uploadId, { key: uploadRow.key, mediaAssetId: saved.row.id, parts: parts.length, size: Number(uploadRow.size || 0) });
  const out = { ok: true, uploadId, asset: { id: saved.row.id, key: saved.row.key, url: saved.row.url, mime: saved.row.mime, contentType: saved.row.mime, size: saved.row.size, folder: saved.row.folder, filename: String(uploadRow.filename || '') } };
  if (saved.warning) out.warning = saved.warning;
  return json(out);
}

async function handleMultipartAbort(request, env, session, reqId) {
  if (!env || !env.MEDIA || typeof env.MEDIA.resumeMultipartUpload !== 'function') {
    return jsonError(reqId, 503, 'R2 MEDIA binding is not configured', 'media_binding_missing');
  }
  if (!env.DB) {
    return jsonError(reqId, 503, 'DB binding is not configured for multipart uploads', 'db_binding_missing');
  }
  const url = new URL(request.url);
  const uploadId = cleanText(url.searchParams.get('uploadId') || '', '', 256);
  if (!uploadId) return jsonError(reqId, 400, 'uploadId kerak', 'missing_upload_id');
  const uploadRow = await getUploadRow(env, uploadId);
  if (!uploadRow) return json({ ok: true, aborted: true, uploadId });
  if (String(uploadRow.createdBy || '') !== String(session.user.uid || '') && session.user.role !== 'owner') return jsonError(reqId, 403, 'Bu upload sizga tegishli emas', 'forbidden');
  try {
    await env.MEDIA.resumeMultipartUpload(String(uploadRow.key || ''), uploadId).abort();
  } catch (_) {}
  await env.DB.prepare('UPDATE multipart_uploads SET status=\'aborted\', updatedAt=?, completedAt=? WHERE uploadId=?').bind(Date.now(), Date.now(), uploadId).run();
  await env.DB.prepare('DELETE FROM multipart_upload_parts WHERE uploadId=?').bind(uploadId).run();
  await audit(env, session.user.uid, 'media.multipart.abort', uploadId, { key: uploadRow.key });
  return json({ ok: true, aborted: true, uploadId });
}

async function streamMedia(request, env, key, reqId, options) {
  try {
    return await streamR2(env, request, key, options || {});
  } catch (error) {
    return jsonError(reqId, 500, 'Media stream xatosi', 'media_stream_failed', { detail: safeErrorDetail(error) });
  }
}

export async function onRequestGet({ request, env }) {
  return runMedia(request, env, async function (reqId) {
    const url = new URL(request.url);
    const action = String(url.searchParams.get('action') || '').toLowerCase();

    if (action === 'status') {
      const auth = await requireStaffForMedia(env, request, reqId);
      if (auth.error) return auth.error;
      const uploadId = cleanText(url.searchParams.get('uploadId') || '', '', 256);
      if (!uploadId) return jsonError(reqId, 400, 'uploadId kerak', 'missing_upload_id');
      const row = await getUploadRow(env, uploadId);
      if (!row) return jsonError(reqId, 404, 'Multipart upload topilmadi', 'upload_not_found');
      if (String(row.createdBy || '') !== String(auth.session.user.uid || '') && auth.session.user.role !== 'owner') return jsonError(reqId, 403, 'Ruxsat yo‘q', 'forbidden');
      return json({ ok: true, upload: Object.assign({}, row, { size: Number(row.size || 0), partSize: Number(row.partSize || 0), partCount: Number(row.partCount || 0), createdAt: Number(row.createdAt || 0), updatedAt: Number(row.updatedAt || 0), completedAt: Number(row.completedAt || 0), extra: safeParse(row.extra, {}) }), parts: await listUploadParts(env, uploadId) });
    }

    if (url.searchParams.get('list') === '1' || action === 'list') {
      const auth = await requireStaffForMedia(env, request, reqId);
      if (auth.error) return auth.error;
      if (!env || !env.DB) return jsonError(reqId, 503, 'DB binding is not configured', 'db_binding_missing');
      const folder = sanitizeFolder(url.searchParams.get('folder') || '', '');
      const status = ['active', 'deleted'].includes(String(url.searchParams.get('status') || '')) ? String(url.searchParams.get('status')) : 'active';
      const limit = clampInt(url.searchParams.get('limit') || 120, 1, 200, 120);
      const query = folder
        ? env.DB.prepare('SELECT * FROM media_assets WHERE status=? AND folder=? ORDER BY COALESCE(updatedAt, createdAt, updated_at, created_at, 0) DESC LIMIT ?').bind(status, folder, limit)
        : env.DB.prepare('SELECT * FROM media_assets WHERE status=? ORDER BY COALESCE(updatedAt, createdAt, updated_at, created_at, 0) DESC LIMIT ?').bind(status, limit);
      const rows = await query.all().catch(() => ({ results: [] }));
      return json({ ok: true, assets: rows.results || [] });
    }

    const key = getPathKey(request);
    if (!key) return json(supportedMethodsPayload());
    return streamMedia(request, env, key, reqId, { forceJsonError: /application\/json/i.test(String(request.headers.get('accept') || '')) });
  });
}

export async function onRequestHead({ request, env }) {
  return runMedia(request, env, async function (reqId) {
    const key = getPathKey(request);
    if (!key) return jsonError(reqId, 400, 'key kerak', 'missing_key');
    return streamMedia(request, env, key, reqId, { head: true, forceJsonError: true });
  });
}

export async function onRequestPost({ request, env }) {
  return runMedia(request, env, async function (reqId) {
    const auth = await requireStaffForMedia(env, request, reqId);
    if (auth.error) return auth.error;
    const session = auth.session;

    let action = '';
    const contentType = String(request.headers.get('content-type') || '');
    if (/application\/json|text\/plain/i.test(contentType)) {
      const body = await request.clone().json().catch(() => null);
      action = String(body && body.action || '').toLowerCase();
    }

    if (action === 'multipart/init') return handleMultipartInit(request, env, session, reqId);
    if (action === 'multipart/complete') return handleMultipartComplete(request, env, session, reqId);

    const upload = await parseUpload(request, reqId);
    if (upload.error) return upload.error;

    if (upload.metadataOnly) {
      const savedMeta = await saveMediaAsset(env, session.user.uid, {
        key: upload.key,
        url: upload.url || mediaUrlForKey(upload.key || ''),
        filename: upload.filename,
        mime: upload.mime,
        size: upload.size,
        folder: upload.folder,
        kind: upload.kind,
        extra: upload.extra || {},
      });
      const out = { ok: true, id: savedMeta.row.id, key: savedMeta.row.key, url: savedMeta.row.url, contentType: savedMeta.row.mime, size: savedMeta.row.size };
      if (savedMeta.warning) out.warning = savedMeta.warning;
      return json(out);
    }

    if (!isAllowedMime(upload.mime)) unprocessable('Bu media turi qo‘llab-quvvatlanmaydi', 'unsupported_media_type');
    if (!upload.binary || upload.binary.byteLength < 1) return jsonError(reqId, 400, 'Bo‘sh fayl yuklab bo‘lmaydi', 'media_invalid_payload');
    if (upload.binary.byteLength > SMALL_UPLOAD_MAX_BYTES) payloadTooLarge('Fayl juda katta, multipart upload ishlating', 'payload_too_large');
    if (!env || !env.MEDIA) return jsonError(reqId, 503, 'R2 MEDIA binding is not configured', 'media_binding_missing');

    const safeFolder = sanitizeFolder(upload.folder || 'uploads');
    const safeFilename = sanitizeName(upload.filename || ('media_' + Date.now()));
    const key = safeObjectKey(safeFolder, safeFilename);

    try {
      await env.MEDIA.put(key, arrayBufferFromView(upload.binary), {
        httpMetadata: {
          contentType: upload.mime,
          cacheControl: 'public, max-age=31536000, immutable',
        },
        customMetadata: {
          originalName: safeFilename,
          uploadedBy: session.user.uid,
          kind: cleanText(upload.kind || safeFolder, safeFolder, 64),
        },
      });
    } catch (error) {
      return jsonError(reqId, 502, 'R2 upload bajarilmadi', 'media_r2_put_failed', { detail: safeErrorDetail(error) });
    }

    const saved = await saveMediaAsset(env, session.user.uid, {
      key,
      url: mediaUrlForKey(key),
      filename: safeFilename,
      mime: upload.mime,
      size: upload.binary.byteLength,
      folder: safeFolder,
      kind: cleanText(upload.kind || safeFolder, safeFolder, 64),
      extra: { filename: safeFilename, legacyUrl: legacyMediaUrlForKey(key) },
    });

    await audit(env, session.user.uid, 'media.upload', saved.row.id, { key, mime: upload.mime, size: upload.binary.byteLength, folder: safeFolder });
    const out = {
      ok: true,
      id: saved.row.id,
      key,
      url: saved.row.url,
      legacyUrl: legacyMediaUrlForKey(key),
      mime: upload.mime,
      contentType: upload.mime,
      size: upload.binary.byteLength,
      folder: safeFolder,
      kind: cleanText(upload.kind || safeFolder, safeFolder, 64),
      filename: safeFilename,
    };
    if (saved.warning) out.warning = saved.warning;
    return json(out);
  });
}

export async function onRequestPut({ request, env }) {
  return runMedia(request, env, async function (reqId) {
    const auth = await requireStaffForMedia(env, request, reqId);
    if (auth.error) return auth.error;
    const action = String(new URL(request.url).searchParams.get('action') || '').toLowerCase();
    if (action !== 'part') return jsonError(reqId, 400, 'Noto‘g‘ri action', 'invalid_action');
    return handleMultipartPart(request, env, auth.session, reqId);
  });
}

export async function onRequestDelete({ request, env }) {
  return runMedia(request, env, async function (reqId) {
    const auth = await requireStaffForMedia(env, request, reqId);
    if (auth.error) return auth.error;
    const session = auth.session;
    const url = new URL(request.url);
    const action = String(url.searchParams.get('action') || '').toLowerCase();
    if (action === 'abort') return handleMultipartAbort(request, env, session, reqId);

    const key = getPathKey(request);
    if (!key) return jsonError(reqId, 400, 'key kerak', 'missing_key');
    if (!env || !env.MEDIA) return jsonError(reqId, 503, 'R2 MEDIA binding is not configured', 'media_binding_missing');

    const normalizedKey = normalizeMediaKey(key);
    try {
      await env.MEDIA.delete(normalizedKey);
    } catch (error) {
      return jsonError(reqId, 500, 'Media o‘chirilmadi', 'media_stream_failed', { detail: safeErrorDetail(error) });
    }

    let warning = '';
    if (env.DB) {
      try {
        const current = await env.DB.prepare('SELECT extra FROM media_assets WHERE key=? LIMIT 1').bind(normalizedKey).first();
        const extra = Object.assign({}, current && current.extra ? safeParse(current.extra, {}) : {}, { deletedAt: Date.now(), deletedBy: session.user.uid });
        await env.DB.prepare('UPDATE media_assets SET status=\'deleted\', extra=?, updatedAt=?, updated_at=? WHERE key=?').bind(JSON.stringify(extra), Date.now(), Date.now(), normalizedKey).run();
      } catch (_) {
        warning = 'metadata_save_failed';
      }
    } else {
      warning = 'metadata_db_missing';
    }

    await audit(env, session.user.uid, 'media.delete', normalizedKey, { key: normalizedKey });
    return json(Object.assign({ ok: true, key: normalizedKey }, warning ? { warning } : {}));
  });
}

export async function onRequestOptions() {
  return empty(204, corsHeaders());
}
