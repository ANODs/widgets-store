import { checkHtml, esc, LIMIT_PACKED, LIMIT_RAW } from './lib.js';
import { claimOwner, createDraft, fetchBotIcon, getWidget, ownerId, removeWidget } from './store.js';
import { shoot } from './shot.js';

const RU = new Set(['ru', 'uk', 'be', 'kk']);
export const langOf = (user) => (RU.has(String(user?.language_code || '').slice(0, 2)) ? 'ru' : 'en');

const T = {
  ru: {
    start: '<b>Widgets Store</b> — каталог виджетов для Telegram.\n\nСмотри, что уже сделали другие, и добавляй своё: перешли сюда сообщение с виджетом или пришли его HTML-файлом.',
    open: 'Открыть каталог',
    submit: '<b>Как добавить виджет</b>\n\n1. Перешли сюда сообщение с виджетом из своего бота.\n2. Если пересылка недоступна (в обычном Telegram она пока закрыта), пришли HTML виджета файлом <code>.html</code>.\n3. Заполни карточку: название, описание и ссылка на твоего бота.\n\nПосле проверки виджет появится в каталоге, а кнопка «Открыть» поведёт в твоего бота.',
    got: (w) => `Виджет получен: ${w.size} из ${LIMIT_RAW} байт, после сжатия примерно ${w.packed} из ${LIMIT_PACKED}.\n\nОсталось заполнить карточку.`,
    fill: 'Заполнить карточку',
    preview: 'Так виджет выглядит от нашего бота. Данные взяты как есть, кнопки с запросами к твоему боту здесь не работают.',
    empty: 'Не вижу в этом сообщении виджета. Перешли сообщение с виджетом или пришли файл .html.',
    too_big: (w) => `Виджет не влезает в лимит Telegram: ${w.size} из ${LIMIT_RAW} байт.`,
    too_big_packed: (w) => `Виджет не влезает в лимит Telegram: после сжатия ${w.packed} из ${LIMIT_PACKED} байт.`,
    rejected_by_tg: (d) => `Telegram не принял этот HTML как виджет: ${d}`,
    file_big: 'Файл слишком большой: виджет — это до 32 КБ HTML.',
    published: (n) => `🎉 Виджет «${n}» опубликован в каталоге.`,
    declined: (n) => `Виджет «${n}» не прошёл проверку. Поправь и отправь ещё раз.`,
    view: 'Открыть в каталоге',
    demo: (n) => `Демо виджета «${n}». Настоящий, со всеми функциями — у автора.`,
    author: 'Открыть у автора',
  },
  en: {
    start: '<b>Widgets Store</b> is a catalog of Telegram widgets.\n\nSee what others have built and add your own: forward a widget message here or send its HTML as a file.',
    open: 'Open the catalog',
    submit: '<b>How to add a widget</b>\n\n1. Forward a widget message from your bot here.\n2. If forwarding is unavailable (it is not open in production Telegram yet), send the widget HTML as a <code>.html</code> file.\n3. Fill in the card: name, description and a link to your bot.\n\nAfter review the widget appears in the catalog, and its Open button leads to your bot.',
    got: (w) => `Widget received: ${w.size} of ${LIMIT_RAW} bytes, about ${w.packed} of ${LIMIT_PACKED} after compression.\n\nNow fill in the card.`,
    fill: 'Fill in the card',
    preview: 'This is how the widget looks when sent by our bot. Data is taken as is; buttons that query your bot do not work here.',
    empty: 'I see no widget in this message. Forward a widget message or send a .html file.',
    too_big: (w) => `The widget exceeds the Telegram limit: ${w.size} of ${LIMIT_RAW} bytes.`,
    too_big_packed: (w) => `The widget exceeds the Telegram limit: ${w.packed} of ${LIMIT_PACKED} bytes after compression.`,
    rejected_by_tg: (d) => `Telegram did not accept this HTML as a widget: ${d}`,
    file_big: 'The file is too large: a widget is at most 32 KB of HTML.',
    published: (n) => `🎉 The widget “${n}” is now in the catalog.`,
    declined: (n) => `The widget “${n}” did not pass review. Fix it and submit again.`,
    view: 'Open in the catalog',
    demo: (n) => `Demo of the widget “${n}”. The real one, with all its features, is at the author's bot.`,
    author: 'Open at the author',
  },
};

export async function tg(env, method, params) {
  const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params || {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!json.ok) {
    const err = new Error(`${method}: ${json.description || res.status}`);
    err.code = json.error_code || res.status;
    err.description = json.description || '';
    throw err;
  }
  return json.result;
}

