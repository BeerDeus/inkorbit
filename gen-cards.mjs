#!/usr/bin/env node
// Catalogue des cartes → public/data/cards.json (données communes) + public/data/cards-<langue>.json (noms, versions, textes).
// Sources : LorcanaJSON (lorcanajson.org, fichiers complets EN, FR, DE, IT ; même « id » dans chaque langue) pour les cartes,
//           Lorcast (api.lorcast.com) pour les images (AVIF légères, CDN fait pour les sites tiers), jointes par extension + numéro.
// Lancé chaque jour par .github/workflows/data.yml ; rien n'est écrit si LorcanaJSON n'a pas répondu en entier.
// CACHE_DIR=<dossier> : garde les téléchargements (développement, tests), relus au lieu du réseau.
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.OUT_DIR || join(root, 'public', 'data');
const CACHE = process.env.CACHE_DIR || '';
const LJ = process.env.LJ_BASE || 'https://lorcanajson.org/files/current';
const LC = process.env.LC_BASE || 'https://api.lorcast.com/v0';
const UA = { 'User-Agent': 'InkOrbit/0.1 (fan app; github.com/inkorbit)' };
export const LANGS = ['en', 'fr', 'de', 'it'];
export const INKS = ['Amber', 'Amethyst', 'Emerald', 'Ruby', 'Sapphire', 'Steel'];
export const TYPES = ['Character', 'Action', 'Item', 'Location'];
export const RARITIES = ['Common', 'Uncommon', 'Rare', 'Super Rare', 'Legendary', 'Epic', 'Enchanted', 'Iconic', 'Special'];
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(url, name) {
  const f = CACHE && join(CACHE, name);
  if (f && existsSync(f)) return JSON.parse(readFileSync(f, 'utf8'));
  for (let i = 0; ; i++) {
    const r = await fetch(url, { headers: UA });
    if (r.ok) { const t = await r.text(); if (f) { mkdirSync(CACHE, { recursive: true }); writeFileSync(f, t); } return JSON.parse(t); }
    if (i >= 3 || (r.status !== 429 && r.status < 500)) throw new Error(`${url} : HTTP ${r.status}`);
    await sleep(2000 * (i + 1));
  }
}

