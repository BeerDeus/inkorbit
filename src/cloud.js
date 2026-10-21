/* ── cloud.js : compte (Firebase Auth : Google ou e-mail) et synchro (Firestore). Chargé à la demande, jamais bloquant. ──────────────
   Sans compte (ou hors ligne, ou SDK bloqué), l'appli reste entièrement utilisable : les données vivent dans localStorage (data.js › load / save).
   Connecté : un seul document par compte, users/{uid}/data/main = { v, coll, wants, hold, decks, prefs, at, dev } (≈ 40 Ko pour 3 000 lignes,
   loin de la limite de 1 Mo), écouté en temps réel. Une écriture locale (save d'une clé de SYNC_KEYS) le réécrit 2 s plus tard.
   Conflits : document plus récent que la dernière synchro ET modifications locales pas encore envoyées (deux appareils hors ligne, ou premier
   branchement d'un appareil qui avait déjà des cartes) → fusion : quantité la plus haute par ligne, souhaits et cartes gardées réunis, decks par
   identifiant (le plus récent gagne). ponytail: fusion au maximum, une carte retirée sur un appareil revient si l'autre l'avait encore ; journal par ligne si ça gêne. */
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAku2ruPpaR5YQu44gUX0dBKzJ2vhqc91g',
  authDomain: 'ink-orbit.firebaseapp.com',
  projectId: 'ink-orbit',
  storageBucket: 'ink-orbit.firebasestorage.app',
  messagingSenderId: '280205778032',
  appId: '1:280205778032:web:8e684bdca7804d3b77a8b5',
};
const FB_BASE = 'https://www.gstatic.com/firebasejs/13.0.0/';
const SYNC_KEYS = ['coll', 'wants', 'hold', 'decks', 'prefs'];
const SYNC_PREFS = ['cur', 'keep', 'name', 'clang'];      // réglages suivis d'un appareil à l'autre (le thème reste propre à l'appareil)
const CLOUD = { m: null, auth: null, db: null, user: null, state: 'off', unsub: null, t: 0, applying: false, subs: new Set(), wait: null,
  dev: load('dev', '') || (() => { const d = Math.random().toString(36).slice(2, 10); save('dev', d); return d; })() };
/** Synchro : { uid, at (date du document appliqué ou envoyé), dirty (modifications locales à envoyer) }, gardée sur l'appareil. */
const syncMeta = () => load('sync', {});
const setSync = o => save('sync', { ...syncMeta(), ...o });
const cloudEmit = () => { for (const f of CLOUD.subs) { try { f(); } catch (e) { console.error(e); } } };
const onCloud = f => CLOUD.subs.add(f);

/** Charge le SDK (une fois) ; rejette hors ligne ou si gstatic est bloqué. */
function cloudLoad() {
  return CLOUD.wait || (CLOUD.wait = (async () => {
    const [app, auth, fs] = await Promise.all(['app', 'auth', 'firestore'].map(n => import(`${FB_BASE}firebase-${n}.js`)));
    const a = app.initializeApp(FIREBASE_CONFIG);
    CLOUD.m = { auth, fs }; CLOUD.auth = auth.getAuth(a); CLOUD.db = fs.getFirestore(a);
    const emu = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && load('emu', '');      // tests : émulateurs Firebase locaux (tests/sync-e2e.mjs), jamais en ligne
    if (emu) { auth.connectAuthEmulator(CLOUD.auth, `http://${emu}:9099`, { disableWarnings: true }); fs.connectFirestoreEmulator(CLOUD.db, emu, 8080); }
    CLOUD.auth.languageCode = I18N.lang;
    auth.onAuthStateChanged(CLOUD.auth, u => cloudUser(u));
    try { await auth.getRedirectResult(CLOUD.auth); } catch (e) { const m = authMessage(e); if (m) toast(m); }
  })().catch(e => { CLOUD.wait = null; throw e; }));
}
/** Au démarrage : SDK chargé seulement si un compte a déjà été connecté sur cet appareil (personne d'autre ne paie le téléchargement). */
function cloudInit() { if (syncMeta().uid || load('authRedirect', 0)) cloudLoad().catch(() => { CLOUD.state = 'offline'; cloudEmit(); }); }