const webUrl = (env, go) => `${env.WEB_URL}${go ? `?go=${encodeURIComponent(go)}` : ''}`;
const appButton = (env, text, go) => ({ inline_keyboard: [[{ text, web_app: { url: webUrl(env, go) } }]] });
const say = (env, chat_id, text, extra) =>
  tg(env, 'sendMessage', { chat_id, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...extra });

export const widgetParams = (w) => ({
  html: w.html,
  ...(w.public_data ? { public_data: w.public_data } : {}),
  ...(w.chat_data ? { chat_data: w.chat_data } : {}),
  ...(w.width ? { width: w.width } : {}),
  ...(w.height ? { height: w.height } : {}),
});

export async function sendDemo(env, user, w) {
  const t = T[langOf(user)];
  return tg(env, 'sendWidget', {
    chat_id: user.id,
    ...widgetParams(w),
    caption: t.demo(w.name),
    reply_markup: { inline_keyboard: [[{ text: t.author, url: w.link }]] },
  });
}

const modKeyboard = (w) => ({
  inline_keyboard: w.status === 'published'
    ? [[{ text: w.featured ? '☆ Убрать из подборки' : '⭐ В подборку', callback_data: `feat:${w.id}` }, { text: '📸 Скриншоты', callback_data: `shot:${w.id}` }],
      [{ text: '🗑 Снять с публикации', callback_data: `no:${w.id}` }]]
    : [[{ text: '✅ Опубликовать', callback_data: `ok:${w.id}` }, { text: '❌ Отклонить', callback_data: `no:${w.id}` }]],
});

const modText = (w) => [
  `${w.status === 'published' ? '✅ Опубликован' : w.status === 'rejected' ? '❌ Отклонён' : '🆕 Заявка'}: <b>${esc(w.name)}</b>`,
  esc(w.short),
  '',
  esc(w.description),
  '',
  `Категория: ${esc(w.category)}`,
  `Автор: ${esc(w.owner_name)} (<code>${w.owner_id}</code>)`,
  `Ссылка: ${esc(w.link)}`,
  `Источник: ${w.source === 'forward' ? 'пересылка' : w.source === 'form' ? 'форма' : 'файл'}`,
  `Размер: ${w.size} байт, после сжатия ~${w.packed}`,
  `id: <code>${w.id}</code>`,
].join('\n');

export async function sendToModeration(env, w) {
  const owner = await ownerId(env);
  if (!owner) return;
  await tg(env, 'sendWidget', { chat_id: owner, ...widgetParams(w) }).catch((e) => say(env, owner, `Не смог показать виджет: ${esc(e.description)}`));
  await say(env, owner, modText(w), { reply_markup: modKeyboard(w) });
}

async function publish(env, ctx, origin, w) {
  await env.DB.prepare("UPDATE widgets SET status = 'published', published = COALESCE(published, ?), reject_reason = NULL WHERE id = ?").bind(Date.now(), w.id).run();
  ctx.waitUntil(shoot(env, origin, w.id).catch((e) => console.error('shot', e.message)));
  const lang = (await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(`lang:${w.owner_id}`).first())?.value || 'ru';
  await say(env, w.owner_id, T[lang].published(esc(w.name)), { reply_markup: appButton(env, T[lang].view, `w/${w.id}`) }).catch(() => {});
}

async function decline(env, w) {
  await env.DB.prepare("UPDATE widgets SET status = 'rejected', featured = 0 WHERE id = ?").bind(w.id).run();
  const lang = (await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(`lang:${w.owner_id}`).first())?.value || 'ru';
  await say(env, w.owner_id, T[lang].declined(esc(w.name)), { reply_markup: appButton(env, T[lang].fill, `submit/${w.id}`) }).catch(() => {});
}

async function onCallback(env, ctx, origin, q) {
  const answer = (text) => tg(env, 'answerCallbackQuery', { callback_query_id: q.id, text }).catch(() => {});
  if (q.from.id !== (await ownerId(env))) return answer('Только для модератора');
  const [action, id] = String(q.data || '').split(':');
  let w = await getWidget(env, id);
  if (!w) return answer('Виджет не найден');
  let note = '';
  if (action === 'ok') { await publish(env, ctx, origin, w); note = 'Опубликован'; }
  if (action === 'no') { await decline(env, w); note = 'Отклонён'; }
  if (action === 'feat') {
    await env.DB.prepare('UPDATE widgets SET featured = 1 - featured WHERE id = ?').bind(id).run();
    note = w.featured ? 'Убран из подборки' : 'Добавлен в подборку';
  }
  if (action === 'shot') {
    if (w.icon_v <= 0 || w.icon_bot) await fetchBotIcon(env, id, w.bot).catch(() => {});
    try { await shoot(env, origin, id); note = 'Скриншоты обновлены'; } catch (e) { note = `Не вышло: ${e.message}`.slice(0, 190); }
  }
  w = await getWidget(env, id);
  if (q.message) {
    await tg(env, 'editMessageText', {
      chat_id: q.message.chat.id, message_id: q.message.message_id, text: modText(w), parse_mode: 'HTML',
      link_preview_options: { is_disabled: true }, reply_markup: modKeyboard(w),
    }).catch(() => {});
  }
  return answer(note);
}

