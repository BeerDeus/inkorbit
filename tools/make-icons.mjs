#!/usr/bin/env node
// Icônes de l'appli (public/icons/) depuis le logo du sprite (src/icons.html › #i-logo) : une seule source de dessin.
// icon.svg (fond nuit + logo), puis les PNG par Chrome sans fenêtre (CHROME=<chemin> sinon l'emplacement Windows habituel).
// Usage : node tools/make-icons.mjs (icônes) · node tools/make-icons.mjs --sheet (planche de DA et captures, docs/da/)
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'public', 'icons');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(existsSync);
const sprite = readFileSync(join(root, 'src', 'icons.html'), 'utf8');
const pick = id => { const m = new RegExp(`<(linearGradient|radialGradient|clipPath) id="${id}"[\\s\\S]*?</\\1>`).exec(sprite); if (!m) throw new Error('absent du sprite : ' + id); return m[0]; };
const logo = (/<symbol id="i-logo" viewBox="0 0 100 100">([\s\S]*?)<\/symbol>/.exec(sprite) || [])[1];
if (!logo) throw new Error('#i-logo absent de src/icons.html');

/** Icône carrée : ciel de nuit plein cadre (le système arrondit lui-même), quelques étoiles, logo à l'échelle s (part du côté). */
function iconSvg(s) {
  const k = 512 * s / 100, o = (512 - 100 * k) / 2;
  const stars = [[78, 92, 2.4], [430, 70, 1.8], [460, 300, 2], [60, 360, 1.6], [120, 450, 2.2], [400, 460, 1.6], [250, 48, 1.4], [330, 150, 1.2], [170, 160, 1.3]]
    .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" opacity=".7"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<defs>${['ioDrop', 'ioDropCore', 'ioGold', 'ioFront'].map(pick).join('')}
<radialGradient id="icSky" cx=".72" cy=".12" r="1"><stop offset="0" stop-color="#4f2d94"/><stop offset=".5" stop-color="#241552"/><stop offset="1" stop-color="#120d2e"/></radialGradient>
<radialGradient id="icHalo" cx=".5" cy=".55" r=".5"><stop offset="0" stop-color="#b9a2ff" stop-opacity=".35"/><stop offset="1" stop-color="#b9a2ff" stop-opacity="0"/></radialGradient></defs>
<rect width="512" height="512" fill="url(#icSky)"/>${stars}
<circle cx="256" cy="282" r="${190 * s / 0.78}" fill="url(#icHalo)"/>
<g transform="translate(${o.toFixed(2)} ${(o + 6 * k / 5).toFixed(2)}) scale(${k.toFixed(4)})">${logo}</g>
</svg>`;
}

const tmp = mkdtempSync(join(tmpdir(), 'io-icons-'));
function png(svg, size, file) {
  const src = join(tmp, file + '.svg'), html = join(tmp, file + '.html');
  writeFileSync(src, svg);
  writeFileSync(html, `<!doctype html><style>html,body{margin:0;background:transparent;overflow:hidden}img{display:block;width:${size}px;height:${size}px}</style><img src="${pathToFileURL(src).href}">`);
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', `--window-size=${size},${size}`, '--default-background-color=00000000', `--screenshot=${join(OUT, file)}`, pathToFileURL(html).href], { stdio: 'ignore' });
}

/** --sheet : planche de DA (docs/da/planche.html → docs/da/maquettes.html, thème et sprite intégrés) et ses captures (docs/da/shots/). */
function sheet() {
  const da = join(root, 'docs', 'da');
  const cat = JSON.parse(readFileSync(join(root, 'public', 'data', 'cards.json'), 'utf8')), fr = JSON.parse(readFileSync(join(root, 'public', 'data', 'cards-fr.json'), 'utf8'));
  const px = JSON.parse(readFileSync(join(root, 'public', 'data', 'prices.json'), 'utf8')).p, names = new Map(fr.cards.map(r => [r[0], r]));
  const seen = new Set(), cards = [];      // 9 cartes récentes d'encres différentes, avec image Lorcast
  for (const r of cat.cards) {
    if (!['13', '14'].includes(r[1]) || !r[12] || r[12].startsWith('r:') || r[7] < 2 || r[7] > 6 || seen.has(r[3])) continue;
    seen.add(r[3]); const p = px[r[0]] || []; cards.push([r[0], r[12], names.get(r[0])[1], names.get(r[0])[2], r[3], r[7], p[0] || p[2] || 0]);
    if (cards.length === 9) break;
  }
  const html = readFileSync(join(da, 'planche.html'), 'utf8')
    .replace('/*THEME*/', () => readFileSync(join(root, 'src', 'css', 'theme.css'), 'utf8'))
    .replace('<!--SPRITE-->', () => sprite.replace(/^<!--[\s\S]*?-->\s*/, ''))
    .replace('/*CARDS*/[]', () => JSON.stringify(cards))
    .replace('<!-- Gabarit de la planche', '<!-- Généré par tools/make-icons.mjs --sheet depuis docs/da/planche.html (ne pas modifier à la main). Planche');
  const out = join(da, 'maquettes.html'); writeFileSync(out, html);
  mkdirSync(join(da, 'shots'), { recursive: true });
  for (const [s, w, h, t] of [['identite', 1440, 2620], ['ecrans', 1440, 1080], ['ecrans-parchemin', 1440, 1080, 'light']])
    execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', `--window-size=${w},${h}`, '--virtual-time-budget=12000', `--screenshot=${join(da, 'shots', s + '.png')}`, pathToFileURL(out).href + '?s=' + s.split('-')[0] + (t ? '&t=' + t : '')], { stdio: 'ignore' });
  console.log('docs/da/maquettes.html, docs/da/shots/identite.png, ecrans.png, ecrans-parchemin.png');
}

try {
  if (process.argv.includes('--sheet')) { sheet(); process.exit(0); }
  const main = iconSvg(0.78), mask = iconSvg(0.6);      // maskable : le logo tient dans le cercle de 80 % (zone sûre)
  writeFileSync(join(OUT, 'icon.svg'), main);
  if (!CHROME) { console.warn('Chrome introuvable (CHROME=…) : seulement icon.svg'); process.exit(0); }
  png(main, 512, 'icon-512.png'); png(main, 192, 'icon-192.png'); png(main, 180, 'apple-touch-icon.png'); png(main, 32, 'favicon-32.png');
  png(mask, 512, 'maskable-512.png');
  console.log('public/icons : icon.svg, icon-512.png, icon-192.png, apple-touch-icon.png, favicon-32.png, maskable-512.png');
} finally { rmSync(tmp, { recursive: true, force: true }); }
