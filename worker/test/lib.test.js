import test from 'node:test';
import assert from 'node:assert/strict';
import { botAvatarUrl, checkHtml, frameDoc, parseLink, signInitData, verifyInitData } from '../src/lib.js';

const TOKEN = '123456:TEST-TOKEN';

async function initData(fields) {
  const hash = await signInitData(fields, TOKEN);
  return new URLSearchParams({ ...fields, hash }).toString();
}

test('initData with a valid signature returns the user', async () => {
  const now = 1_800_000_000;
  const data = await initData({ auth_date: String(now - 60), query_id: 'q', user: JSON.stringify({ id: 42, first_name: 'Аня' }) });
  assert.deepEqual(await verifyInitData(data, TOKEN, now), { id: 42, first_name: 'Аня' });
});

test('initData is rejected when tampered, signed by another token, or stale', async () => {
  const now = 1_800_000_000;
  const fields = { auth_date: String(now - 60), user: JSON.stringify({ id: 42 }) };
  const data = await initData(fields);
  assert.equal(await verifyInitData(data.replace('42', '43'), TOKEN, now), null);
  assert.equal(await verifyInitData(data, '999:OTHER', now), null);
  assert.equal(await verifyInitData(data, TOKEN, now + 90000), null);
  assert.equal(await verifyInitData('user=%7B%22id%22%3A1%7D', TOKEN, now), null);
  assert.equal(await verifyInitData('', TOKEN, now), null);
});

test('checkHtml enforces the Telegram size limits', () => {
  assert.equal(checkHtml('').ok, false);
  assert.equal(checkHtml('<b>hi</b>').ok, true);
  assert.equal(checkHtml('a'.repeat(32769)).error, 'too_big');
  let noise = '';
  for (let i = 0; i < 9000; i++) noise += Math.random().toString(36).slice(2, 5);
  assert.equal(checkHtml(noise.slice(0, 20000)).error, 'too_big_packed');
});

test('parseLink accepts usernames and t.me links only', () => {
  assert.deepEqual(parseLink('@GramDonationApp'), { bot: 'GramDonationApp', link: 'https://t.me/GramDonationApp' });
  assert.deepEqual(parseLink('t.me/some_bot?start=abc'), { bot: 'some_bot', link: 'https://t.me/some_bot?start=abc' });
  assert.deepEqual(parseLink('https://t.me/some_bot/app?startapp=1'), { bot: 'some_bot', link: 'https://t.me/some_bot/app?startapp=1' });
  assert.equal(parseLink('https://evil.example/t.me/some_bot'), null);
  assert.equal(parseLink('javascript:alert(1)'), null);
  assert.equal(parseLink('https://t.me/some_bot?start=<script>'), null);
});

test('frameDoc keeps widget state from breaking out of the script', () => {
  const doc = frameDoc({ html: '<p>hi</p>', public_data: '</script><script>alert(1)</script>' }, 'dark');
  assert.ok(!doc.includes('</script><script>alert(1)'));
  assert.ok(doc.includes('--tg-theme-bg-color:#212d3b'));
  assert.ok(doc.endsWith('<p>hi</p>'));
});

test('botAvatarUrl takes only real avatars from Telegram hosts', () => {
  const page = (url) => `<head><meta property="og:image" content="${url}"></head>`;
  assert.equal(botAvatarUrl(page('https://cdn4.telesco.pe/file/abc.jpg')), 'https://cdn4.telesco.pe/file/abc.jpg');
  assert.equal(botAvatarUrl(page('https://telegram.org/img/t_logo_2x.png')), null);
  assert.equal(botAvatarUrl(page('https://evil.example/telesco.pe/a.jpg')), null);
  assert.equal(botAvatarUrl('<html></html>'), null);
});
