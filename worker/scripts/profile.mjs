// Fills in the bot profile: name, descriptions and the profile photo (assets/avatar.jpg).
//   node scripts/profile.mjs   (the token is read from worker/.env)
import { existsSync, readFileSync } from 'node:fs';

const envFile = new URL('../.env', import.meta.url);
const token = process.env.BOT_TOKEN || (existsSync(envFile) && /^BOT_TOKEN=(.+)$/m.exec(readFileSync(envFile, 'utf8'))?.[1].trim());
if (!token) throw new Error('BOT_TOKEN is missing');

const call = async (method, body, form) => {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, form
    ? { method: 'POST', body }
    : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json();
  console.log(method, body?.language_code || '', json.ok ? 'ok' : json.description);
};

const TEXT = {
  '': {
    name: 'Widgets Store',
    short: 'A catalog of Telegram widgets. Browse them, try live previews and submit your own.',
    description: 'Widgets Store is a catalog of Telegram widgets: small interactive blocks that live right inside a message.\n\n• Browse widgets by category and try a live preview\n• Open any widget at its author\'s bot\n• Add your own: forward a widget here or send its HTML file\n\nTap Start to open the catalog.',
  },
  ru: {
    name: 'Widgets Store',
    short: 'Каталог виджетов для Telegram. Смотри чужие, пробуй превью и добавляй свои.',
    description: 'Widgets Store — каталог виджетов для Telegram: небольших интерактивных блоков прямо в сообщении.\n\n• Смотри виджеты по категориям и пробуй живое превью\n• Открывай любой виджет в боте автора\n• Добавляй свой: перешли виджет сюда или пришли его HTML-файлом\n\nНажми «Старт», чтобы открыть каталог.',
  },
};

for (const [language_code, t] of Object.entries(TEXT)) {
  const lang = language_code ? { language_code } : {};
  await call('setMyName', { name: t.name, ...lang });
  await call('setMyShortDescription', { short_description: t.short, ...lang });
  await call('setMyDescription', { description: t.description, ...lang });
}

const photo = new URL('../../assets/avatar.jpg', import.meta.url);
if (existsSync(photo)) {
  const form = new FormData();
  form.append('photo', JSON.stringify({ type: 'static', photo: 'attach://file' }));
  form.append('file', new Blob([readFileSync(photo)], { type: 'image/jpeg' }), 'avatar.jpg');
  await call('setMyProfilePhoto', form, true);
}
