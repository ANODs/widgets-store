import { deflateSync } from 'node:zlib';

export const CATEGORIES = ['donations', 'games', 'giveaways', 'polls', 'finance', 'crypto', 'shopping', 'news', 'health', 'sport',
  'education', 'productivity', 'media', 'social', 'travel', 'tools', 'fun', 'other'];
export const LIMIT_RAW = 32768;
export const LIMIT_PACKED = 4096;
// Node's zlib and Telegram's server differ by up to ~150 bytes, so Telegram itself has the final say.
export const PACKED_SLACK = 160;

const enc = new TextEncoder();
export const bytes = (s) => enc.encode(s || '').length;

export function measure(html) {
  return { size: bytes(html), packed: deflateSync(enc.encode(html), { level: 9 }).length };
}

export function checkHtml(html) {
  if (typeof html !== 'string' || !html.trim()) return { ok: false, error: 'empty' };
  const m = measure(html);
  if (m.size > LIMIT_RAW) return { ok: false, error: 'too_big', ...m };
  if (m.packed > LIMIT_PACKED + PACKED_SLACK) return { ok: false, error: 'too_big_packed', ...m };
  return { ok: true, ...m };
}

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
async function hmac(key, data) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', k, typeof data === 'string' ? enc.encode(data) : data);
}
function sameString(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signInitData(fields, token) {
  const check = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join('\n');
  const secret = await hmac(enc.encode('WebAppData'), token);
  return hex(await hmac(secret, check));
}

// Returns the Telegram user from a Mini App initData string, or null if the signature is wrong or too old.
export async function verifyInitData(initData, token, now = Date.now() / 1000, maxAge = 86400) {
  if (!initData || !token) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  const fields = {};
  for (const [k, v] of params) if (k !== 'hash') fields[k] = v;
  if (!sameString(await signInitData(fields, token), hash)) return null;
  const date = Number(fields.auth_date);
  if (!date || now - date > maxAge) return null;
  try {
    const user = JSON.parse(fields.user);
    return user && Number.isSafeInteger(user.id) ? user : null;
  } catch {
    return null;
  }
}

// Accepts @name, t.me/name, https://t.me/name?start=x, https://t.me/name/app?startapp=x
export function parseLink(input) {
  const s = String(input || '').trim();
  const at = /^@?([A-Za-z][A-Za-z0-9_]{3,31})$/.exec(s);
  if (at) return { bot: at[1], link: `https://t.me/${at[1]}` };
  const m = /^(?:https?:\/\/)?(?:t\.me|telegram\.me)\/([A-Za-z][A-Za-z0-9_]{3,31})(\/[A-Za-z0-9_]{1,64})?(\?[A-Za-z0-9_=&%.-]{1,128})?$/.exec(s);
  if (!m) return null;
  return { bot: m[1], link: `https://t.me/${m[1]}${m[2] || ''}${m[3] || ''}` };
}

export const newId = () => {
  const a = crypto.getRandomValues(new Uint8Array(10));
  return [...a].map((b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
};

export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const PALETTES = {
  light: {
    bg_color: '#ffffff', text_color: '#000000', hint_color: '#707579', link_color: '#3390ec',
    button_color: '#3390ec', button_text_color: '#ffffff', secondary_bg_color: '#f1f1f4',
    accent_text_color: '#3390ec', subtitle_text_color: '#707579', destructive_text_color: '#e53935',
    section_separator_color: '#d9d9de',
  },
  dark: {
    bg_color: '#212d3b', text_color: '#ffffff', hint_color: '#7d8b99', link_color: '#62bcf9',
    button_color: '#50a8eb', button_text_color: '#ffffff', secondary_bg_color: '#17212b',
    accent_text_color: '#6ab3f3', subtitle_text_color: '#7d8b99', destructive_text_color: '#ee686f',
    section_separator_color: '#101921',
  },
};

const inScript = (value) => JSON.stringify(value ?? null).replace(/</g, '\\u003c').replace(/[\u2028\u2029]/g, '');

// A browser stand-in for the Telegram widget sandbox: palette, default styles and a TelegramWidget stub.
// Telegram runs widgets in QuickJS with its own checks, so this is a close look, not the exact rendering.
export function frameDoc({ html, public_data, chat_data, height }, theme = 'light') {
  const scheme = theme === 'dark' ? 'dark' : 'light';
  const p = PALETTES[scheme];
  const vars = Object.entries(p).map(([k, v]) => `--tg-theme-${k.replace(/_/g, '-')}:${v}`).join(';');
  const fixed = height > 0 ? `html,body{height:${Math.min(600, Math.max(50, height))}px;overflow:hidden}` : '';
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>:root{${vars};--tg-color-scheme:${scheme};color-scheme:${scheme};--tg-content-safe-area-inset-bottom:0px;--tg-content-safe-area-corner-right:0px;--tg-content-safe-area-corner-left:0px}
html{background:${p.bg_color};color:${p.text_color};font:16px/1.3125 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;-webkit-text-size-adjust:100%}
body{margin:8px 12px;overflow:hidden}a{color:${p.link_color}}
button{font:inherit;font-weight:500;border:0;border-radius:8px;padding:8px 14px;background:${p.button_color};color:${p.button_text_color};cursor:pointer}
button:active{opacity:.7}button[disabled]{opacity:.5}hr{border:0;border-top:1px solid ${p.section_separator_color}}${fixed}</style>
<script>(function(){var h={};var sent=0;setInterval(function(){sent=0},1000);var say=function(m){if(++sent>20)return;try{parent.postMessage(m,'*')}catch(e){}};
try{var no=function(){};history.pushState=no;history.replaceState=no;history.back=no;history.forward=no;history.go=no;window.open=function(){return null}}catch(e){}
addEventListener('click',function(e){var a=e.target&&e.target.closest&&e.target.closest('a,area');if(a)e.preventDefault()},true);addEventListener('submit',function(e){e.preventDefault()},true);
var hf={impactOccurred:function(){return hf},notificationOccurred:function(){return hf},selectionChanged:function(){return hf}};
window.TelegramWidget={profile:1,isProfileAtLeast:function(n){return typeof n==='number'&&n<=1},colorScheme:'${scheme}',theme:'${scheme}',themeParams:Object.freeze(${inScript(p)}),
isActive:true,isPreview:false,isForward:false,chatType:'private',viewer:{id:1,first_name:'Guest'},
publicData:${inScript(public_data)},chatData:${inScript(chat_data)},wallet:null,
contentSafeAreaInset:Object.freeze({top:0,right:0,bottom:0,left:0,cornerLeft:0,cornerRight:0}),HapticFeedback:hf,
onEvent:function(n,f){(h[n]=h[n]||[]).push(f)},offEvent:function(n,f){h[n]=(h[n]||[]).filter(function(x){return x!==f})},onTheme:function(){},
ready:function(){},setResizeAnchor:function(){},watchPublicData:function(){},unwatchPublicData:function(){},
openLink:function(u){say({widget:'link',url:String(u)})},openTelegramLink:function(u){say({widget:'link',url:String(u)})},
copyText:function(t){say({widget:'copy',text:String(t)})},
request:function(d){say({widget:'request',data:String(d)});return Promise.reject({error:'NOT_ALLOWED'})}};
var last=0;var size=function(){if(!document.body)return;var v=Math.ceil(document.body.getBoundingClientRect().bottom+8);if(v!==last){last=v;say({widget:'height',height:v})}};
window.__widgetHeight=function(){size();return last};
addEventListener('load',function(){size();try{new ResizeObserver(size).observe(document.body)}catch(e){}setInterval(size,500)});})();</script>
${html}`;
}

export const FRAME_CSP = "sandbox allow-scripts; default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; font-src data:; media-src data:; form-action 'none'; base-uri 'none'; frame-src 'none'; child-src 'none'; worker-src 'none'";

// The public t.me page of a bot carries its avatar; a bot without one gets Telegram's own logo, which we skip.
export function botAvatarUrl(pageHtml) {
  const m = /<meta property="og:image" content="(https:\/\/[^"]+)"/.exec(pageHtml || '');
  if (!m) return null;
  try {
    const host = new URL(m[1]).hostname;
    return /(^|\.)(telesco\.pe|cdn-telegram\.org)$/.test(host) ? m[1] : null;
  } catch {
    return null;
  }
}
