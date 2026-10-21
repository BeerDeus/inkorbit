// Visuels de l'appli installée : node tools/store-assets.mjs → public/og.png (aperçu des liens partagés, 1200 × 630),
// public/icons/sc-*.png (icônes des raccourcis du manifeste, 96 × 96), public/screenshots/*.png (fenêtre d'installation d'Android).
// Règle légale (docs/da/README.md) : aucune image de carte ni personnage Disney dans ces visuels → accueil et compteur de lore seulement.
// Chrome : CHROMIUM, sinon celui de Windows. Après une retouche de l'accueil, relancer et commiter les PNG.
import { chromium } from '../tests/node_modules/playwright-core/index.mjs';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serve } from '../serve.mjs';

const root = new URL('../', import.meta.url), pub = p => fileURLToPath(new URL('public/' + p, root));
const sprite = readFileSync(new URL('src/icons.html', root), 'utf8'), theme = readFileSync(new URL('src/css/theme.css', root), 'utf8');
const FONTS = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght,SOFT,WONK@9..144,500..800,100,1&family=Nunito+Sans:opsz,wght@6..12,400..800&display=swap">';
mkdirSync(pub('screenshots'), { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const PORT = 18975, srv = await serve(PORT);
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  const html = body => `<!doctype html><meta charset="utf-8">${FONTS}<style>${theme}html,body{margin:0}body{font-family:var(--font-body);color:var(--ink);background:var(--sky)}</style>${sprite}${body}`;
  await page.setContent(html(`<div style="width:1200px;height:630px;display:flex;align-items:center;gap:56px;padding:0 90px;box-sizing:border-box;position:relative;overflow:hidden">
    <div style="position:absolute;inset:0;background:radial-gradient(40% 60% at 22% 50%,rgba(185,162,255,.28),transparent 70%),radial-gradient(30% 40% at 85% 20%,rgba(233,196,124,.18),transparent 70%)"></div>
    <svg style="width:340px;height:340px;flex:none;position:relative;filter:drop-shadow(0 24px 60px rgba(185,162,255,.4))"><use href="#i-logo"/></svg>
    <div style="position:relative"><div style="font:700 15px/1 var(--font-body);letter-spacing:.22em;text-transform:uppercase;color:var(--gold)">Appli de fan gratuite</div>
    <div style="font:700 104px/1 var(--font-display);font-variation-settings:'SOFT' 100,'WONK' 1;letter-spacing:-.02em;margin:18px 0 22px">Ink Orbit</div>
    <div style="font-size:30px;line-height:1.3;color:var(--ink-2);max-width:620px">Ta collection, sa valeur, tes decks et tes échanges.</div>
    <div style="font-size:16px;color:var(--ink-3);margin-top:34px">Gratuite et non officielle : non affiliée à Disney ni à Ravensburger.</div></div></div>`), { waitUntil: 'networkidle' });
  await page.screenshot({ path: pub('og.png') });
  for (const [name, icon] of [['scan', 'i-scan'], ['add', 'i-plus'], ['trade', 'i-trade'], ['lore', 'i-lore']]) {
    await page.setViewportSize({ width: 96, height: 96 });
    await page.setContent(html(`<div style="width:96px;height:96px;border-radius:24px;background:var(--sky);display:grid;place-items:center;color:var(--gold)"><svg style="width:56px;height:56px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"><use href="#${icon}"/></svg></div>`));
    await page.screenshot({ path: pub(`icons/sc-${name}.png`), omitBackground: true });
  }
  await page.close();
  const coll = Object.fromEntries([1, 2, 3, 5, 9, 12, 20, 33, 42, 51, 60, 77, 88, 99, 120, 150, 180, 204, 207, 436, 1434, 2000, 2001, 2002].map((id, i) => [String(id) + (i % 5 === 0 ? '*' : ''), 1 + (i % 6)]));
  for (const [name, vp, dsf, open] of [['phone-home', { width: 390, height: 844 }, 2, null], ['phone-lore', { width: 390, height: 844 }, 2, 'lore'], ['desktop-home', { width: 1280, height: 800 }, 1, null]]) {
    const p = await browser.newPage({ viewport: vp, deviceScaleFactor: dsf });
    await p.addInitScript(c => { localStorage.setItem('inkorbit:coll', JSON.stringify(c)); localStorage.setItem('inkorbit:onboard', '1'); localStorage.setItem('inkorbit:installX', String(Date.now())); localStorage.setItem('inkorbit:valhist', JSON.stringify(Array.from({ length: 40 }, (_, i) => [new Date(Date.now() - (39 - i) * 864e5).toISOString().slice(0, 10), 52000 + Math.round(9000 * Math.sin(i / 6) + i * 260), 0]))); }, coll);
    await p.goto(`http://127.0.0.1:${PORT}/`); await p.waitForFunction(() => CARDS.ready);
    if (open === 'lore') { await p.evaluate(() => { save('lore', null); openLore(); }); }
    await p.waitForTimeout(1500);
    await p.screenshot({ path: pub(`screenshots/${name}.png`) });
    await p.close();
  }
  console.log('og.png, icons/sc-*.png, screenshots/*.png');
} finally { await browser.close(); srv.close(); }
