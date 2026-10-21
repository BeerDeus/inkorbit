// Règles Firestore (firestore.rules) contre l'émulateur : le propriétaire lit et écrit son document de synchro, personne d'autre ; champs et types contrôlés.
// Lancer : firebase emulators:exec --only firestore "node tests/rules-test.mjs" (FIRESTORE_EMULATOR_HOST posé par l'émulateur ; sans lui, le test s'ignore).
// RULES_DEPS : dossier node_modules où sont @firebase/rules-unit-testing et firebase (défaut : tests/node_modules).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const host = process.env.FIRESTORE_EMULATOR_HOST;
if (!host) { console.log('ignoré : pas d\'émulateur Firestore (FIRESTORE_EMULATOR_HOST)'); process.exit(0); }
const req = createRequire(process.env.RULES_DEPS ? process.env.RULES_DEPS + '/' : import.meta.url);
const { initializeTestEnvironment, assertSucceeds, assertFails } = req('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, deleteDoc } = req('firebase/firestore');

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
  console.log(`${n} vérifications`);
} finally { await env.cleanup(); }