/* ── Connexion ───────────────────────────────────────────────────────────────────────────────── */
function authMessage(e) {
  const c = (e && e.code) || '';
  const m = {
    'auth/invalid-email': T('Adresse e-mail invalide.'), 'auth/missing-password': T('Saisis ton mot de passe.'),
    'auth/invalid-credential': T('E-mail ou mot de passe incorrect.'), 'auth/wrong-password': T('E-mail ou mot de passe incorrect.'), 'auth/user-not-found': T('E-mail ou mot de passe incorrect.'),
    'auth/email-already-in-use': T('Un compte existe déjà avec cet e-mail : connecte-toi.'), 'auth/weak-password': T('Mot de passe trop court : 6 caractères au moins.'),
    'auth/too-many-requests': T('Trop d\'essais. Réessaie dans quelques minutes.'), 'auth/network-request-failed': T('Pas de connexion. Réessaie une fois en ligne.'),
    'auth/popup-blocked': T('Fenêtre bloquée par le navigateur : autorise-la, ou utilise ton e-mail.'), 'auth/popup-closed-by-user': null, 'auth/cancelled-popup-request': null,
    'auth/unauthorized-domain': T('Ce site n\'est pas autorisé dans Firebase (Authentication › Paramètres › Domaines autorisés).'),
    'auth/requires-recent-login': T('Reconnecte-toi, puis recommence.'), 'auth/user-disabled': T('Ce compte est désactivé.'),
  };
  return c in m ? m[c] : T('Connexion impossible ({code}).', { code: c.replace('auth/', '') || '?' });
}
async function signGoogle() {
  await cloudLoad();
  const { auth } = CLOUD.m, p = new auth.GoogleAuthProvider();
  try { await auth.signInWithPopup(CLOUD.auth, p); }
  catch (e) { if (e && e.code === 'auth/popup-blocked') { save('authRedirect', 1); await auth.signInWithRedirect(CLOUD.auth, p); return; } throw e; }
}
async function signEmail(mode, email, pass) {
  await cloudLoad();
  const { auth } = CLOUD.m;
  if (mode === 'reset') { await auth.sendPasswordResetEmail(CLOUD.auth, email); return; }
  if (mode === 'new') { const r = await auth.createUserWithEmailAndPassword(CLOUD.auth, email, pass); auth.sendEmailVerification(r.user).catch(() => {}); return; }
  await auth.signInWithEmailAndPassword(CLOUD.auth, email, pass);
}
async function signOut() { if (CLOUD.dirtyT) await cloudPush(); if (CLOUD.m) await CLOUD.m.auth.signOut(CLOUD.auth); setSync({ uid: '', at: 0, dirty: false }); }
/** Supprimer le compte : le document de synchro puis le compte ; les données restent sur cet appareil. */
async function deleteAccount() {
  const u = CLOUD.user; if (!u) return;
  const { fs } = CLOUD.m;
  await fs.deleteDoc(fs.doc(CLOUD.db, 'users', u.uid, 'data', 'main'));
  await u.delete();
  setSync({ uid: '', at: 0, dirty: false });
}

