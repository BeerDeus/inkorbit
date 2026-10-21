/* ── data.js : catalogue, prix, images, stockage local ─────────────────────────────────────────────
   Catalogue : data/cards.json (commun) + data/cards-<langue>.json (noms, versions, textes) de la langue des cartes ; l'anglais est lu aussi
   (en arrière-plan) pour reconnaître les decklists et les CSV écrits en anglais. Prix : data/prices.json (relevé du jour, gen-prices.mjs).
   Le service worker garde une copie : l'appli marche hors ligne avec le dernier catalogue vu. */
const CARDS = { ready: false, list: [], byId: new Map(), sets: [], setsByCode: new Map(), v: '', lang: 'fr', ix: null, enLoaded: false, wait: null };
const PRICES = { p: {}, v: '', src: {} };
const IO_LANGS = ['en', 'fr', 'de', 'it'];

/* ── Stockage (localStorage, préfixe inkorbit:) : jamais d'erreur si le navigateur le refuse ── */
function load(k, def) { try { const v = localStorage.getItem('inkorbit:' + k); return v == null ? def : JSON.parse(v); } catch (e) { return def; } }
let saveWarned = false;
function save(k, v) { try { localStorage.setItem('inkorbit:' + k, JSON.stringify(v)); } catch (e) { if (!saveWarned && typeof toast === 'function') { saveWarned = true; toast(T('Stockage plein ou bloqué : tes derniers changements ne sont pas gardés. Exporte une sauvegarde (Réglages) ou connecte-toi.'), { ms: 9000 }); } return false; } if (typeof cloudTouch === 'function') cloudTouch(k); return true; }      // cloudTouch : synchro du compte (cloud.js)
/** Réglages : cur (EUR | USD), clang (langue des cartes), keep (exemplaires gardés avant d'échanger), theme, name (pseudo de la liste publique). */
function prefs() { return { cur: ['fr', 'de', 'it'].includes(I18N.lang) ? 'EUR' : 'USD', clang: IO_LANGS.includes(I18N.lang) ? I18N.lang : 'en', keep: 4, theme: '', name: '', ...load('prefs', {}) }; }
function setPref(k, v) { save('prefs', { ...load('prefs', {}), [k]: v }); }

/* ── Images (Lorcast ; secours : serveur d'images de l'appli officielle, via LorcanaJSON) ── */
const IMG_SIZES = { small: 'small', normal: 'normal', large: 'large' };
function cardImg(c, size = 'normal') {
  const t = c && c.img; if (!t) return '';
  if (t.startsWith('r:')) return 'https://api.lorcana.ravensburger.com/images/' + t.slice(2);
  const q = t.indexOf('?');
  return `https://cards.lorcast.io/card/digital/${IMG_SIZES[size] || 'normal'}/crd_${q < 0 ? t : t.slice(0, q)}.avif${q < 0 ? '' : t.slice(q)}`;
}

async function getJson(url) { const r = await fetch(url, { cache: 'no-cache' }); if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); }
/** Ligne de cards.json + ligne de texte → carte en mémoire (contrat : docs/contrat.md › Données). */
function cardOf(r, t) {
  return { id: r[0], set: r[1], num: r[2], ink: r[3], cost: r[4], inkwell: !!r[5], type: r[6], rar: r[7], str: r[8], wil: r[9], lore: r[10], foil: r[11], img: r[12], core: !!r[13], max: r[14] || 0, pset: r[15],
    name: t ? t[1] : '', ver: t ? t[2] : '', text: t ? t[3] : '', sub: t ? t[4] : '', story: t ? t[5] : '', nameEn: '', verEn: '', key: '' };
}
/** Clé de recherche d'une carte : nom et version dans la langue des cartes et en anglais. */
const searchKey = c => normName(`${c.name} ${c.ver} ${c.nameEn !== c.name ? c.nameEn + ' ' + c.verEn : ''}`);
/** Charge le catalogue (une fois ; les appels suivants attendent le même chargement). */
function dataLoad() {
  if (CARDS.wait) return CARDS.wait;
  const lang = prefs().clang;
  CARDS.wait = (async () => {
    const [cat, tx, pr] = await Promise.all([getJson('data/cards.json'), getJson(`data/cards-${lang}.json`), getJson('data/prices.json').catch(() => null)]);
    const t = new Map(tx.cards.map(x => [x[0], x]));
    CARDS.list = cat.cards.map(r => cardOf(r, t.get(r[0])));
    CARDS.byId = new Map(CARDS.list.map(c => [c.id, c]));
    CARDS.sets = cat.sets.map(s => ({ code: s.c, type: s.t, date: s.d, base: s.b, name: s.n[lang] || s.n.en, nameEn: s.n.en }));
    CARDS.setsByCode = new Map(CARDS.sets.map(s => [s.code, s]));
    CARDS.v = cat.v; CARDS.lang = lang;
    if (lang === 'en') enApply(tx); else setTimeout(() => dataEn().catch(() => {}), 300);
    for (const c of CARDS.list) c.key = searchKey(c);
    CARDS.ix = cardIndex(CARDS.list);
    if (pr) { PRICES.p = pr.p || {}; PRICES.v = pr.v || ''; PRICES.src = pr.src || {}; }
    CARDS.ready = true;
    document.dispatchEvent(new CustomEvent('io:data'));
  })().catch(e => { CARDS.wait = null; throw e; });
  return CARDS.wait;
}
function enApply(tx) {
  const t = new Map(tx.cards.map(x => [x[0], x]));
  for (const c of CARDS.list) { const e = t.get(c.id); if (e) { c.nameEn = e[1]; c.verEn = e[2]; } }
  CARDS.enLoaded = true;
}
/** Noms anglais (decklists, CSV, recherche en anglais) : chargés après le démarrage, ou tout de suite quand un import en a besoin. */
let enWait = null;
function dataEn() {
  if (CARDS.enLoaded) return Promise.resolve();
  return enWait || (enWait = (async () => {
    await dataLoad(); if (CARDS.enLoaded) return;
    enApply(await getJson('data/cards-en.json'));
    for (const c of CARDS.list) c.key = searchKey(c);
    CARDS.ix = cardIndex(CARDS.list, CARDS.list.map(c => [c, c.nameEn, c.verEn]));
  })().catch(e => { enWait = null; throw e; }));
}

