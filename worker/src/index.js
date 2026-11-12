import { bytes, CATEGORIES, checkHtml, FRAME_CSP, frameDoc, parseLink, verifyInitData } from './lib.js';
import { categoryCounts, createDraft, fetchBotIcon, getBlob, getWidget, listWidgets, ownerId, publicColumns, putBlob, removeWidget } from './store.js';
import { handleUpdate, sendDemo, sendToModeration } from './bot.js';
import { shoot } from './shot.js';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
  'access-control-max-age': '86400',
};

class HttpError extends Error {
  constructor(status, code, extra) { super(code); this.status = status; this.code = code; this.extra = extra; }
}
const fail = (status, code, extra) => { throw new HttpError(status, code, extra); };
const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...CORS, ...headers } });

async function userOf(req, env) {
  const header = req.headers.get('authorization') || '';
  if (header.startsWith('tma ')) return verifyInitData(header.slice(4), env.BOT_TOKEN);
  // Local development only: DEV is set in .dev.vars and never in production
  if (env.DEV === '1' && header.startsWith('dev ')) return { id: Number(header.slice(4)) || 1, first_name: 'Dev', language_code: 'ru' };
  return null;
}
const needUser = async (req, env) => (await userOf(req, env)) || fail(401, 'auth');

const view = (w) => ({
  id: w.id, status: w.status, name: w.name, short: w.short, category: w.category, bot: w.bot, link: w.link,
  featured: !!w.featured, opens: w.opens + w.demos, icon_v: Math.max(0, w.icon_v), shot_v: Math.max(0, w.shot_v), shot_h: w.shot_h,
  size: w.size, packed: w.packed, published: w.published, created: w.created,
});

async function ownedWidget(env, user, id) {
  const w = await getWidget(env, id);
  if (!w) fail(404, 'not_found');
  if (w.owner_id !== user.id && user.id !== (await ownerId(env))) fail(403, 'forbidden');
  return w;
}

function decodeIcon(dataUrl) {
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
  if (!m) fail(400, 'bad_icon');
  const bin = atob(m[2]);
  if (bin.length > 120000) fail(400, 'icon_too_big');
  const data = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
  return { type: m[1], data };
}

const clean = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