/* ── Synchro ─────────────────────────────────────────────────────────────────────────────────── */
function localDoc() {
  const p = load('prefs', {});
  return { v: 1, coll: load('coll', {}), wants: load('wants', {}), hold: load('hold', {}), decks: load('decks', []), prefs: Object.fromEntries(SYNC_PREFS.filter(k => k in p).map(k => [k, p[k]])) };
}
/** Applique un document à l'appareil sans le renvoyer (clés locales, mémoire des modules, écrans). */
function applyDoc(d) {
  CLOUD.applying = true;
  try {
    save('coll', d.coll || {}); save('wants', d.wants || {}); save('hold', d.hold || {}); save('decks', d.decks || []);
    if (d.prefs) save('prefs', { ...load('prefs', {}), ...d.prefs });
    COLL.map = load('coll', {}); COLL.wants = load('wants', {}); COLL.hold = load('hold', {});
    if (typeof DK !== 'undefined') DK.list = null;
    collSave();
    if (typeof dkListPaint === 'function' && curView() === 'decks') dkListPaint();
  } finally { CLOUD.applying = false; }
}
/** Appelée par data.js › save : une clé suivie a changé sur cet appareil. */
function cloudTouch(k) {
  if (!SYNC_KEYS.includes(k) || CLOUD.applying || !syncMeta().uid) return;      // SYNC_KEYS d'abord : save('dev') tourne pendant la création de CLOUD
  if (!syncMeta().dirty) setSync({ dirty: true });
  clearTimeout(CLOUD.dirtyT); CLOUD.dirtyT = setTimeout(() => cloudPush().catch(() => {}), 2000);
}
async function cloudPush() {
  clearTimeout(CLOUD.dirtyT); CLOUD.dirtyT = 0;
  const u = CLOUD.user; if (!u || !CLOUD.m) return;
  const { fs } = CLOUD.m, at = Date.now();
  CLOUD.state = 'saving'; cloudEmit();
  try { await fs.setDoc(fs.doc(CLOUD.db, 'users', u.uid, 'data', 'main'), { ...localDoc(), at, dev: CLOUD.dev }); setSync({ uid: u.uid, at, dirty: false }); CLOUD.state = 'ok'; }
  catch (e) { CLOUD.state = 'error'; console.warn('Synchro :', e && e.code); }
  cloudEmit();
}
/** Document reçu (ouverture de la session, ou changement venu d'un autre appareil). */
async function cloudRemote(d, uid) {
  const s = syncMeta(), local = localDoc();
  if (!d) { await cloudPush(); return; }                                                     // compte neuf : l'appareil l'initialise
  if (d.dev === CLOUD.dev && d.at <= (s.at || 0)) return;                                    // écho de notre propre écriture
  const fresh = s.uid !== uid;                                                                // premier branchement de cet appareil sur ce compte
  if ((fresh || s.dirty) && hasData(local)) {
    const m = mergeDocs(local, d); applyDoc(m); setSync({ uid, at: d.at, dirty: true }); await cloudPush();
    if (fresh) toast(T('Les cartes de cet appareil ont été ajoutées à ton compte.'));
    return;
  }
  if (d.at > (s.at || 0) || fresh) { applyDoc(d); setSync({ uid, at: d.at, dirty: false }); }
  CLOUD.state = 'ok'; cloudEmit();
}
function cloudUser(u) {
  if (CLOUD.unsub) { CLOUD.unsub(); CLOUD.unsub = null; }
  CLOUD.user = u || null; CLOUD.state = u ? 'loading' : 'off'; save('authRedirect', 0); cloudEmit();
  if (!u) return;
  const { fs } = CLOUD.m;
  CLOUD.unsub = fs.onSnapshot(fs.doc(CLOUD.db, 'users', u.uid, 'data', 'main'),
    snap => { if (!snap.metadata.hasPendingWrites) cloudRemote(snap.exists() ? snap.data() : null, u.uid).catch(e => console.warn(e)); },
    e => { CLOUD.state = 'error'; cloudEmit(); console.warn('Synchro :', e && e.code); });
}
window.addEventListener('online', () => { if (syncMeta().dirty && CLOUD.user) cloudPush().catch(() => {}); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && CLOUD.dirtyT) cloudPush().catch(() => {}); });

