/* ── core.js : langue de l'interface et logique pure (collection, decks, imports, échange, partage). Testable sous Node (tests/test-core.mjs). ── */

/* ── Langue de l'interface (repris de Mana Orbit) ───────────────────────────────────────────────
   Les textes sont écrits en français dans le code. T('Texte {n}', { n }) donne leur traduction (dictionnaires src/i18n/<langue>.<partie>.json,
   posés par build.mjs dans un bloc JSON inerte par langue, id i18n-<code>), sinon le texte tel quel. TN(n, '{n} carte', '{n} cartes') : pluriel
   selon la langue (Intl.PluralRules). Ajouter une langue = ses dictionnaires + une entrée dans I18N_LANGS ; sans dictionnaire, elle n'est proposée nulle part. */
const I18N_LANGS = { fr: 'Français', en: 'English', de: 'Deutsch', it: 'Italiano' };
const I18N = { lang: 'fr', nav: 'fr-FR', dict: null };
function T(s, v) {
  let out = I18N.dict && Object.prototype.hasOwnProperty.call(I18N.dict, s) ? I18N.dict[s] : s;
  if (v) out = out.replace(/\{(\w+)\}/g, (m, k) => v[k] != null ? v[k] : m);
  return out;
}
const PLURAL = {};
function TN(n, one, many, v) {
  const x = Number(n || 0), l = I18N.lang;
  let pr = PLURAL[l]; if (pr === undefined) { try { pr = PLURAL[l] = new Intl.PluralRules(l); } catch (e) { pr = PLURAL[l] = null; } }
  return T((pr ? pr.select(x) === 'one' : x === 1) ? one : many, { n: x.toLocaleString(LOC()), ...v });
}
/** Locale des nombres et des dates : fr-FR, de-DE, it-IT ; anglais : celle du navigateur (en-US, en-GB…). */
const LOC = () => ({ fr: 'fr-FR', de: 'de-DE', it: 'it-IT' })[I18N.lang] || (/^en(-|$)/i.test(I18N.nav) ? I18N.nav : 'en-GB');
function i18nHas(code, all) {
  if (!code || !Object.prototype.hasOwnProperty.call(I18N_LANGS, code)) return false;
  if (code === 'fr') return true;
  if (all) return !!all[code];
  try { return !!document.getElementById('i18n-' + code); } catch (e) { return false; }
}
const i18nLangs = all => Object.entries(I18N_LANGS).filter(([c]) => i18nHas(c, all));
/** Langue : choix gardé, sinon ?lang=xx, sinon la première langue du téléphone qui est livrée, sinon l'anglais. Navigateur piloté (tests) : français. */
function i18nPick(o = {}) {
  const has = c => i18nHas(c, o.all);
  const navs = [].concat(o.nav || (typeof navigator !== 'undefined' && (navigator.languages && navigator.languages.length ? [...navigator.languages] : navigator.language)) || 'fr-FR').map(String);
  const robot = o.robot != null ? o.robot : typeof navigator !== 'undefined' && (navigator.webdriver || /jsdom/i.test(navigator.userAgent || ''));
  const dev = () => navs.map(t => t.toLowerCase().split(/[-_]/)[0]).find(has);
  const code = o.saved && has(o.saved) ? o.saved : robot ? 'fr' : dev() || 'en';
  I18N.lang = code; I18N.nav = navs[0]; I18N.dict = code === 'fr' ? null : o.all ? o.all[code] || null : i18nDict(code);
  return code;
}
function i18nDict(code) { try { const el = document.getElementById('i18n-' + code); return el ? JSON.parse(el.textContent) : null; } catch (e) { return null; } }
if (typeof document !== 'undefined' && typeof location !== 'undefined') {
  let saved = '';
  try { const q = new URLSearchParams(location.search).get('lang'); if (q && i18nHas(q)) localStorage.setItem('inkorbit:lang', q); saved = localStorage.getItem('inkorbit:lang') || ''; } catch (e) { /* stockage indisponible */ }
  i18nPick({ saved });
  try { document.documentElement.lang = I18N.lang; } catch (e) { /* ignore */ }
}
/** Textes fixes de la page (body.html) : nœuds texte et attributs lisibles traduits une fois au démarrage. */
function i18nDom(root) {
  if (!I18N.dict || !root) return;
  const tr = s => { const k = s.trim(); return k && Object.prototype.hasOwnProperty.call(I18N.dict, k) ? s.replace(k, I18N.dict[k]) : s; };
  const w = root.ownerDocument.createTreeWalker(root, 4), nodes = [];
  while (w.nextNode()) nodes.push(w.currentNode);
  for (const n of nodes) { if (n.parentNode && /^(SCRIPT|STYLE)$/.test(n.parentNode.nodeName)) continue; const v = tr(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; }
  for (const el of root.querySelectorAll('[aria-label],[placeholder],[title],[alt]')) for (const a of ['aria-label', 'placeholder', 'title', 'alt']) { const v = el.getAttribute(a); if (v) { const t = tr(v); if (t !== v) el.setAttribute(a, t); } }
}

/* ── Constantes du jeu ───────────────────────────────────────────────────────────────────────── */
/** Ordre des encres = bits du masque de cards.json (Ambre = 1, Améthyste = 2…). Clé = nom des jetons CSS (--amber…) et des symboles (#ink-amber…). */
const INK_KEYS = ['amber', 'amethyst', 'emerald', 'ruby', 'sapphire', 'steel'];
const INK_NAMES = () => [T('Ambre'), T('Améthyste'), T('Émeraude'), T('Rubis'), T('Saphir'), T('Acier')];
const TYPE_NAMES = () => [T('Personnage'), T('Action'), T('Objet'), T('Lieu')];
const RAR_KEYS = ['common', 'uncommon', 'rare', 'super', 'legendary', 'epic', 'enchanted', 'iconic', 'special'];
const RAR_NAMES = () => [T('Commune'), T('Inhabituelle'), T('Rare'), T('Très rare'), T('Légendaire'), T('Épique'), T('Enchantée'), T('Iconique'), T('Promo')];
const inksOf = mask => INK_KEYS.map((k, i) => (mask >> i) & 1 ? i : -1).filter(i => i >= 0);
const DECK_MIN = 60, DECK_COPIES = 4, DECK_INKS = 2;

/* ── Noms ────────────────────────────────────────────────────────────────────────────────────── */
/** Clé d'un nom : casse, accents, apostrophes et ponctuation ignorés (« Stitch - Rock Star », « stitch rock star » se rejoignent). */
const normName = s => String(s || '').replace(/æ/gi, 'ae').replace(/œ/gi, 'oe').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['’‘`´]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const fullName = c => (c.ver ? `${c.name} - ${c.ver}` : c.name);
/** Ressemblance de deux noms normalisés (0 à 1, distance d'édition) : noms lus au scan, saisies approximatives. */
function nameSim(a, b) {
  if (a === b) return 1; if (!a || !b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) { const cur = [i]; for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
  return 1 - prev[b.length] / Math.max(a.length, b.length);
}

/* ── Collection : { "<id>[*][@<langue>]": quantité } ───────────────────────────────────────────
   « 123 » : carte 123 normale ; « 123* » : foil ; « 123@fr » / « 123*@de » : langue imprimée (facultative). */
const collKey = (id, foil, lang) => `${id}${foil ? '*' : ''}${lang ? '@' + lang : ''}`;
function collParse(k) { const m = /^(\d+)(\*?)(?:@([a-z]{2}))?$/.exec(k); return m ? { id: +m[1], foil: !!m[2], lang: m[3] || '' } : null; }
/** Ajoute (ou retire, n < 0) des exemplaires ; une ligne à 0 disparaît. Renvoie la nouvelle quantité. */
function collAdd(map, key, n) { const v = Math.max(0, (map[key] || 0) + n); if (v) map[key] = v; else delete map[key]; return v; }
/** Quantités par carte (toutes finitions et langues confondues) : Map id → { n, foil }. */
function collById(map) {
  const out = new Map();
  for (const [k, q] of Object.entries(map)) { const p = collParse(k); if (!p || !(q > 0)) continue; const o = out.get(p.id) || { n: 0, foil: 0 }; o.n += q; if (p.foil) o.foil += q; out.set(p.id, o); }
  return out;
}
/** Prix d'une ligne (centimes) : foil → prix foil, sinon normal ; repli sur l'autre si un seul existe. cur : 'EUR' | 'USD'. */
function priceFor(prices, id, foil, cur) {
  const p = prices && prices[id]; if (!p) return 0;
  const [n, f] = cur === 'USD' ? [p[2], p[3]] : [p[0], p[1]];
  return foil ? f || n : n || f;
}
function collValue(map, prices, cur) { let v = 0; for (const [k, q] of Object.entries(map)) { const p = collParse(k); if (p) v += q * priceFor(prices, p.id, p.foil, cur); } return v; }

/* ── Imports ─────────────────────────────────────────────────────────────────────────────────── */
function csvSplit(line, d) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true; else if (ch === d) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur); return out.map(x => x.trim());
}
const csvCell = v => (/[",;\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
/** Colonnes reconnues (en-têtes en minuscules) : Ink Orbit, Dreamborn (« Set Number, Card Number, Variant, Count, Name »), TCGplayer, tableurs. */
const CSV_COLS = {
  set: ['set number', 'set', 'set code', 'set id', 'extension', 'set name'], num: ['card number', 'number', 'collector number', 'numero', 'no', 'n'],
  qty: ['count', 'quantity', 'qty', 'add to quantity', 'quantite', 'amount', 'owned'], name: ['name', 'product name', 'card name', 'card', 'nom', 'carte'],
  ver: ['version', 'subtitle', 'sous titre'], foil: ['foil', 'variant', 'printing', 'finish', 'finition'], lang: ['language', 'langue', 'lang'],
};
const LANG_IN = { en: 'en', english: 'en', anglais: 'en', fr: 'fr', french: 'fr', francais: 'fr', de: 'de', german: 'de', deutsch: 'de', allemand: 'de', it: 'it', italian: 'it', italiano: 'it', italien: 'it' };
const isFoil = v => /foil|holo|true|yes|oui|^1$|^x$/i.test(String(v || '').trim()) && !/non ?foil|normal/i.test(String(v || ''));
/** Index des cartes pour les imports et les decklists : par (extension, numéro) et par nom complet normalisé (dans chaque langue chargée). */
function cardIndex(cards, extra = []) {
  const bySetNum = new Map(), byName = new Map();
  const addName = (k, c) => { if (!k) return; const l = byName.get(k); if (!l) byName.set(k, [c]); else if (!l.includes(c)) l.push(c); };
  for (const c of cards) {
    bySetNum.set(`${String(c.set).toLowerCase()}-${String(c.num).toLowerCase()}`, c);
    addName(normName(fullName(c)), c); addName(normName(c.name), c);
  }
  for (const [c, name, ver] of extra) { addName(normName(ver ? `${name} - ${ver}` : name), c); addName(normName(name), c); }
  return { bySetNum, byName };
}
/** Plusieurs impressions pour un nom : la plus ancienne de base (ni Enchantée, ni promo) d'abord. */
const pickPrint = list => list.slice().sort((a, b) => (a.rar >= 6) - (b.rar >= 6) || a.id - b.id)[0];
function findCard(ix, { set, num, name, ver }) {
  if (set != null && num != null && String(num) !== '') {
    const s = String(set).trim().replace(/^0+(?=\d)/, '').toLowerCase(), n = String(num).trim().replace(/\/.*$/, '').replace(/^0+(?=\d)/, '').toLowerCase();
    const promo = /\/([a-z]+\d+)$/i.exec(String(num).trim());      // Dreamborn : promo « 57/P3 »
    const c = ix.bySetNum.get(`${promo ? promo[1].toLowerCase() : s}-${n}`); if (c) return c;
  }
  if (name) { const l = ix.byName.get(normName(ver ? `${name} - ${ver}` : name)); if (l) return pickPrint(l); }
  return null;
}
/** CSV (virgule, point-virgule ou tabulation) → { lines: [{ card, foil, lang, qty }], bad: [texte des lignes non reconnues] }. */
function parseCsv(text, ix) {
  const rows = String(text || '').replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  if (!rows.length) return { lines: [], bad: [] };
  const d = [';', '\t', ','].sort((a, b) => rows[0].split(b).length - rows[0].split(a).length)[0];
  const head = csvSplit(rows[0], d).map(normName), col = {};
  for (const [k, names] of Object.entries(CSV_COLS)) col[k] = names.map(n => head.indexOf(n)).find(i => i >= 0) ?? -1;
  if (col.name < 0 && (col.set < 0 || col.num < 0)) return { lines: [], bad: rows };
  const lines = [], bad = [];
  for (const r of rows.slice(1)) {
    const v = csvSplit(r, d), g = k => (col[k] >= 0 ? v[col[k]] : '');
    const card = findCard(ix, { set: g('set'), num: g('num'), name: g('name'), ver: g('ver') });
    const qty = col.qty >= 0 ? parseInt(g('qty'), 10) : 1;
    if (!card || !(qty > 0)) { bad.push(r); continue; }
    lines.push({ card, foil: isFoil(g('foil')), lang: LANG_IN[normName(g('lang')).replace(/ /g, '')] || '', qty: Math.min(qty, 999) });
  }
  return { lines, bad };
}
/** Collection → CSV d'Ink Orbit (relu par parseCsv, et par Dreamborn : mêmes premières colonnes). */
function collToCsv(map, byId) {
  const out = [['Set Number', 'Card Number', 'Variant', 'Count', 'Name', 'Version', 'Language'].join(',')];
  const keys = Object.keys(map).map(k => [k, collParse(k)]).filter(([, p]) => p && byId.get(p.id)).sort((a, b) => a[1].id - b[1].id || a[0].localeCompare(b[0]));
  for (const [k, p] of keys) { const c = byId.get(p.id); out.push([c.set, c.num, p.foil ? 'foil' : 'normal', map[k], c.nameEn || c.name, c.verEn ?? c.ver, p.lang || ''].map(csvCell).join(',')); }
  return out.join('\n') + '\n';
}
/** Decklist texte : « 4 Elsa - Snow Queen », « 4x Elsa - Snow Queen », « Elsa - Snow Queen x4 », lignes vides et titres ignorés.
 *  → { cards: Map card → n, bad: [lignes non reconnues] }. */
function parseDeck(text, ix) {
  const cards = new Map(), bad = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const l = raw.trim(); if (!l || /^(#|\/\/)/.test(l) || /^[^\d]*:\s*$/.test(l)) continue;
    let m = /^(\d{1,3})\s*x?\s+(.+)$/i.exec(l), n = 0, name = '';
    if (m) { n = +m[1]; name = m[2]; } else if ((m = /^(.+?)\s+x\s?(\d{1,3})$/i.exec(l))) { n = +m[2]; name = m[1]; }
    name = name.replace(/\s*\([^)]*\)\s*$/, '').trim();      // « (Enchanted) » en fin de ligne
    const c = n > 0 && name ? findCard(ix, { name }) : null;
    if (!c) { bad.push(l); continue; }
    cards.set(c, (cards.get(c) || 0) + n);
  }
  return { cards, bad };
}
const deckToText = (deck, byId) => Object.entries(deck).filter(([id]) => byId.get(+id)).map(([id, n]) => { const c = byId.get(+id); return `${n} ${c.nameEn ? (c.verEn ? `${c.nameEn} - ${c.verEn}` : c.nameEn) : fullName(c)}`; }).join('\n');

/* ── Decks : { <id>: n } ─────────────────────────────────────────────────────────────────────── */
/** Règles du format Core : 60 cartes au moins, 1 ou 2 encres, 4 exemplaires au plus d'un même nom complet (sauf exception imprimée : card.max).
 *  → { total, inks: [indices], over: [noms au-delà], ok, problems: [textes] }. */
function deckCheck(deck, byId) {
  let total = 0; const inks = new Set(), names = new Map();
  for (const [id, n] of Object.entries(deck)) {
    const c = byId.get(+id); if (!c || !(n > 0)) continue;
    total += n; for (const i of inksOf(c.ink)) inks.add(i);
    const k = normName(c.nameEn ? `${c.nameEn} ${c.verEn || ''}` : fullName(c)), o = names.get(k) || { n: 0, max: c.max || DECK_COPIES, name: fullName(c) }; o.n += n; names.set(k, o);
  }
  const over = [...names.values()].filter(o => o.n > o.max).map(o => o.name), problems = [];
  if (total < DECK_MIN) problems.push(TN(DECK_MIN - total, 'Encore {n} carte pour atteindre 60', 'Encore {n} cartes pour atteindre 60'));
  if (inks.size > DECK_INKS) problems.push(T('{n} encres : 2 au plus', { n: inks.size }));
  for (const name of over) problems.push(T('{name} : 4 exemplaires au plus', { name }));
  return { total, inks: [...inks].sort(), over, ok: !problems.length, problems };
}
/** Cartes du deck qui manquent dans la collection (par carte, toutes finitions) : [{ id, need }]. */
function deckMissing(deck, map) {
  const own = collById(map), out = [];
  for (const [id, n] of Object.entries(deck)) { const have = (own.get(+id) || { n: 0 }).n; if (have < n) out.push({ id: +id, need: n - have }); }
  return out;
}

/* ── Échange ─────────────────────────────────────────────────────────────────────────────────── */
/** Cartes à échanger : au-delà de « keep » exemplaires (4 = un jeu complet), hors cartes gardées à la main (hold : { id: 1 }).
 *  Les recherchées : souhaits (wants : { id: n }) moins ce qui est possédé. */
function tradeLists(map, keep, hold, wants) {
  const own = collById(map), have = [], want = [];
  for (const [id, o] of own) { if (hold && hold[id]) continue; const n = o.n - keep; if (n > 0) have.push({ id, n, foil: Math.min(n, o.foil) }); }
  for (const [id, n] of Object.entries(wants || {})) { const lack = n - ((own.get(+id) || { n: 0 }).n); if (lack > 0) want.push({ id: +id, n: lack }); }
  return { have: have.sort((a, b) => a.id - b.id), want: want.sort((a, b) => a.id - b.id) };
}
/** Liste publique → texte compact (avant compression) : « v1|<nom>|<devise>|12.2,15,40.1*|7,9.2 » (id.quantité, * = au moins un foil). */
function tradePack({ name, cur, have, want }) {
  const one = l => l.map(x => `${x.id}${x.n > 1 ? '.' + x.n : ''}${x.foil ? '*' : ''}`).join(',');
  return ['v1', String(name || '').replace(/\|/g, ' ').slice(0, 40), cur === 'USD' ? 'USD' : 'EUR', one(have), one(want)].join('|');
}
function tradeUnpack(s) {
  const p = String(s || '').split('|'); if (p[0] !== 'v1' || p.length < 5) return null;
  const one = t => (t ? t.split(',') : []).map(x => /^(\d+)(?:\.(\d+))?(\*)?$/.exec(x)).filter(Boolean).map(m => ({ id: +m[1], n: m[2] ? +m[2] : 1, foil: m[3] ? 1 : 0 })).slice(0, 5000);
  return { name: p[1], cur: p[2] === 'USD' ? 'USD' : 'EUR', have: one(p[3]), want: one(p[4]) };
}
/** Correspondances entre ma collection et la liste d'un autre : ce qu'il a et que je cherche, ce que j'ai en trop et qu'il cherche. */
function tradeMatch(mine, theirs) {
  const myWant = new Map(mine.want.map(x => [x.id, x.n])), myHave = new Map(mine.have.map(x => [x.id, x.n]));
  return { forMe: theirs.have.filter(x => myWant.has(x.id)), forThem: theirs.want.filter(x => myHave.has(x.id)).map(x => ({ id: x.id, n: Math.min(x.n, myHave.get(x.id)) })) };
}
/** base64url ↔ octets (liens ?p=). */
const b64u = bytes => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64u = s => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

/* ── Jour (carte mystère, valeur quotidienne) ────────────────────────────────────────────────── */
/** Date du jour à Paris (« 2026-10-21 ») : même carte mystère pour tout le monde. */
const dayKey = (d = new Date()) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' }).format(d);
/** Nombre pseudo-aléatoire reproductible (0 à n−1) tiré d'une chaîne (FNV-1a puis mélange). */
function seedPick(s, n) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } h ^= h >>> 15; h = Math.imul(h, 2246822507); h ^= h >>> 13; return (h >>> 0) % n; }

/* ── Scan : la ligne du bas d'une carte ──────────────────────────────────────────────────────────
   « 123/204 • FR • 7 » : numéro / taille de l'extension • langue • extension. L'OCR confond souvent • avec . ou -, O avec 0, l avec 1. */
function parseFootLine(text) {
  const t = String(text || '').replace(/[|lI](?=\d)|(?<=\d)[lI]/g, '1').replace(/(?<=\d)[oO]|[oO](?=\d)/g, '0');
  const m = /(\d{1,3}[a-e]?)\s*\/\s*(\d{2,3}|P\d|C\d|D\d{2,3})\s*[•·.\-–,*°]?\s*([A-Z]{2})\s*[•·.\-–,*°]?\s*(\d{1,2}|Q\d)\b/.exec(t);
  return m ? { num: m[1], of: m[2], lang: m[3].toLowerCase(), set: m[4] } : null;
}

/* ── Synchro du compte (cloud.js) ────────────────────────────────────────────────────────────── */
/** Un document de synchro a-t-il des données (cartes, decks ou souhaits) ? */
const hasData = d => !!d && (Object.keys(d.coll || {}).length || (d.decks || []).length || Object.keys(d.wants || {}).length);
/** Fusion de deux documents de synchro (cloud.js, voir son en-tête) : quantité la plus haute par ligne, souhaits et cartes gardées réunis, decks par identifiant (le plus récent gagne), réglages de a d'abord. */
function mergeDocs(a, b) {
  const max = (x = {}, y = {}) => { const o = { ...x }; for (const [k, v] of Object.entries(y)) o[k] = Math.max(o[k] || 0, v); return o; };
  const decks = new Map((a.decks || []).map(d => [d.id, d]));
  for (const d of b.decks || []) { const o = decks.get(d.id); if (!o || (d.at || 0) > (o.at || 0)) decks.set(d.id, d); }
  return { v: 1, coll: max(a.coll, b.coll), wants: max(a.wants, b.wants), hold: { ...a.hold, ...b.hold }, decks: [...decks.values()], prefs: { ...b.prefs, ...a.prefs } };
}

if (typeof module !== 'undefined' && module.exports) module.exports = {
  hasData, mergeDocs,
  T, TN, I18N, i18nPick, i18nLangs, LOC, INK_KEYS, inksOf, normName, fullName, nameSim, collKey, collParse, collAdd, collById, priceFor, collValue,
  csvSplit, parseCsv, collToCsv, cardIndex, findCard, parseDeck, deckToText, deckCheck, deckMissing, tradeLists, tradePack, tradeUnpack, tradeMatch, b64u, unb64u, dayKey, seedPick, parseFootLine,
};
