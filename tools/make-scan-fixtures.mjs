// Banc d'essai du scan : photos de cartes fabriquées dans Chrome à partir de vraies images (tests/fixtures/scan/src, voir SOURCES), reproductibles (graine fixe).
// Chaque source × 5 défauts (net, tourné, décalé, flou, reflet) + photos sans carte. Les images ne sont pas versionnées (images Disney) : téléchargées au besoin.
//   node tools/make-scan-fixtures.mjs --download        télécharge les sources manquantes
//   node tools/make-scan-fixtures.mjs --bench [filtre]  lit chaque photo avec le vrai scan (src/scan.js › scanImage, Tesseract local) : taux, temps, erreurs
//   node tools/make-scan-fixtures.mjs --bench --auto   même chose avec la lecture rapide du mode Auto (ligne du bas seule)
//   node tools/make-scan-fixtures.mjs --out <dossier>   écrit les photos en JPEG pour les regarder
// Utilisé aussi par tests/scan-e2e.mjs (SOURCES, photos, pageGen, tessRoutes).
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SRC_DIR = join(root, 'tests', 'fixtures', 'scan', 'src');
const LC = 'https://cards.lorcast.io/card/digital/large/crd_', RB = 'https://api.lorcana.ravensburger.com/images/';
/** Sources : id de la carte (cards.json), langue imprimée, adresse (Lorcast « large » pour l'anglais, images officielles via LorcanaJSON pour FR, DE, IT). */
export const SOURCES = [
  ['42-en.avif', 42, 'en', LC + '04bca46a8e2d4e9ba0fbdbfc6c99e51e.avif?1709690747'],
  ['207-en.avif', 207, 'en', LC + 'cbc18e77d7ec4d50bf19650a9a559686.avif?1709690747'],
  ['1434-en.avif', 1434, 'en', LC + 'b817b45c424b49b98e7978f1dcf3d7db.avif?1740589101'],
  ['3000-en.avif', 3000, 'en', LC + '84ac4e601f31462988d5fef80d41f5b2.avif?1783188531'],
  ['2400-en.avif', 2400, 'en', LC + '63194dcb766c473093e3802f309030e0.avif?1761765215'],
  ['900-en.avif', 900, 'en', LC + '34dd94ad32194a96931c9e2ff311ad26.avif?1716052430'],
  ['1700-en.avif', 1700, 'en', LC + '8667edc82b784cbb96e48962ef4583a9.avif?1747507344'],
  ['3300-en.avif', 3300, 'en', LC + 'cafb43eabd50438f9248ff55a7dd8850.avif?1790278531'],
  ['1-fr.jpg', 1, 'fr', RB + 'fr/set1/1_6ce0c0681772fec10c3127a0d320164c165a7111.jpg'],
  ['2800-fr.jpg', 2800, 'fr', RB + 'fr/set12/85_fe7cabf57de0287c926ead47693c04092f079a27.jpg'],
  ['42-de.jpg', 42, 'de', RB + 'de/set1/42_46c01a5c75c5dcdba2654de80c38c2b52f111e2a.jpg'],
  ['1100-de.jpg', 1100, 'de', RB + 'de/set5/144_e2029a77e0caaeb4a6a9f59f94258f63dae06fa7.jpg'],
  ['2005-it.jpg', 2005, 'it', RB + 'it/set9/69_75d248962a09a3136a6bc2a0f9af640aac97e527.jpg'],
  ['640-it.jpg', 640, 'it', RB + 'it/set3/204_7bdbe740321ae295af110fd096dc264f783b000b.jpg'],      // lieu : carte à l'horizontale
];
export const DEFECTS = ['net', 'tourne', 'decale', 'flou', 'reflet'];
/** Toutes les photos du banc : { name, src, id, lang, defect, seed } ; plus 6 photos sans carte (id 0). */
export function photos() {
  const out = [];
  SOURCES.forEach(([src, id, lang], i) => DEFECTS.forEach((defect, j) => out.push({ name: `${src.replace(/\.\w+$/, '')}-${defect}`, src, id, lang, defect, seed: i * 31 + j * 7 + 1 })));
  for (let k = 0; k < 6; k++) out.push({ name: `vide-${k}`, src: '', id: 0, lang: '', defect: 'vide', seed: 500 + k });
  return out;
}
export async function download() {
  mkdirSync(SRC_DIR, { recursive: true });
  for (const [f, , , url] of SOURCES) {
    if (existsSync(join(SRC_DIR, f))) continue;
    const r = await fetch(url, { headers: { 'User-Agent': 'InkOrbit-tests/0.1' } });
    if (!r.ok) throw new Error(`${url} : ${r.status}`);
    writeFileSync(join(SRC_DIR, f), Buffer.from(await r.arrayBuffer())); console.log('téléchargé', f);
  }
}

