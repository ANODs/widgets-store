// One run: database schema, deploy to Cloudflare, secrets, webhook, bot commands and the menu button.
//   npm run setup     (the token is read from worker/.env, line BOT_TOKEN=...)
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const envFile = new URL('../.env', import.meta.url);
const token = process.env.BOT_TOKEN
  || (existsSync(envFile) && /^BOT_TOKEN=(.+)$/m.exec(readFileSync(envFile, 'utf8'))?.[1].trim());
if (!token) {
  console.error('Put BOT_TOKEN=... into worker/.env or run BOT_TOKEN=token npm run setup');
  process.exit(1);
}

const toml = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
const webUrl = /^WEB_URL\s*=\s*"(.+)"/m.exec(toml)?.[1];
if (!webUrl?.startsWith('https://')) {
  console.error('Set WEB_URL in wrangler.toml to the https address of the web app first');
  process.exit(1);
}

const api = async (method, params) => {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params || {}),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`${method}: ${json.description}`);
  return json.result;
};

const me = await api('getMe');
console.log(`Bot: @${me.username}`);

execFileSync('npx', ['wrangler', 'd1', 'execute', 'widgets-store', '--remote', '--file', 'schema.sql', '--yes'], { stdio: 'inherit' });

const output = await new Promise((resolve, reject) => {
  const child = spawn('npx', ['wrangler', 'deploy'], { stdio: ['inherit', 'pipe', 'inherit'] });
  let text = '';
  child.stdout.on('data', (chunk) => { text += chunk; process.stdout.write(chunk); });
  child.on('close', (code) => (code ? reject(new Error('wrangler deploy failed')) : resolve(text)));
});
const url = /https:\/\/[^\s]+\.workers\.dev/.exec(output)?.[0];
if (!url) throw new Error('Worker address not found in the wrangler output');

const secret = randomBytes(24).toString('hex');
const dir = mkdtempSync(join(tmpdir(), 'widgets-'));
const file = join(dir, 'secrets.json');
writeFileSync(file, JSON.stringify({ BOT_TOKEN: token, WEBHOOK_SECRET: secret }), { mode: 0o600 });
try {
  execFileSync('npx', ['wrangler', 'secret', 'bulk', file], { stdio: 'inherit' });
} finally {
  rmSync(dir, { recursive: true });
}

await api('setWebhook', { url: `${url}/tg`, secret_token: secret, allowed_updates: ['message', 'callback_query'] });
const commands = (submit, my) => [{ command: 'start', description: 'Widgets Store' }, { command: 'submit', description: submit }, { command: 'my', description: my }];
await api('setMyCommands', { commands: commands('Add your widget', 'My widgets') });
await api('setMyCommands', { commands: commands('Добавить свой виджет', 'Мои виджеты'), language_code: 'ru' });
await api('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Store', web_app: { url: webUrl } } });
await api('setMyShortDescription', { short_description: 'A catalog of Telegram widgets. Browse them and submit your own.' });
await api('setMyShortDescription', { short_description: 'Каталог виджетов для Telegram. Смотри чужие и добавляй свои.', language_code: 'ru' });

writeFileSync(new URL('../../web/.env.production', import.meta.url), `VITE_API=${url}\nVITE_BOT=${me.username}\n`);
console.log(`\nDone. Worker: ${url}\nWeb app: ${webUrl}`);
