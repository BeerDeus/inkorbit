/* ── onboard.js : premier lancement (modèle : Mana Orbit) ─────────────────────────────────────────────────────────────────
   Trois écrans, une seule fois, seulement sur un appareil vierge (ni collection, ni deck) et jamais quand l'appli s'ouvre sur un lien (?p=, partage reçu) :
   1. Bienvenue (langue, ce que fait l'appli, mention de fan non officielle) · 2. Ajouter ses cartes (scanner, une par une, importer) · 3. Compte facultatif.
   Passé, terminé ou quitté : plus jamais (inkorbit:onboard). Navigateurs pilotés par les tests : seulement avec ?onboarding. */
const OB = { el: null, i: 0 };
function obMaybe() {
  if (OB.el || load('onboard', 0)) return;
  if (Object.keys(COLL.map).length || load('decks', []).length) { save('onboard', Date.now()); return; }      // appareil déjà utilisé
  if (/[?&](p|url|text|open)=/.test(location.search)) return;                                               // ouvert sur un lien : il passe d'abord
  if (navigator.webdriver && !/[?&]onboarding\b/.test(location.search)) return;                             // tests automatisés : l'accueil masquerait l'appli
  obOpen();
}
function obOpen() {
  const lang = i18nLangs().map(([c, n]) => `<button type="button" class="chip" data-ob="lang:${c}" aria-pressed="${c === I18N.lang}">${esc(n)}</button>`).join('');
  const opt = (k, icon, t, s) => `<button type="button" class="ob-opt" data-ob="${k}"><svg class="i"><use href="#${icon}"/></svg><span><b>${esc(t)}</b><small>${esc(s)}</small></span></button>`;
  const el = OB.el = openScreen({ title: T('Bienvenue'), cls: 'ob', onClose: obDone, html: `<div class="ob-track">
    <section class="ob-s" aria-label="${esc(T('Bienvenue'))}">
      <div class="chips ob-lang" role="group" aria-label="${esc(T('Langue de l\'appli'))}">${lang}</div>
      <svg class="ob-logo" aria-hidden="true"><use href="#i-logo"/></svg>
      <h1 class="da-title">${esc(T('Bienvenue dans Ink Orbit'))}</h1>
      <p class="ob-lead">${esc(T('Ta collection Lorcana en orbite : ce que tu as, ce qu\'elle vaut, ce qu\'il te manque.'))}</p>
      <ul class="ob-pts"><li><svg class="ink-sym" data-ink="amber"><use href="#ink-amber"/></svg><span>${esc(T('Scanne ou importe tes cartes, suis leur valeur jour après jour.'))}</span></li>
        <li><svg class="ink-sym" data-ink="sapphire"><use href="#ink-sapphire"/></svg><span>${esc(T('Construis tes decks et vois ce qu\'il te manque.'))}</span></li>
        <li><svg class="ink-sym" data-ink="emerald"><use href="#ink-emerald"/></svg><span>${esc(T('Partage ta liste d\'échange par un QR code.'))}</span></li></ul>
      <p class="ob-fan muted small">${esc(T('Appli de fan gratuite et non officielle, non affiliée à Disney ni à Ravensburger.'))}</p>
      <button type="button" class="btn btn-primary btn-block" data-ob="next">${esc(T('Commencer'))}</button>
    </section>
    <section class="ob-s" aria-label="${esc(T('Ajoute tes cartes'))}">
      <h2 class="da-title">${esc(T('Ajoute tes cartes'))}</h2>
      <p class="ob-lead">${esc(T('Choisis comment commencer. Tu pourras toujours le faire plus tard.'))}</p>
      <div class="ob-opts">${opt('scan', 'i-scan', T('Scanner mes cartes'), T('L\'appareil photo lit la ligne du bas de la carte.'))}${opt('add', 'i-plus', T('Les ajouter une par une'), T('Recherche par nom, en français ou en anglais.'))}${opt('import', 'i-upload', T('Importer un fichier'), T('CSV de Dreamborn, TCGplayer ou d\'un tableur.'))}</div>
      <button type="button" class="btn btn-ghost btn-block" data-ob="next">${esc(T('Plus tard'))}</button>
    </section>
    <section class="ob-s" aria-label="${esc(T('Sur tous tes appareils'))}">
      <h2 class="da-title">${esc(T('Sur tous tes appareils'))}</h2>
      <p class="ob-lead">${esc(T('Sans compte, tout reste sur ce téléphone. Avec un compte (facultatif), ta collection et tes decks te suivent partout.'))}</p>
      <div class="ob-opts">${opt('signin', 'i-star', T('Créer un compte ou me connecter'), T('Google ou e-mail, gratuit.'))}</div>
      <button type="button" class="btn btn-primary btn-block" data-ob="done">${esc(T('C\'est parti'))}</button>
    </section></div>
    <div class="ob-foot"><div class="ob-dots" aria-hidden="true"><i></i><i></i><i></i></div><button type="button" class="btn btn-ghost" data-ob="done">${esc(T('Passer'))}</button></div>` });
  obGo(0);
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-ob]'); if (!b) return;
    const a = b.dataset.ob;
    if (a === 'next') { obGo(OB.i + 1); return; }
    if (a.startsWith('lang:')) { try { localStorage.setItem('inkorbit:lang', a.slice(5)); } catch (x) { /* ignore */ } location.reload(); return; }      // pas encore « vu » : l'accueil revient dans la langue choisie
    el.close();
    if (a === 'scan') showView('scan');
    else if (a === 'add') dataLoad().then(openAddCards, () => {});
    else if (a === 'import') { showView('coll'); openImport(); }
    else if (a === 'signin' && typeof openSignIn === 'function') openSignIn();
  });
}
function obGo(i) {
  const el = OB.el; OB.i = Math.min(2, i);
  $$('.ob-s', el).forEach((s, k) => { s.classList.toggle('on', k === OB.i); s.inert = k !== OB.i; });
  $$('.ob-dots i', el).forEach((d, k) => d.classList.toggle('on', k === OB.i));
  const f = $('.ob-s.on .btn, .ob-s.on .ob-opt', el); if (f) f.focus({ preventScroll: true });
}
function obDone() { save('onboard', Date.now()); OB.el = null; }
window.addEventListener('load', () => setTimeout(obMaybe, 350));