/** Fabrique une photo dans la page : (url de l'image source ou '', défaut, graine) → ImageBitmap 1080 × 1440 (photo de téléphone en portrait, JPEG).
 *  Table texturée, carte à l'échelle d'un cadrage réel, coins arrondis, ombre ; défauts : rotation, décalage, flou, bruit, compression, éclairage inégal, reflet, foil. */
export const pageGen = async (url, defect, seed) => {
  let s = seed >>> 0; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296), rr = (a, b) => a + (b - a) * rnd(), sign = () => (rnd() < 0.5 ? -1 : 1);
  const W = 1080, H = 1440, cv = new OffscreenCanvas(W, H), cx = cv.getContext('2d');
  // Table : bois clair, feutrine, tapis de jeu sombre ou bureau gris
  const bases = [['#9a6b43', 'wood'], ['#2f5d4a', 'felt'], ['#1b1d2a', 'mat'], ['#8d8f94', 'desk']], [base, kind] = bases[Math.floor(rnd() * bases.length)];
  cx.fillStyle = base; cx.fillRect(0, 0, W, H);
  for (let k = 0; k < (kind === 'wood' ? 220 : 1600); k++) {
    cx.globalAlpha = rr(0.04, 0.16); cx.fillStyle = rnd() < 0.5 ? '#000' : '#fff';
    if (kind === 'wood') cx.fillRect(0, rr(0, H), W, rr(1, 6)); else cx.fillRect(rr(0, W), rr(0, H), rr(1, 4), rr(1, 4));
  }
  cx.globalAlpha = 1;
  if (url) {
    const img = await createImageBitmap(await (await fetch(url)).blob());
    const land = img.width > img.height, ratio = 63 / 88;
    const fill = defect === 'decale' ? rr(0.7, 0.76) : rr(0.76, 0.84), ch = Math.min(H * fill, W * 0.92 / ratio), cw = ch * ratio;
    const rot = { net: rr(-0.6, 0.6), tourne: sign() * rr(3, 6), decale: rr(-1.5, 1.5), flou: rr(-2, 2), reflet: rr(-2.5, 2.5) }[defect] * Math.PI / 180;
    const off = defect === 'decale' ? 0.06 : defect === 'net' ? 0.01 : 0.03;
    cx.save(); cx.translate(W / 2 + rr(-off, off) * W, H / 2 + rr(-off, off) * H); cx.rotate(rot);
    if (defect === 'reflet') cx.transform(1, rr(-0.02, 0.02), rr(-0.03, 0.03), 1, 0, 0);      // perspective légère (affine)
    cx.shadowColor = 'rgba(0,0,0,.45)'; cx.shadowBlur = 24; cx.shadowOffsetY = 8;
    cx.beginPath(); cx.roundRect(-cw / 2, -ch / 2, cw, ch, cw * 0.045); cx.fillStyle = '#000'; cx.fill(); cx.shadowColor = 'transparent'; cx.clip();
    if (land) { cx.rotate(-Math.PI / 2); cx.drawImage(img, -ch / 2, -cw / 2, ch, cw); cx.rotate(Math.PI / 2); } else cx.drawImage(img, -cw / 2, -ch / 2, cw, ch);
    if (defect === 'reflet' && seed % 2) { const g = cx.createLinearGradient(-cw / 2, -ch / 2, cw / 2, ch / 2); for (const [o, c] of [[0, '#ff9ec9'], [0.33, '#ffd27a'], [0.66, '#86ecff'], [1, '#b9a2ff']]) g.addColorStop(o, c); cx.globalCompositeOperation = 'overlay'; cx.globalAlpha = 0.3; cx.fillStyle = g; cx.fillRect(-cw / 2, -ch / 2, cw, ch); }
    cx.restore(); img.close();
  } else if (seed % 2) {      // sans carte : une feuille de papier avec des lignes (ne doit jamais être lue comme une carte)
    cx.save(); cx.translate(W / 2, H / 2); cx.rotate(rr(-0.1, 0.1)); cx.fillStyle = '#f4f1ea'; cx.fillRect(-380, -500, 760, 1000); cx.fillStyle = '#556';
    for (let y = -440; y < 480; y += 46) cx.fillRect(-330, y, rr(300, 640), 3); cx.font = '42px serif'; cx.fillText('12 nov. liste de courses', -330, -460); cx.restore();
  }
  cx.globalCompositeOperation = 'source-over'; cx.globalAlpha = 1;
  // Éclairage inégal (lampe d'un côté), et reflet (tache blanche) : défaut « reflet »
  const lx = rr(0, W), ly = rr(0, H * 0.6), lg = cx.createRadialGradient(lx, ly, 50, lx, ly, W * 1.2); lg.addColorStop(0, 'rgba(255,250,235,.18)'); lg.addColorStop(1, 'rgba(0,0,0,.28)');
  cx.fillStyle = lg; cx.fillRect(0, 0, W, H);
  if (defect === 'reflet') { const gx = rr(W * 0.3, W * 0.7), gy = rr(H * 0.25, H * 0.5), g = cx.createRadialGradient(gx, gy, 10, gx, gy, rr(140, 240)); g.addColorStop(0, 'rgba(255,255,255,.85)'); g.addColorStop(1, 'rgba(255,255,255,0)'); cx.fillStyle = g; cx.fillRect(0, 0, W, H); }
  let out = cv;
  if (defect === 'flou') { const b = new OffscreenCanvas(W, H), bx = b.getContext('2d'); bx.filter = `blur(${rr(1.2, 1.8).toFixed(2)}px)`; bx.drawImage(cv, 0, 0); out = b; }
  const ox = out.getContext('2d'), im = ox.getImageData(0, 0, W, H), d = im.data, sig = defect === 'flou' ? 10 : 5;
  for (let i = 0; i < d.length; i += 4) { const n = (rnd() + rnd() + rnd() - 1.5) * sig * 2; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  ox.putImageData(im, 0, 0);
  const jpg = await out.convertToBlob({ type: 'image/jpeg', quality: defect === 'flou' ? 0.6 : 0.8 });
  return createImageBitmap(jpg);
};