/* ── Recherche ─────────────────────────────────────────────────────────────────────────────────── */
/** Cartes dont le nom (ou la version) contient tous les mots tapés ; « 7 » ou « 7/12 » : numéro ; filtres : { ink, set, rar, type, cost }. */
function cardSearch(q, f = {}, limit = 200) {
  const words = normName(q).split(' ').filter(Boolean), out = [];
  const numQ = /^(\d{1,3}[a-e]?)(?:\s*\/\s*(\w+))?$/.exec(String(q || '').trim());
  if (!numQ && words.length && words.join('').length < 2) return [];      // une seule lettre : trop de cartes, rien à montrer
  for (const c of CARDS.list) {
    if (f.ink != null && f.ink !== '' && !((c.ink >> f.ink) & 1)) continue;
    if (f.set && c.set !== f.set && c.pset !== f.set) continue;
    if (f.rar != null && f.rar !== '' && c.rar !== +f.rar) continue;
    if (f.type != null && f.type !== '' && c.type !== +f.type) continue;
    if (f.cost != null && f.cost !== '' && (+f.cost >= 9 ? c.cost < 9 : c.cost !== +f.cost)) continue;
    if (numQ) { if (String(c.num) !== numQ[1] || (numQ[2] && String(c.set).toLowerCase() !== numQ[2].toLowerCase())) continue; }
    else if (words.length && !words.every(w => c.key.includes(w))) continue;
    out.push(c); if (out.length >= limit) break;
  }
  if (words.length && !numQ) { const k = words.join(' '); out.sort((a, b) => (!normName(a.name).startsWith(k)) - (!normName(b.name).startsWith(k)) || a.id - b.id); }
  return out;
}
/** Ordre des extensions : sortie la plus récente d'abord ; promos (codes P1, C1…) : leur nom lisible. */
const setName = code => { const s = CARDS.setsByCode.get(String(code)); return s ? s.name : T('Promos {code}', { code }); };
const setLabel = c => (CARDS.setsByCode.has(String(c.set)) ? `${c.set} · ${c.num}` : `${c.set} ${c.num}`);
const cardPrice = (c, foil) => priceFor(PRICES.p, c.id, foil, prefs().cur);

/* ── Collection et listes de l'utilisateur ─────────────────────────────────────────────────────── */
const COLL = { map: load('coll', {}), wants: load('wants', {}), hold: load('hold', {}) };
const collSubs = new Set();
/** Écrit la collection et prévient les vues (rendu au prochain affichage). */
function collSave() { save('coll', COLL.map); save('wants', COLL.wants); save('hold', COLL.hold); for (const f of collSubs) { try { f(); } catch (e) { console.error(e); } } }
const onColl = f => collSubs.add(f);
const ownedOf = id => { let n = 0; for (const k of [collKey(id), collKey(id, true)]) n += COLL.map[k] || 0; for (const l of IO_LANGS) n += (COLL.map[collKey(id, false, l)] || 0) + (COLL.map[collKey(id, true, l)] || 0); return n; };
