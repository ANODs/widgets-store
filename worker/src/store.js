import { newId } from './lib.js';

const PUBLIC = 'id, status, name, short, category, bot, link, featured, opens, demos, icon_v, shot_v, shot_h, size, packed, published, created';

export const publicColumns = PUBLIC;

export async function getSetting(env, key) {
  const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first();
  return row ? row.value : null;
}

export async function setSetting(env, key, value) {
  await env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .bind(key, String(value)).run();
}

export async function ownerId(env) {
  if (env.OWNER_ID) return Number(env.OWNER_ID);
  const v = await getSetting(env, 'owner_id');
  return v ? Number(v) : null;
}

export async function claimOwner(env, userId) {
  if (env.OWNER_ID) return false;
  const res = await env.DB.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('owner_id', ?)").bind(String(userId)).run();
  if (!res.meta.changes) return false;
  // Widgets added before the catalog had an owner become the owner's
  await env.DB.prepare('UPDATE widgets SET owner_id = ? WHERE owner_id = 0').bind(userId).run();
  return true;
}

export const getWidget = (env, id) => env.DB.prepare('SELECT * FROM widgets WHERE id = ?').bind(id).first();

export async function createDraft(env, user, w) {
  const id = newId();
  // Keep at most 10 unfinished drafts per author
  await env.DB.prepare(`DELETE FROM widgets WHERE status = 'draft' AND owner_id = ? AND id NOT IN
    (SELECT id FROM widgets WHERE status = 'draft' AND owner_id = ? ORDER BY created DESC LIMIT 9)`).bind(user.id, user.id).run();
  await env.DB.prepare(`INSERT INTO widgets (id, owner_id, owner_name, html, public_data, chat_data, width, height, size, packed, source, bot, link, created)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, user.id, user.username ? `@${user.username}` : user.first_name || '', w.html, w.public_data ?? null, w.chat_data ?? null,
      w.width || 0, w.height || 0, w.size, w.packed, w.source || 'file', w.bot || '', w.bot ? `https://t.me/${w.bot}` : '', Date.now())
    .run();
  return id;
}

export async function listWidgets(env, { category, sort, q, limit = 30, offset = 0 } = {}) {
  const where = ["status = 'published'"], args = [];
  if (category) { where.push('category = ?'); args.push(category); }
  if (q) {
    const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    where.push("(name LIKE ? ESCAPE '\\' OR short LIKE ? ESCAPE '\\' OR bot LIKE ? ESCAPE '\\')");
    args.push(like, like, like);
  }
  const order = sort === 'top' ? 'opens + demos DESC, published DESC' : sort === 'featured' ? 'featured DESC, published DESC' : 'published DESC';
  const res = await env.DB.prepare(`SELECT ${PUBLIC} FROM widgets WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ? OFFSET ?`)
    .bind(...args, Math.min(50, limit), offset).all();
  return res.results;
}

export async function categoryCounts(env) {
  const res = await env.DB.prepare("SELECT category, COUNT(*) AS n FROM widgets WHERE status = 'published' GROUP BY category").all();
  return Object.fromEntries(res.results.map((r) => [r.category, r.n]));
}

export async function putBlob(env, id, kind, type, data) {
  await env.DB.prepare('INSERT INTO blobs (id, kind, type, data) VALUES (?, ?, ?, ?) ON CONFLICT(id, kind) DO UPDATE SET type = excluded.type, data = excluded.data')
    .bind(id, kind, type, data).run();
}

export async function getBlob(env, id, kind) {
  const row = await env.DB.prepare('SELECT type, data FROM blobs WHERE id = ? AND kind = ?').bind(id, kind).first();
  return row ? { type: row.type, data: new Uint8Array(row.data) } : null;
}

export async function removeWidget(env, id) {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM widgets WHERE id = ?').bind(id),
    env.DB.prepare('DELETE FROM blobs WHERE id = ?').bind(id),
  ]);
}
