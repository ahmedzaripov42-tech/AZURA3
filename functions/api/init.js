import { json, route, ensureOwner } from './_common.js';

export async function onRequestGet({ request, env }) {
  return route(async () => {
    await ensureOwner(env);
    return json({
      ok:true,
      service:'azura',
      ownerUid:'AZR-YJTF-QYGT',
      ownerReady:true,
      media: !!env.MEDIA,
      time:Date.now(),
    });
  }, request, env);
}

export async function onRequestOptions({ request, env }) {
  const { empty, corsHeaders } = await import('./_common.js');
  return empty(204, corsHeaders());
}