async function api(req, env, ctx, url) {
  const parts = url.pathname.split('/').filter(Boolean).slice(1);
  const method = req.method;
  const origin = url.origin;

  if (method === 'GET' && parts[0] === 'home') {
    const [featured, fresh, top, counts] = await Promise.all([
      listWidgets(env, { sort: 'featured', limit: 8 }),
      listWidgets(env, { limit: 10 }),
      listWidgets(env, { sort: 'top', limit: 10 }),
      categoryCounts(env),
    ]);
    return json({ featured: featured.map(view), fresh: fresh.map(view), top: top.map(view), categories: CATEGORIES.map((id) => ({ id, count: counts[id] || 0 })) },
      200, { 'cache-control': 'public, max-age=20' });
  }

  if (method === 'GET' && parts[0] === 'widgets' && !parts[1]) {
    const category = url.searchParams.get('category');
    const list = await listWidgets(env, {
      category: CATEGORIES.includes(category) ? category : null,
      sort: url.searchParams.get('sort'),
      q: clean(url.searchParams.get('q'), 40),
      offset: Math.max(0, Number(url.searchParams.get('offset')) || 0),
      limit: 30,
    });
    return json({ items: list.map(view) });
  }

  if (method === 'GET' && parts[0] === 'me') {
    const user = await needUser(req, env);
    const res = await env.DB.prepare(`SELECT ${publicColumns} FROM widgets WHERE owner_id = ? ORDER BY created DESC LIMIT 50`).bind(user.id).all();
    return json({ items: res.results.map(view), admin: user.id === (await ownerId(env)) });
  }

  if (method === 'POST' && parts[0] === 'drafts') {
    const user = await needUser(req, env);
    const body = await req.json().catch(() => fail(400, 'bad_json'));
    const check = checkHtml(body.html);
    if (!check.ok) fail(400, check.error, { size: check.size, packed: check.packed });
    if (bytes(body.public_data) > 1024) fail(400, 'data_too_big');
    const id = await createDraft(env, user, { html: body.html, public_data: body.public_data || null, size: check.size, packed: check.packed, source: 'form' });
    return json({ id });
  }

  if (parts[0] === 'widgets' && parts[1]) {
    const id = parts[1], action = parts[2];

    if (method === 'GET' && !action) {
      const w = await getWidget(env, id);
      if (!w) fail(404, 'not_found');
      const user = w.status === 'published' ? null : await userOf(req, env);
      const mine = !!user && (w.owner_id === user.id || user.id === (await ownerId(env)));
      if (w.status !== 'published' && !mine) fail(404, 'not_found');
      if (w.status === 'published' && w.icon_v === 0) {
        // No icon yet: take the avatar of the author's bot once (-1 marks the attempt)
        const res = await env.DB.prepare('UPDATE widgets SET icon_v = -1 WHERE id = ? AND icon_v = 0').bind(id).run();
        if (res.meta.changes) ctx.waitUntil(fetchBotIcon(env, id, w.bot).catch((e) => console.error('icon', e.message)));
      }
      if (w.status === 'published' && w.shot_v === 0) {
        // First view of a widget without pictures: render them once in the background (-1 marks the attempt)
        const res = await env.DB.prepare('UPDATE widgets SET shot_v = -1 WHERE id = ? AND shot_v = 0').bind(id).run();
        if (res.meta.changes) ctx.waitUntil(shoot(env, origin, id).catch((e) => console.error('shot', e.message)));
      }
      return json({ ...view(w), description: w.description, public_data: mine ? w.public_data : undefined, height: w.height, mine });
    }

    if (method === 'POST' && action === 'open') {
      await env.DB.prepare("UPDATE widgets SET opens = opens + 1 WHERE id = ? AND status = 'published'").bind(id).run();
      return json({ ok: true });
    }

    if (method === 'POST' && action === 'demo') {
      const user = await needUser(req, env);
      const w = await getWidget(env, id);
      // A demo runs the widget for real inside Telegram, so only its author and the moderator may ask for one
      if (!w || (w.owner_id !== user.id && user.id !== (await ownerId(env)))) fail(404, 'not_found');
      try {
        await sendDemo(env, user, w);
      } catch (e) {
        fail(e.code === 403 ? 409 : 502, e.code === 403 ? 'start_bot' : 'telegram', { description: e.description });
      }
      await env.DB.prepare('UPDATE widgets SET demos = demos + 1 WHERE id = ?').bind(id).run();
      return json({ ok: true });
    }

    if (method === 'POST' && action === 'submit') {
      const user = await needUser(req, env);
      const w = await ownedWidget(env, user, id);
      const body = await req.json().catch(() => fail(400, 'bad_json'));
      const name = clean(body.name, 40), short = clean(body.short, 70);
      const description = String(body.description ?? '').trim().slice(0, 1500);
      const link = parseLink(body.link);
      if (name.length < 2) fail(400, 'name');
      if (short.length < 2) fail(400, 'short');
      if (!CATEGORIES.includes(body.category)) fail(400, 'category');
      if (!link) fail(400, 'link');
      const publicData = body.public_data === undefined ? w.public_data : body.public_data || null;
      if (bytes(publicData) > 1024) fail(400, 'data_too_big');
      let iconV = w.icon_v;
      if (body.icon) {
        const icon = decodeIcon(body.icon);
        await putBlob(env, id, 'icon', icon.type, icon.data);
        iconV = Date.now();
      }
      await env.DB.prepare(`UPDATE widgets SET name = ?, short = ?, description = ?, category = ?, bot = ?, link = ?, public_data = ?, icon_v = ?, status = 'pending' WHERE id = ?`)
        .bind(name, short, description, body.category, link.bot, link.link, publicData, iconV, id).run();
      // Without an uploaded icon the widget takes the avatar of the author's bot (again on every resubmit, the bot may have changed)
      if (!body.icon && (w.icon_v <= 0 || w.bot !== link.bot)) ctx.waitUntil(fetchBotIcon(env, id, link.bot).catch((e) => console.error('icon', e.message)));
      ctx.waitUntil(sendToModeration(env, await getWidget(env, id)).catch((e) => console.error('moderation', e.message)));
      return json({ ok: true, status: 'pending' });
    }

    if (method === 'DELETE' && !action) {
      const user = await needUser(req, env);
      await ownedWidget(env, user, id);
      await removeWidget(env, id);
      return json({ ok: true });
    }
  }

  fail(404, 'not_found');
}

async function frame(env, url, id) {
  const w = await getWidget(env, id);
  if (!w) return new Response('Not found', { status: 404 });
  return new Response(frameDoc(w, url.searchParams.get('theme')), {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // Only the catalog itself may embed a widget frame
      'content-security-policy': `${FRAME_CSP}; frame-ancestors ${new URL(env.WEB_URL).origin}`,
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'cache-control': w.status === 'published' ? 'public, max-age=300' : 'no-store',
    },
  });
}

async function image(env, id, kind) {
  if (!['icon', 'light', 'dark'].includes(kind)) return new Response('Not found', { status: 404 });
  const blob = await getBlob(env, id, kind);
  if (!blob) return new Response('Not found', { status: 404, headers: CORS });
  return new Response(blob.data, { headers: { 'content-type': blob.type, 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff', ...CORS } });
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const parts = url.pathname.split('/').filter(Boolean);
    try {
      if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
      if (parts[0] === 'tg' && req.method === 'POST') {
        if (!env.WEBHOOK_SECRET || req.headers.get('x-telegram-bot-api-secret-token') !== env.WEBHOOK_SECRET) return new Response('Forbidden', { status: 403 });
        const update = await req.json();
        try {
          await handleUpdate(env, ctx, url.origin, update);
        } catch (e) {
          console.error('update', e.message);
        }
        return new Response('ok');
      }
      if (parts[0] === 'api') return await api(req, env, ctx, url);
      if (parts[0] === 'frame' && parts[1] && req.method === 'GET') return await frame(env, url, parts[1]);
      if (parts[0] === 'img' && parts[2] && req.method === 'GET') return await image(env, parts[1], parts[2]);
      return new Response('Widgets Store API');
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.code, ...e.extra }, e.status);
      console.error('error', e.stack || e.message);
      return json({ error: 'internal' }, 500);
    }
  },
};
