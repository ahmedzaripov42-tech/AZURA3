import { json, route } from './_common.js';

export async function onRequestGet({ request, env }) {
  return route(async () => {
    const bindings = { DB: !!env.DB, MEDIA: !!env.MEDIA };
    let db = { ok:false };
    if (env.DB) {
      const users = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users' LIMIT 1").first();
      const appData = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='app_data' LIMIT 1").first();
      db = { ok:true, usersTable: !!users, appDataTable: !!appData };
    }
    return json({ ok:true, bindings, db, version:'v17' });
  }, request, env);
}

export async function onRequestOptions({ request, env }) {
  const { empty, corsHeaders } = await import('./_common.js');
  return empty(204, corsHeaders());
}
