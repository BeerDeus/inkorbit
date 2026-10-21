// Règles Firestore (firestore.rules) contre l'émulateur : le propriétaire lit et écrit son document de synchro, personne d'autre ; champs et types contrôlés.
// Decks de la communauté : lecture publique, écriture par l'auteur seul, signalement = pubreports créé avec reports + 1 dans le même lot.
// Lancer : firebase emulators:exec --only firestore "node tests/rules-test.mjs" (FIRESTORE_EMULATOR_HOST posé par l'émulateur ; sans lui, le test s'ignore).
// RULES_DEPS : dossier node_modules où sont @firebase/rules-unit-testing et firebase (défaut : tests/node_modules).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const host = process.env.FIRESTORE_EMULATOR_HOST;
if (!host) { console.log('ignoré : pas d\'émulateur Firestore (FIRESTORE_EMULATOR_HOST)'); process.exit(0); }
const req = createRequire(process.env.RULES_DEPS ? process.env.RULES_DEPS + '/' : import.meta.url);
const { initializeTestEnvironment, assertSucceeds, assertFails } = req('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, deleteDoc, updateDoc, writeBatch, increment } = req('firebase/firestore');

const [h, p] = host.split(':');
const env = await initializeTestEnvironment({ projectId: 'demo-inkorbit', firestore: { host: h, port: +p, rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') } });
const good = { v: 1, coll: { '42': 2, '42*@fr': 1 }, wants: { 1: 1 }, hold: {}, decks: [{ id: 'd1', name: 'Test', cards: { 42: 4 }, at: 1 }], prefs: { cur: 'EUR' }, at: Date.now(), dev: 'abc123' };
let n = 0; const ok = async (pr, m) => { await pr; console.log('✓', m); n++; };
try {
  const me = env.authenticatedContext('alice').firestore(), other = env.authenticatedContext('bob').firestore(), anon = env.unauthenticatedContext().firestore();
  const mine = db => doc(db, 'users', 'alice', 'data', 'main');
  await ok(assertSucceeds(setDoc(mine(me), good)), 'le propriétaire écrit son document');
  await ok(assertSucceeds(getDoc(mine(me))), 'le propriétaire le lit');
  await ok(assertFails(getDoc(mine(other))), 'un autre compte ne le lit pas');
  await ok(assertFails(setDoc(mine(other), good)), 'un autre compte ne l\'écrit pas');
  await ok(assertFails(getDoc(mine(anon))), 'sans compte : rien');
  await ok(assertFails(setDoc(mine(me), { ...good, admin: true })), 'champ inconnu refusé');
  await ok(assertFails(setDoc(mine(me), { ...good, at: 'hier' })), 'date qui n\'est pas un nombre refusée');
  await ok(assertFails(setDoc(mine(me), { ...good, coll: [] })), 'collection qui n\'est pas une table refusée');
  await ok(assertFails(setDoc(mine(me), { ...good, v: 2 })), 'version inconnue refusée');
  await ok(assertFails(setDoc(doc(me, 'users', 'alice', 'data', 'autre'), good)), 'autre document du compte refusé');
  await ok(assertFails(setDoc(doc(me, 'shares', 'x'), { a: 1 })), 'tout le reste est fermé');
  await ok(assertFails(deleteDoc(mine(other))), 'un autre compte ne le supprime pas');
  await ok(assertSucceeds(deleteDoc(mine(me))), 'le propriétaire le supprime');

  // Decks de la communauté
  const pd = (db, id = 'alice_d1') => doc(db, 'pubdecks', id);
  const deck = { v: 1, uid: 'alice', author: 'Alice', name: 'Ambre-Améthyste', desc: '', fmt: 'core', inks: [0, 1], cards: { 42: 4, 1: 4 }, at: Date.now(), reports: 0 };
  await ok(assertSucceeds(setDoc(pd(me), deck)), 'pubdecks : l’auteur publie');
  await ok(assertSucceeds(getDoc(pd(anon))), 'pubdecks : lecture publique, même sans compte');
  await ok(assertFails(setDoc(pd(other, 'bob_x'), deck)), 'pubdecks : publier au nom d’un autre (uid) refusé');
  await ok(assertFails(setDoc(pd(anon, 'anon_x'), { ...deck, uid: 'anon' })), 'pubdecks : sans compte, pas de publication');
  await ok(assertFails(setDoc(pd(me, 'alice_d2'), { ...deck, reports: 2 })), 'pubdecks : création avec des signalements refusée');
  await ok(assertFails(setDoc(pd(me, 'alice_d3'), { ...deck, name: 'x'.repeat(61) })), 'pubdecks : nom de plus de 60 caractères refusé');
  await ok(assertFails(setDoc(pd(me, 'alice_d4'), { ...deck, desc: 'x'.repeat(281) })), 'pubdecks : description de plus de 280 caractères refusée');
  await ok(assertFails(setDoc(pd(me, 'alice_d5'), { ...deck, cards: Object.fromEntries(Array.from({ length: 121 }, (_, i) => [i + 1, 1])) })), 'pubdecks : plus de 120 lignes refusé');
  await ok(assertFails(setDoc(pd(me, 'alice_d6'), { ...deck, fmt: 'standard' })), 'pubdecks : format inconnu refusé');
  await ok(assertFails(setDoc(pd(me, 'alice_d7'), { ...deck, admin: 1 })), 'pubdecks : champ inconnu refusé');
  await ok(assertSucceeds(setDoc(pd(me), { ...deck, name: 'Nouveau nom', at: Date.now() })), 'pubdecks : l’auteur met à jour');
  await ok(assertFails(setDoc(pd(other), { ...deck, uid: 'bob' })), 'pubdecks : un autre compte ne le modifie pas');
  await ok(assertFails(updateDoc(pd(other), { reports: increment(1) })), 'signaler sans pubreports : refusé');
  const rep = (db, uid, k = 1) => { const b = writeBatch(db); b.set(doc(db, 'pubreports', 'alice_d1_' + uid), { deck: 'alice_d1', uid, why: 'spam', at: Date.now() }); b.update(pd(db), { reports: increment(k) }); return b.commit(); };
  await ok(assertFails(rep(other, 'bob', 2)), 'signalement à +2 : refusé');
  await ok(assertSucceeds(rep(other, 'bob')), 'signalement (pubreports + reports + 1 dans un lot) : accepté');
  await ok(assertFails(rep(other, 'bob')), 'deuxième signalement du même compte : refusé');
  await ok(assertFails(setDoc(doc(other, 'pubreports', 'alice_d1_carol'), { deck: 'alice_d1', uid: 'carol', why: 'x', at: 1 })), 'pubreports au nom d’un autre : refusé');
  await ok(assertFails(getDoc(doc(me, 'pubreports', 'alice_d1_bob'))), 'pubreports : jamais lisible');
  await ok(assertFails(setDoc(pd(me), { ...deck, reports: 0 })), 'pubdecks : l’auteur ne remet pas les signalements à zéro');
  await ok(assertFails(deleteDoc(pd(other))), 'pubdecks : un autre compte ne le supprime pas');
  await ok(assertSucceeds(deleteDoc(pd(me))), 'pubdecks : l’auteur le retire');
  console.log(`${n} vérifications`);
} finally { await env.cleanup(); }
