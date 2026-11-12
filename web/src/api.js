export const API = import.meta.env.VITE_API;
export const BOT = import.meta.env.VITE_BOT;

const webApp = window.Telegram?.WebApp;
export const tg = webApp?.initData ? webApp : null;
export const user = tg?.initDataUnsafe?.user || null;
export const canAuth = !!tg || import.meta.env.DEV;

const authHeader = () => (tg ? `tma ${tg.initData}` : import.meta.env.DEV ? 'dev 1' : '');

export class ApiError extends Error {
  constructor(code, data) { super(code); this.code = code; this.data = data; }
}

export async function api(path, { method = 'GET', body } = {}) {
  const headers = {};
  const auth = authHeader();
  if (auth) headers.authorization = auth;
  if (body) headers['content-type'] = 'application/json';
  let res;
  try {
    res = await fetch(`${API}/api${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError('network');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || 'internal', data);
  return data;
}

export const iconUrl = (w) => (w.icon_v ? `${API}/img/${w.id}/icon?v=${w.icon_v}` : null);
export const shotUrl = (w, scheme) => (w.shot_v ? `${API}/img/${w.id}/${scheme}?v=${w.shot_v}` : null);
// r: bump to drop frames that browsers cached under an older frame policy
export const frameUrl = (id, scheme, v = 0) => `${API}/frame/${id}?theme=${scheme}&v=${v}&r=3`;
export const shareUrl = (id) => `https://t.me/${BOT}?start=w_${id}`;

export function openLink(url) {
  if (!/^https:\/\//.test(url)) return;
  if (tg && /^https:\/\/t\.me\//.test(url)) tg.openTelegramLink(url);
  else if (tg) tg.openLink(url);
  else window.open(url, '_blank', 'noopener');
}

export const haptic = (kind = 'light') => tg?.HapticFeedback?.impactOccurred(kind);
