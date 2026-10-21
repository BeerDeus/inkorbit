#!/usr/bin/env node
// Relevé quotidien des prix → public/data/prices.json : { v, src, p: { <id de carte>: [eur, eurFoil, usd, usdFoil] } } (centimes, 0 = pas de prix).
// EUR : guide des prix public de Cardmarket (downloads.s3.cardmarket.com, jeu 19 = Lorcana, régénéré chaque nuit), prix tendance.
// USD : TCGplayer via tcgcsv.com (catégorie 71 = Lorcana), prix « market ».
// Jointure : identifiants Cardmarket / TCGplayer de LorcanaJSON (externalLinks) ; carte sans identifiant (extension toute récente) :
// TCGplayer par extension + numéro. Garde-fou : rien n'est écrit si trop peu de cartes ont un prix (le fichier de la veille reste).
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.OUT_DIR || join(root, 'public', 'data');
const CACHE = process.env.CACHE_DIR || '';
const LJ = process.env.LJ_BASE || 'https://lorcanajson.org/files/current';
const CM = process.env.CM_BASE || 'https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_19.json';
const TC = process.env.TC_BASE || 'https://tcgcsv.com/tcgplayer/71';
const MIN = Number(process.env.PRICES_MIN) || 2000;
const UA = { 'User-Agent': 'InkOrbit/0.1 (fan app; daily price file)' };

async function get(url, name, text) {
  const f = CACHE && join(CACHE, name);
  if (f && existsSync(f)) { const t = readFileSync(f, 'utf8'); return text ? t : JSON.parse(t); }
  for (let i = 0; ; i++) {
    const r = await fetch(url, { headers: UA });
    if (r.ok) { const t = await r.text(); if (f) { mkdirSync(CACHE, { recursive: true }); writeFileSync(f, t); } return text ? t : JSON.parse(t); }
    if (i >= 3 || (r.status !== 429 && r.status < 500)) throw new Error(`${url} : HTTP ${r.status}`);
    await new Promise(res => setTimeout(res, 2000 * (i + 1)));
  }
}

/** Euros ou dollars → centimes ; 0, vide ou absurde → 0 (Cardmarket écrit 0 quand il n'a aucune vente). */
export const cents = x => { const n = parseFloat(x); return Number.isFinite(n) && n > 0 && n < 1e6 ? Math.round(n * 100) : 0; };
/** Prix d'une carte. cm : entrée du guide Cardmarket ; tc : { Normal, 'Cold Foil', Holofoil… } (marketPrice) ; noNormal : carte seulement en foil (Enchantée, Épique…). */
export function priceOf(cm, tc, noNormal) {
  let eur = 0, eurFoil = 0, usd = 0, usdFoil = 0;
  if (cm) { eur = cents(cm.trend) || cents(cm.avg7); eurFoil = cents(cm['trend-foil']) || cents(cm['avg7-foil']); }
  if (tc) { usd = cents(tc.Normal); usdFoil = cents(tc['Cold Foil']) || cents(tc.Holofoil) || cents(tc.Foil); }
  if (noNormal) { eurFoil = eurFoil || eur; usdFoil = usdFoil || usd; eur = usd = 0; }      // Cardmarket range parfois le prix des Enchantées dans les champs non foil
  return [eur, eurFoil, usd, usdFoil];
}
/** Numéro de collection TCGplayer (« 42/204 », « 4a ») → « 42 », « 4a ». */
export const tcNum = s => { const m = /^0*(\d+[a-z]?)/i.exec(String(s || '').trim()); return m ? m[1].toLowerCase() : ''; };

export function build(cards, cmGuide, tcGroups) {
  const cm = new Map(cmGuide.priceGuides.map(x => [x.idProduct, x]));
  const tcById = new Map(), tcByNum = new Map();
  for (const g of tcGroups) for (const p of g.prices) {
    const o = tcById.get(p.productId) || {}; o[p.subTypeName] = p.marketPrice; tcById.set(p.productId, o);
    const prod = g.products.get(p.productId); if (prod && prod.num) tcByNum.set(`${String(g.abbr).toLowerCase()}-${prod.num}`, o);
  }
  const p = {}; let n = 0;
  for (const c of cards) {
    const ex = c.externalLinks || {}, noNormal = !(c.foilTypes || ['None']).includes('None');
    const num = (/^(\d+[a-z]?)\//.exec(c.fullIdentifier || '') || [, String(c.number)])[1];
    const tc = tcById.get(ex.tcgPlayerId) || tcByNum.get(`${String(c.promoGrouping || c.setCode).toLowerCase()}-${num}`);
    const v = priceOf(cm.get(ex.cardmarketId), tc, noNormal);
    if (v.some(Boolean)) { p[c.id] = v; n++; }
  }
  return { p, n };
}

async function main() {
  const cards = (await get(`${LJ}/en/allCards.json`, 'lj-en.json')).cards;
  const cmGuide = await get(CM, 'cm-price-guide.json');
  const groups = (await get(`${TC}/groups`, 'tc-groups.json')).results || [];
  const tcLast = (await get('https://tcgcsv.com/last-updated.txt', 'tc-last.txt', true).catch(() => '')).trim();
  const tcGroups = [];
  for (const g of groups) {
    const prices = (await get(`${TC}/${g.groupId}/prices`, `tc-p-${g.groupId}.json`)).results || [];
    const prods = (await get(`${TC}/${g.groupId}/products`, `tc-pr-${g.groupId}.json`)).results || [];
    const products = new Map(prods.map(x => [x.productId, { num: tcNum(((x.extendedData || []).find(e => e.name === 'Number') || {}).value) }]));
    tcGroups.push({ abbr: g.abbreviation, prices, products });
    if (!CACHE) await new Promise(r => setTimeout(r, 200));
  }
  const { p, n } = build(cards, cmGuide, tcGroups);
  if (n < MIN) throw new Error(`seulement ${n} cartes avec un prix (minimum ${MIN}) : fichier de la veille gardé`);
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'prices.json'), JSON.stringify({ v: new Date().toISOString().slice(0, 10), src: { cardmarket: cmGuide.createdAt || '', tcgplayer: tcLast }, p }));
  console.log(`${n} cartes avec un prix sur ${cards.length}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch(e => { console.error(e.message || e); process.exit(1); });
