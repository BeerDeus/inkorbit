#!/usr/bin/env node
// Decks de démarrage officiels → public/data/starters.json : { v, src, decks: [{ id, set, name: { en, fr, de, it }, inks, cards: { <id>: n } }] }.
// Source : LorcanaJSON (lorcanajson.org › Deck downloads, files/current/<langue>/decks/deckdata.S<extension>-<n>.json), mêmes identifiants de cartes
// que allCards.json. Seuls les decks de démarrage (« S… », 60 cartes) sont gardés : Gateway (30 cartes) et Quêtes (scénarios) ne sont pas des decks à monter.
// Les codes sont sondés (S1-1 … S30-4) : un 404 veut dire « pas de tel deck ». CACHE_DIR : comme gen-cards.mjs.
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.OUT_DIR || join(root, 'public', 'data');
const CACHE = process.env.CACHE_DIR || '';
const LJ = process.env.LJ_BASE || 'https://lorcanajson.org/files/current';
const UA = { 'User-Agent': 'InkOrbit/0.1 (fan app; github.com/BeerDeus/inkorbit)' };
const LANGS = ['en', 'fr', 'de', 'it'];
const INKS = ['Amber', 'Amethyst', 'Emerald', 'Ruby', 'Sapphire', 'Steel'];

/** Fichier JSON, ou null si absent (404). */
async function get(url, name) {
  const f = CACHE && join(CACHE, name);
  if (f && existsSync(f)) { const t = readFileSync(f, 'utf8'); return t === 'null' ? null : JSON.parse(t); }
  for (let i = 0; ; i++) {
    const r = await fetch(url, { headers: UA });
    if (r.status === 404) { if (f) { mkdirSync(CACHE, { recursive: true }); writeFileSync(f, 'null'); } return null; }
    if (r.ok) { const t = await r.text(); if (f) { mkdirSync(CACHE, { recursive: true }); writeFileSync(f, t); } return JSON.parse(t); }
    if (i >= 3 || (r.status !== 429 && r.status < 500)) throw new Error(`${url} : HTTP ${r.status}`);
    await new Promise(res => setTimeout(res, 2000 * (i + 1)));
  }
}

/** Un deck LorcanaJSON (anglais) + noms dans les autres langues → ligne de starters.json, ou une raison de l'écarter. ids : identifiants connus. */
export function deckRow(code, en, names, ids) {
  const cards = {};
  for (const c of en.cards) cards[c.id] = (cards[c.id] || 0) + c.amount;
  const total = Object.values(cards).reduce((s, n) => s + n, 0);
  if (total !== 60) return { skip: `${code} : ${total} cartes` };
  const unknown = Object.keys(cards).filter(id => !ids.has(+id));
  if (unknown.length) return { skip: `${code} : cartes inconnues ${unknown.join(',')}` };
  const inks = (en.colors || []).map(x => INKS.indexOf(x)).filter(i => i >= 0).sort((a, b) => a - b);
  return { deck: { id: code, set: String(en.deckGroup || code.split('-')[0]).replace(/^S/, ''), name: { en: en.name || '', ...names }, inks, cards } };
}

async function main() {
  const ids = new Set(JSON.parse(readFileSync(join(OUT, 'cards.json'), 'utf8')).cards.map(r => r[0]));      // catalogue de gen-cards.mjs (lancé avant)
  const decks = [], skipped = []; let v = '';
  for (let s = 1; s <= 30; s++) for (let k = 1; k <= 4; k++) {
    const code = `S${s}-${k}`, en = await get(`${LJ}/en/decks/deckdata.${code}.json`, `deck-en-${code}.json`);
    if (!en) continue;
    v = v || (en.metadata && en.metadata.generatedOn) || '';
    const names = {};
    for (const l of LANGS.slice(1)) { const d = await get(`${LJ}/${l}/decks/deckdata.${code}.json`, `deck-${l}-${code}.json`).catch(() => null); if (d && d.name) names[l] = d.name; }
    const r = deckRow(code, en, names, ids);
    if (r.deck) decks.push(r.deck); else skipped.push(r.skip);
  }
  if (decks.length < 10) throw new Error('trop peu de decks de démarrage : ' + decks.length);
  writeFileSync(join(OUT, 'starters.json'), JSON.stringify({ v, src: 'LorcanaJSON (lorcanajson.org), decks officiels', decks }));
  console.log(`${decks.length} decks de démarrage` + (skipped.length ? ` · écartés : ${skipped.join(' ; ')}` : ''));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch(e => { console.error(e.message || e); process.exit(1); });