/** Routes Playwright : Tesseract (jsDelivr) servi depuis tests/node_modules, sources du banc servies depuis le disque (aucun réseau). */
export async function tessRoutes(ctx) {
  const nm = join(root, 'tests', 'node_modules'), type = f => ({ '.js': 'text/javascript', '.wasm': 'application/wasm', '.gz': 'application/octet-stream' })[extname(f)] || 'application/octet-stream';
  const file = (route, f) => route.fulfill({ status: 200, body: readFileSync(f), headers: { 'Content-Type': type(f), 'Access-Control-Allow-Origin': '*' } });
  await ctx.route(/cdn\.jsdelivr\.net\/npm\/tesseract\.js@5\.1\.1\/dist\/(.+)$/, r => file(r, join(nm, 'tesseract.js', 'dist', /dist\/([^?]+)/.exec(r.request().url())[1])));
  await ctx.route(/cdn\.jsdelivr\.net\/npm\/tesseract\.js-core@5\.1\.1\/(.+)$/, r => file(r, join(nm, 'tesseract.js-core', /core@5\.1\.1\/([^?]+)/.exec(r.request().url())[1])));
  await ctx.route(/cdn\.jsdelivr\.net\/npm\/@tesseract\.js-data\/eng@1\.0\.0\/4\.0\.0_best_int\/eng\.traineddata\.gz/, r => file(r, join(nm, '@tesseract.js-data', 'eng', '4.0.0_best_int', 'eng.traineddata.gz')));
  await ctx.route(/\/__fixtures\/(.+)$/, r => file(r, join(SRC_DIR, decodeURIComponent(/__fixtures\/([^?]+)/.exec(r.request().url())[1]))));
}

