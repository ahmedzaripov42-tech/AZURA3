import { json, route, OWNER_UID } from './_common.js';

export async function onRequestGet({ request, env }) {
  return route(async () => {
    const [usersRow, ownerRow, uploadsRow] = await Promise.all([
      env.DB.prepare('SELECT COUNT(*) c FROM users').first().catch(() => ({ c: 0 })),
      env.DB.prepare('SELECT uid FROM users WHERE uid=? LIMIT 1').bind(OWNER_UID).first().catch(() => null),
      env.DB.prepare("SELECT COUNT(*) c FROM sqlite_master WHERE type='table' AND name IN ('multipart_uploads','multipart_upload_parts','media_assets')").first().catch(() => ({ c: 0 })),
    ]);

    return json({
      ok:true,
      db:true,
      media: !!env.MEDIA,
      users:Number(usersRow?.c || 0),
      ownerReady: !!ownerRow,
      schema: { mediaTablesReady: Number(uploadsRow?.c || 0) >= 3 },
      time:Date.now(),
    });
  }, request, env);
}

export async function onRequestOptions({ request, env }) {
  const { empty, corsHeaders } = await import('./_common.js');
  return empty(204, corsHeaders());
}
