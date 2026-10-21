// Captures de l'appli (relecture du design) : node tools/shots.mjs [dossier=shots] → <vue>-phone.png, <vue>-desktop.png, en Nuit et Parchemin.
// Collection d'exemple posée dans localStorage ; images Lorcast chargées pour de vrai (réseau nécessaire). CHROMIUM : chemin de Chrome.
import { chromium } from '../tests/node_modules/playwright-core/index.mjs';
import { mkdirSync } from 'node:fs';
import { serve } from '../serve.mjs';

const OUT = process.argv[2] || 'shots', PORT = 18920;
mkdirSync(OUT, { recursive: true });
const srv = await serve(PORT);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const coll = Object.fromEntries([1, 2, 3, 5, 9, 12, 20, 33, 42, 51, 60, 77, 88, 99, 120, 150, 180, 204, 207, 436, 1434, 2000, 2001, 2002, 2003, 3000].map((id, i) => [String(id) + (i % 5 === 0 ? '*' : ''), 1 + (i % 6)]));
try {
  for (const [dev, vp] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1440, height: 900 }]]) for (const theme of ['', 'light']) {
    const page = await browser.newPage({ viewport: vp, deviceScaleFactor: dev === 'phone' ? 2 : 1 });
    await page.addInitScript(([c, t]) => { localStorage.setItem('inkorbit:coll', JSON.stringify(c)); localStorage.setItem('inkorbit:prefs', JSON.stringify({ theme: t })); }, [coll, theme]);
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.waitForFunction(() => CARDS.ready);
    const shot = async name => { await page.waitForTimeout(1200); await page.screenshot({ path: `${OUT}/${name}-${dev}${theme ? '-' + theme : ''}.png` }); };
    for (const v of ['home', 'coll', 'trade', 'decks', 'scan']) { await page.evaluate(x => showView(x), v); await shot(v); }
    await page.evaluate(() => openCard(42)); await shot('card'); await page.evaluate(() => closeTop());
    await page.evaluate(() => openSet('1')); await shot('set'); await page.evaluate(() => closeTop());
    await page.evaluate(() => openLore()); await shot('lore'); await page.evaluate(() => closeTop());
    await page.evaluate(() => openMystery()); await shot('mystery');
    await page.close();
  }
  console.log('captures dans', OUT);
} finally { await browser.close(); srv.close(); }