/** Clé de jointure LorcanaJSON ↔ Lorcast : extension (ou groupe de promos « P1 ») + numéro imprimé (« 4a », « 205 »). */
export const joinKey = (set, num) => `${String(set).toLowerCase()}-${String(num).toLowerCase()}`;
/** Numéro imprimé d'une carte LorcanaJSON : « 4a/204 • EN • 3 » → « 4a » ; promo « 1 TFC • EN • 1/P1 » → « 1 ». */
export const printedNum = c => { const m = /^(\d+[a-z]?)\//.exec(c.fullIdentifier || '') || /•\s*(\d+[a-z]?)\/[A-Z]/.exec(c.fullIdentifier || ''); return m ? m[1] : String(c.number); };
/** Encres → masque de 6 bits (Ambre = 1, Améthyste = 2…) ; les valeurs anglaises font foi. */
export const inkMask = c => (c.colors || (c.color ? [c.color] : []).flatMap(x => x.split('-'))).reduce((m, x) => m | (INKS.includes(x) ? 1 << INKS.indexOf(x) : 0), 0);
/** Jeton d'image Lorcast : « https://cards.lorcast.io/card/digital/small/crd_<hex>.avif?<v> » → « <hex>?<v> » (l'appli refait l'adresse pour chaque taille). */
export const lcToken = u => { const m = /\/crd_([0-9a-f]+)\.avif(\?\d+)?$/.exec(u || ''); return m ? m[1] + (m[2] || '') : ''; };

/** Image de secours (carte absente de Lorcast : quêtes des Illumineurs…) : miniature LorcanaJSON, « r:<chemin> » (serveur d'images de l'appli officielle). */
export const rbImg = c => { const m = /^https:\/\/api\.lorcana\.ravensburger\.com\/images\/(.+)$/.exec((c.images && c.images.thumbnail) || ''); return m ? 'r:' + m[1] : ''; };
/** Une carte (valeurs anglaises) → ligne compacte de cards.json. */
export function row(c, img) {
  const foil = ((c.foilTypes || ['None']).includes('None') ? 1 : 0) | ((c.foilTypes || []).some(f => f !== 'None') ? 2 : 0);
  return [c.id, c.promoGrouping || c.setCode, printedNum(c), inkMask(c), c.cost ?? 0, c.inkwell ? 1 : 0, Math.max(0, TYPES.indexOf(c.type)), Math.max(0, RARITIES.indexOf(c.rarity)),
    c.strength ?? -1, c.willpower ?? -1, c.lore ?? -1, foil, img, c.allowedInFormats && c.allowedInFormats.Core && c.allowedInFormats.Core.allowed ? 1 : 0, c.maxCopiesInDeck || 0, c.setCode];
}
/** Une carte dans une langue → [id, nom, version, texte, sous-types, histoire]. */
export const textRow = c => [c.id, c.name || '', c.version || '', c.fullText || '', c.subtypesText || '', c.story || ''];

/** Noms des groupes de promos absents de Lorcast (ou sous un autre code) : codes LorcanaJSON (promoGrouping). */
const PROMO_NAMES = { C1: 'Challenge Promo' };
export function build(lj, lcCards, lcSets = []) {
  const en = lj.en.cards, imgs = new Map();
  for (const x of lcCards) { const t = lcToken(x.image_uris && x.image_uris.digital && x.image_uris.digital.small); if (t) imgs.set(joinKey(x.set.code, x.collector_number), t); }
  const sets = Object.entries(lj.en.sets).filter(([, s]) => s.hasAllCards || (s.cardCounts && s.cardCounts.total)).map(([code, s]) => ({
    c: code, t: s.type, d: s.releaseDate || s.prereleaseDate || '', b: (s.cardCounts && s.cardCounts.base) || 0,
    n: Object.fromEntries(LANGS.map(l => [l, (lj[l] && lj[l].sets[code] && lj[l].sets[code].name) || s.name])),
  }));
  const lcName = new Map(lcSets.map(x => [String(x.code).toLowerCase(), x]));
  for (const code of [...new Set(en.filter(c => c.promoGrouping).map(c => c.promoGrouping))]) {      // promos : leur vrai nom (Promo Set 1, D23 Collection…), pas « Promos P1 »
    if (sets.some(x => x.c === code)) continue;
    const x = lcName.get(code.toLowerCase()), name = (x && x.name) || PROMO_NAMES[code];
    if (name) sets.push({ c: code, t: 'promo', d: (x && x.released_at) || '', b: 0, n: Object.fromEntries(LANGS.map(l => [l, name])) });
  }
  let withImg = 0;
  const cards = en.map(c => { const img = imgs.get(joinKey(c.promoGrouping || c.setCode, printedNum(c))) || rbImg(c); if (img && img[1] !== ':') withImg++; return row(c, img); }).sort((a, b) => a[0] - b[0]);
  const texts = {};
  for (const l of LANGS) {
    const own = new Map(((lj[l] && lj[l].cards) || []).map(c => [c.id, c]));
    texts[l] = en.map(c => textRow(own.get(c.id) || c)).sort((a, b) => a[0] - b[0]);      // carte absente de cette langue (promo anglaise, extension pas encore traduite) : l'anglais
  }
  return { cat: { v: lj.en.metadata.generatedOn, inks: INKS, types: TYPES, rarities: RARITIES, sets, cards }, texts, withImg };
}

async function main() {
  const lj = {};
  for (const l of LANGS) {
    try { lj[l] = await get(`${LJ}/${l}/allCards.json`, `lj-${l}.json`); }
    catch (e) { if (l === 'en') throw e; console.warn(`LorcanaJSON ${l} indisponible (${e.message}) : anglais à la place`); }
  }
  let lcCards = [], lcSets = [];
  try {
    const sets = lcSets = (await get(`${LC}/sets`, 'lc-sets.json')).results || [];
    for (const s of sets) { lcCards.push(...(await get(`${LC}/sets/${encodeURIComponent(s.code)}/cards`, `lc-set-${s.code}.json`)).map(x => ({ ...x, set: x.set || { code: s.code } }))); if (!CACHE) await sleep(150); }
  } catch (e) { console.warn('Lorcast indisponible : images de secours', e.message); lcCards = []; }
  const { cat, texts, withImg } = build(lj, lcCards, lcSets);
  if (cat.cards.length < 1000) throw new Error('catalogue trop petit : ' + cat.cards.length);
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'cards.json'), JSON.stringify(cat));
  for (const l of LANGS) writeFileSync(join(OUT, `cards-${l}.json`), JSON.stringify({ v: cat.v, l, cards: texts[l] }));
  console.log(`${cat.cards.length} cartes, ${cat.sets.length} extensions, ${withImg} images Lorcast (LorcanaJSON ${cat.v})`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch(e => { console.error(e); process.exit(1); });
