import puppeteer from '@cloudflare/puppeteer';
import { putBlob } from './store.js';

const WIDTH = 360;

// Renders the widget's browser stand-in in both themes and stores the pictures for catalog cards.
export async function shoot(env, origin, id) {
  if (!env.BROWSER) throw new Error('no browser binding');
  const browser = await puppeteer.launch(env.BROWSER);
  let height = 0;
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: WIDTH, height: 640, deviceScaleFactor: 2 });
    for (const theme of ['light', 'dark']) {
      await page.goto(`${origin}/frame/${id}?theme=${theme}`, { waitUntil: 'load' });
      await new Promise((r) => setTimeout(r, 1500));
      const h = await page.evaluate(() => (window.__widgetHeight ? window.__widgetHeight() : document.body.scrollHeight));
      height = Math.min(600, Math.max(50, Number(h) || 200));
      const data = await page.screenshot({ type: 'webp', quality: 88, clip: { x: 0, y: 0, width: WIDTH, height } });
      await putBlob(env, id, theme, 'image/webp', data);
    }
  } finally {
    await browser.close();
  }
  await env.DB.prepare('UPDATE widgets SET shot_v = ?, shot_h = ? WHERE id = ?').bind(Date.now(), height, id).run();
  return height;
}