/* ── Interface : bloc « Compte » des Réglages, feuille de connexion ─────────────────────────────── */
function cloudAccountHtml() {
  const u = CLOUD.user, st = { loading: T('Synchronisation…'), saving: T('Enregistrement…'), ok: T('Synchronisé'), error: T('Synchro en échec : réessai au prochain changement'), offline: T('Hors ligne') }[CLOUD.state] || '';
  if (!u) return `<div class="acct"><div class="acct-main"><b>${esc(T('Compte'))}</b><span class="muted small">${esc(T('Retrouve ta collection et tes decks sur tous tes appareils.'))}</span></div><button type="button" class="btn btn-primary" data-act="signin">${esc(T('Se connecter'))}</button></div>`;
  return `<div class="acct"><div class="acct-main"><b>${esc(u.displayName || u.email || T('Mon compte'))}</b><span class="muted small">${esc(u.email || '')}${st ? ' · ' + esc(st) : ''}</span></div><button type="button" class="btn" data-act="account">${esc(T('Gérer'))}</button></div>`;
}
onAct('signin', openSignIn);
onAct('account', openAccount);
function openSignIn() {
  let mode = 'in';
  const el = openSheet({ title: T('Se connecter'), cls: 'signin-sheet', html: `
    <button type="button" class="btn btn-block btn-google" data-google><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" stroke="none" d="M21.6 12.2c0-.7-.1-1.3-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3zM12 22c2.7 0 5-.9 6.6-2.5l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22zM6.4 13.9a6 6 0 0 1 0-3.8V7.5H3.1a10 10 0 0 0 0 9zM12 6c1.5 0 2.8.5 3.8 1.5l2.8-2.8A10 10 0 0 0 3.1 7.5l3.3 2.6C7.2 7.8 9.4 6 12 6z"/></svg>${esc(T('Continuer avec Google'))}</button>
    <div class="da-rule"><span>${esc(T('ou'))}</span></div>
    <form class="signin-form" novalidate>
      <div class="field"><label for="siMail">${esc(T('E-mail'))}</label><input id="siMail" class="input" type="email" autocomplete="email" required></div>
      <div class="field" data-passf><label for="siPass">${esc(T('Mot de passe'))}</label><input id="siPass" class="input" type="password" autocomplete="current-password" minlength="6" required></div>
      <p class="bad small" data-err role="alert"></p>
      <button type="submit" class="btn btn-primary btn-block" data-go>${esc(T('Se connecter'))}</button>
      <div class="btn-row signin-alt"><button type="button" class="btn btn-ghost" data-mode="new">${esc(T('Créer un compte'))}</button><button type="button" class="btn btn-ghost" data-mode="reset">${esc(T('Mot de passe oublié'))}</button></div>
    </form>
    <p class="muted small">${esc(T('Ton compte sert seulement à synchroniser tes données entre tes appareils. Rien n\'est partagé ni revendu.'))}</p>` });
  const err = $('[data-err]', el), go = $('[data-go]', el);
  const paintMode = () => {
    go.textContent = { in: T('Se connecter'), new: T('Créer mon compte'), reset: T('Envoyer le lien') }[mode];
    $('[data-passf]', el).hidden = mode === 'reset';
    $('#siPass', el).autocomplete = mode === 'new' ? 'new-password' : 'current-password';
    $('.signin-alt', el).innerHTML = (mode === 'in' ? [['new', T('Créer un compte')], ['reset', T('Mot de passe oublié')]] : [['in', T('J\'ai déjà un compte')]]).map(([k, l]) => `<button type="button" class="btn btn-ghost" data-mode="${k}">${esc(l)}</button>`).join('');
  };
  const fail = e => { const m = authMessage(e); err.textContent = m || ''; go.disabled = false; };
  el.addEventListener('click', e => {
    const m = e.target.closest('[data-mode]'); if (m) { mode = m.dataset.mode; err.textContent = ''; paintMode(); return; }
    if (e.target.closest('[data-google]')) { err.textContent = ''; signGoogle().then(() => { if (CLOUD.user) el.close(); }, fail); }
  });
  $('form', el).addEventListener('submit', async e => {
    e.preventDefault(); err.textContent = ''; go.disabled = true;
    try {
      await signEmail(mode, $('#siMail', el).value.trim(), $('#siPass', el).value);
      if (mode === 'reset') { toast(T('Lien envoyé : regarde tes e-mails.')); mode = 'in'; paintMode(); go.disabled = false; return; }
      el.close(); toast(mode === 'new' ? T('Compte créé. Un e-mail de confirmation t\'a été envoyé.') : T('Connecté'));
    } catch (x) { fail(x); }
  });
  const off = () => { if (CLOUD.user && el.isConnected) el.close(); };
  CLOUD.subs.add(off);
  const close = el.close; el.close = () => { CLOUD.subs.delete(off); close(); };
}
function openAccount() {
  const u = CLOUD.user; if (!u) { openSignIn(); return; }
  const el = openSheet({ title: T('Mon compte'), html: `<p><b>${esc(u.displayName || '')}</b> ${esc(u.email || '')}</p>
    ${u.email && !u.emailVerified && u.providerData.some(p => p.providerId === 'password') ? `<p class="muted small">${esc(T('Adresse pas encore confirmée.'))} <button type="button" class="link" data-a="verify">${esc(T('Renvoyer l\'e-mail'))}</button></p>` : ''}
    <div class="list">
      <button type="button" class="row" data-a="sync"><svg class="i"><use href="#i-refresh"/></svg><span class="row-main"><span class="row-title">${esc(T('Synchroniser maintenant'))}</span></span></button>
      <button type="button" class="row" data-a="out"><svg class="i"><use href="#i-back"/></svg><span class="row-main"><span class="row-title">${esc(T('Se déconnecter'))}</span><span class="row-sub">${esc(T('Tes cartes restent aussi sur cet appareil'))}</span></span></button>
      <button type="button" class="row" data-a="del"><svg class="i"><use href="#i-trash"/></svg><span class="row-main"><span class="row-title bad">${esc(T('Supprimer mon compte'))}</span><span class="row-sub">${esc(T('Efface le compte et sa copie en ligne'))}</span></span></button>
    </div>` });
  el.addEventListener('click', async e => {
    const a = e.target.closest('[data-a]'); if (!a) return;
    try {
      if (a.dataset.a === 'sync') { await cloudPush(); toast(T('Synchronisé')); }
      else if (a.dataset.a === 'verify') { await CLOUD.m.auth.sendEmailVerification(u); toast(T('E-mail envoyé')); }
      else if (a.dataset.a === 'out') { await signOut(); el.close(); toast(T('Déconnecté')); }
      else if (a.dataset.a === 'del' && confirm(T('Supprimer définitivement ton compte et sa copie en ligne ? Les données de cet appareil sont gardées.'))) { await deleteAccount(); el.close(); toast(T('Compte supprimé')); }
    } catch (x) { const m = authMessage(x); if (m) toast(m); }
  });
}