async function fileText(env, doc) {
  const file = await tg(env, 'getFile', { file_id: doc.file_id });
  const res = await fetch(`https://api.telegram.org/file/bot${env.BOT_TOKEN}/${file.file_path}`);
  if (!res.ok) throw new Error('download failed');
  return res.text();
}

async function takeWidget(env, msg, input) {
  const t = T[langOf(msg.from)], chat = msg.chat.id;
  const check = checkHtml(input.html);
  if (!check.ok) return say(env, chat, check.error === 'empty' ? t.empty : t[check.error](check));
  if (input.source !== 'forward') {
    // Telegram is the final judge of what counts as a valid widget
    try {
      await tg(env, 'sendWidget', { chat_id: chat, ...widgetParams(input), caption: t.preview });
    } catch (e) {
      return say(env, chat, t.rejected_by_tg(esc(e.description || e.message)));
    }
  }
  const id = await createDraft(env, msg.from, { ...input, size: check.size, packed: check.packed });
  return say(env, chat, t.got(check), { reply_markup: appButton(env, t.fill, `submit/${id}`) });
}

async function onMessage(env, msg) {
  if (msg.chat.type !== 'private' || !msg.from) return;
  const lang = langOf(msg.from), t = T[lang], chat = msg.chat.id;
  await env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .bind(`lang:${msg.from.id}`, lang).run();

  if (msg.widget?.html) {
    const origin = msg.forward_origin?.sender_user || msg.via_bot;
    return takeWidget(env, msg, {
      html: msg.widget.html,
      public_data: msg.widget.public_data,
      chat_data: msg.widget.chat_data,
      width: msg.widget.width,
      height: msg.widget.height,
      source: 'forward',
      bot: origin?.is_bot && origin.username !== env.BOT_USERNAME ? origin.username : '',
    });
  }

  if (msg.document) {
    const name = String(msg.document.file_name || '').toLowerCase();
    if (!/\.html?$/.test(name) && msg.document.mime_type !== 'text/html') return say(env, chat, t.empty);
    if (msg.document.file_size > 40000) return say(env, chat, t.file_big);
    return takeWidget(env, msg, { html: await fileText(env, msg.document), source: 'file' });
  }

  const text = msg.text || '';
  const cmd = /^\/(\w+)(?:@\w+)?(?:\s+(.*))?$/s.exec(text);
  if (!cmd) {
    if (/^\s*</.test(text) && /<\/?[a-z][^>]*>/i.test(text)) return takeWidget(env, msg, { html: text, source: 'file' });
    return say(env, chat, t.empty);
  }
  const [, name, arg = ''] = cmd;

  if (name === 'start') {
    if (await claimOwner(env, msg.from.id)) await say(env, chat, 'Ты первый, кто написал боту: теперь ты модератор каталога. Заявки будут приходить сюда.');
    if (arg === 'submit') return say(env, chat, t.submit);
    const w = /^w_([a-z0-9]{10})$/.exec(arg);
    return say(env, chat, t.start, { reply_markup: appButton(env, t.open, w ? `w/${w[1]}` : '') });
  }
  if (name === 'submit' || name === 'help') return say(env, chat, t.submit);
  if (name === 'my') return say(env, chat, t.start, { reply_markup: appButton(env, t.open, 'mine') });
  if (name === 'id') return say(env, chat, `<code>${msg.from.id}</code>`);

  if (msg.from.id === (await ownerId(env))) {
    if (name === 'pending') {
      const res = await env.DB.prepare("SELECT * FROM widgets WHERE status = 'pending' ORDER BY created LIMIT 10").all();
      if (!res.results.length) return say(env, chat, 'Заявок нет.');
      for (const w of res.results) await sendToModeration(env, w);
      return;
    }
    if (name === 'card' || name === 'remove') {
      const w = await getWidget(env, arg.trim());
      if (!w) return say(env, chat, 'Виджет не найден.');
      if (name === 'card') return sendToModeration(env, w);
      await removeWidget(env, w.id);
      return say(env, chat, `Удалён: ${esc(w.name || w.id)}`);
    }
  }
  return say(env, chat, t.start, { reply_markup: appButton(env, t.open, '') });
}

export async function handleUpdate(env, ctx, origin, u) {
  if (u.callback_query) return onCallback(env, ctx, origin, u.callback_query);
  if (u.message) return onMessage(env, u.message);
}
