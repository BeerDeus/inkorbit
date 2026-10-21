// Traductions : chaque texte français du code (T('…'), TN(n, '…', '…')) et de body.html a sa traduction dans chaque langue livrée (src/i18n/<langue>.*.json),
// les variables {x} sont les mêmes, et aucune traduction ne traîne sans texte dans le code. node tests/test-i18n.mjs --missing en : liste à traduire (JSON).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const root = new URL('../', import.meta.url);
const src = f => readFileSync(new URL('src/' + f, root), 'utf8');
export function keys() {
  const out = new Set(), unq = s => s.replace(/\\(['\\])/g, '$1');
  for (const f of readdirSync(new URL('src/', root)).filter(f => f.endsWith('.js'))) {
    const js = src(f);
    for (const m of js.matchAll(/\bT\(\s*'((?:[^'\\]|\\.)*)'/g)) out.add(unq(m[1]));
    for (const m of js.matchAll(/\bTN\([^']*?'((?:[^'\\]|\\.)*)'\s*,\s*'((?:[^'\\]|\\.)*)'/g)) { out.add(unq(m[1])); out.add(unq(m[2])); }
  }
  const d = new JSDOM(src('body.html').replace('<!--icons-->', '')).window.document;
  const w = d.createTreeWalker(d.body, 4);
  while (w.nextNode()) { const t = w.currentNode.nodeValue.trim(); if (t && /[A-Za-zÀ-ÿ]/.test(t)) out.add(t); }
  for (const el of d.querySelectorAll('[aria-label],[placeholder],[title],[alt]')) for (const a of ['aria-label', 'placeholder', 'title', 'alt']) { const v = el.getAttribute(a); if (v) out.add(v.trim()); }
  for (const k of ['Ink Orbit']) out.delete(k);      // noms propres : jamais traduits
  return out;
}
export function dicts() {
  const all = {};
  for (const f of readdirSync(new URL('src/i18n/', root))) { const m = /^([a-z]{2})(?:\.[a-z0-9-]+)?\.json$/.exec(f); if (m) Object.assign(all[m[1]] = all[m[1]] || {}, JSON.parse(readFileSync(new URL('src/i18n/' + f, root), 'utf8'))); }
  return all;
}
const vars = s => [...String(s).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join();

if (process.argv.includes('--missing')) {
  const l = process.argv[process.argv.indexOf('--missing') + 1] || 'en', d = dicts()[l] || {};
  console.log(JSON.stringify([...keys()].filter(k => !(k in d)), null, 1));
} else {
  test('chaque texte a sa traduction, avec les mêmes variables', () => {
    const k = keys(), all = dicts();
    assert.ok(Object.keys(all).length >= 1, 'au moins une langue livrée');
    for (const [l, d] of Object.entries(all)) {
      const miss = [...k].filter(x => !(x in d));
      assert.deepEqual(miss.slice(0, 30), [], `${l} : ${miss.length} textes sans traduction`);
      const bad = Object.entries(d).filter(([a, b]) => vars(a) !== vars(b)).map(([a]) => a);
      assert.deepEqual(bad, [], `${l} : variables différentes`);
      const stale = Object.keys(d).filter(x => !k.has(x));
      assert.deepEqual(stale.slice(0, 30), [], `${l} : ${stale.length} traductions sans texte dans le code`);
    }
  });
}