/** Banc : chaque photo passe par scanImage (le même chemin que le champ « Photo »). → { rows, ok, wrong, miss, ms } */
export async function bench(page, list, minSim = 0.75) {
  const rows = [];
  for (const p of list) {
    const r = await page.evaluate(async ([p, minSim]) => {
      const img = await (window.__gen)(p.src ? '/__fixtures/' + p.src : '', p.defect, p.seed);
      const t0 = performance.now(), res = await scanImage(img, minSim); const ms = performance.now() - t0; img.close();
      return { id: res && res.card ? res.card.id : 0, lang: res ? res.lang : '', how: res ? res.how : '', choices: res && res.choices ? res.choices.map(c => c.id) : null, ms };
    }, [p, minSim]);
    rows.push({ ...p, got: r.id, gotLang: r.lang, how: r.how, ms: r.ms, choices: r.choices, ok: r.id === p.id && (!p.id || r.lang === p.lang) || !!(r.choices && r.choices.includes(p.id)) });      // « Quelle version ? » avec la bonne carte parmi les choix : réussi
  }
  return { rows, ok: rows.filter(r => r.ok).length, wrong: rows.filter(r => r.got && r.got !== r.id).length, miss: rows.filter(r => r.id && !r.got).length, ms: rows.reduce((s, r) => s + r.ms, 0) / rows.length };
}
/** Ouvre l'appli dans Chrome avec Tesseract local et le générateur de photos posé dans la page (window.__gen). */
export async function openBench(chromium, port) {
  const { serve } = await import(pathToFileURL(join(root, 'serve.mjs')).href);
  const srv = await serve(port);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await tessRoutes(ctx);
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1|cdn\.jsdelivr\.net)/, r => r.abort());
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${port}/`); await page.waitForFunction(() => CARDS.ready);
  await page.evaluate(`window.__gen = ${pageGen.toString()}`);
  await page.evaluate(() => tessLoad());
  return { page, close: async () => { await browser.close(); srv.close(); } };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const a = process.argv.slice(2);
  await download();
  if (a.includes('--bench') || a.includes('--out')) {
    const { chromium } = await import(pathToFileURL(join(root, 'tests', 'node_modules', 'playwright-core', 'index.mjs')).href);
    const { page, close } = await openBench(chromium, 18961);
    try {
      const filt = a.find(x => !x.startsWith('--') && x !== a[a.indexOf('--out') + 1]);
      const list = photos().filter(p => !filt || p.name.includes(filt));
      if (a.includes('--out')) {
        const dir = a[a.indexOf('--out') + 1]; mkdirSync(dir, { recursive: true });
        for (const p of list) { const b64 = await page.evaluate(async p => { const img = await window.__gen(p.src ? '/__fixtures/' + p.src : '', p.defect, p.seed); const c = new OffscreenCanvas(img.width, img.height); c.getContext('2d').drawImage(img, 0, 0); const u = new Uint8Array(await (await c.convertToBlob({ type: 'image/jpeg', quality: 0.85 })).arrayBuffer()); let s = ''; for (const x of u) s += String.fromCharCode(x); return btoa(s); }, p); writeFileSync(join(dir, p.name + '.jpg'), Buffer.from(b64, 'base64')); }
        console.log(list.length, 'photos dans', dir);
      } else {
        const b = await bench(page, list, a.includes('--auto') ? 0 : 0.75);      // --auto : lecture rapide de la caméra (ligne du bas seule, un angle)
        for (const r of b.rows) console.log(r.choices ? (r.ok ? '? choix' : '✗ choix') : r.ok ? '✓' : r.got && r.got !== r.id ? '✗ FAUSSE' : r.got ? '~ langue' : '· raté', r.name, '→', r.got, r.gotLang, r.how, Math.round(r.ms) + ' ms');
        const by = {}; for (const r of b.rows) { const o = by[r.defect] = by[r.defect] || [0, 0]; o[0] += r.ok; o[1]++; }
        console.log(Object.entries(by).map(([k, [o, n]]) => `${k} ${o}/${n}`).join(' · '));
        console.log(`TOTAL ${b.ok}/${b.rows.length} · fausses ${b.wrong} · ratées ${b.miss} · ${Math.round(b.ms)} ms en moyenne`);
      }
    } finally { await close(); }
  }
}
