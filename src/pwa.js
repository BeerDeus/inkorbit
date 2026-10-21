/* ── pwa.js : appli installée (modèle : Mana Orbit) : installation, service worker, hors ligne, lancement, partages reçus ─────────────────
   · Installation : Chrome / Edge / Android gardent « beforeinstallprompt » (PWA.install() ouvre la vraie fenêtre) ; iPhone / iPad : seulement
     « Sur l'écran d'accueil » → PWA.guide() montre le geste. Invitation (pwaInvite) une seule fois, après une action utile (5 cartes dans la
     collection), jamais au premier écran ; refusée (ou ✕ de l'accueil, même clé installX) : plus rien pendant 30 jours.
   · sw.js : enregistré seulement en http(s) et s'il existe vraiment. Nouvelle version : le service worker dit quelle page il garde (« io-shell ») ;
     différente de celle qui tourne (IO_BUILD) → toast « Recharger », une fois. Revérifiée au retour sur l'appli après une heure.
   · Hors ligne : bandeau discret (#offline) ; stockage « persistant » demandé dès qu'il y a une collection (le navigateur ne l'efface plus de lui-même).
   · Préchargement : une fois par semaine, en Wi-Fi seulement (navigator.connection), les petites images de la collection (prefs().warm !== false).
   · Écran de lancement (#splash, posé par build.mjs, seulement appli installée) : retiré dès que le catalogue est prêt, 600 ms au plus.
   · Raccourcis de l'icône (?open=add, ?open=lore) et partages reçus (manifest › share_target : ?url=…&text=… ; file_handlers : CSV). */
const PWA = (() => {
  let deferred = null, installed = false, reg = null, told = false;
  const subs = new Set();
  const mq = q => { try { return matchMedia(q).matches; } catch (e) { return false; } };
  const standalone = () => mq('(display-mode: standalone)') || mq('(display-mode: minimal-ui)') || mq('(display-mode: window-controls-overlay)') || navigator.standalone === true;
  const ios = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const emit = () => subs.forEach(f => { try { f(); } catch (e) { /* ignore */ } });
  /** standalone : déjà ouverte comme une appli · installed : installée à l'instant · ready : installation possible · ios · manual : menu du navigateur */
  const state = () => standalone() ? 'standalone' : installed ? 'installed' : deferred ? 'ready' : ios() ? 'ios' : 'manual';
  async function install() {
    if (!deferred) { if (ios()) guide(); return 'none'; }
    const d = deferred; deferred = null; emit();             // l'événement ne sert qu'une fois
    try { await d.prompt(); const r = await d.userChoice; return (r && r.outcome) || 'dismissed'; } catch (e) { return 'error'; }
  }
  const on = f => { subs.add(f); return () => subs.delete(f); };
  const snoozed = () => { const t = load('installX', 0); return !!t && Date.now() - t < 30 * 864e5; };

  /** iPhone : le geste en trois images (icône Partager de Safari, « Sur l'écran d'accueil », Ajouter). */
  function guide() {
    const step = (n, svg, t) => `<li class="pw-step"><span class="pw-n">${n}</span><span class="pw-ic" aria-hidden="true">${svg}</span><span>${t}</span></li>`;
    openSheet({ title: T('Installer sur iPhone'), cls: 'pw-guide', html: `<ol class="pw-steps">
      ${step(1, '<svg viewBox="0 0 24 24"><path d="M12 15V3.5M7.5 8 12 3.5 16.5 8M8 11H6.5A1.5 1.5 0 0 0 5 12.5v7A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-7a1.5 1.5 0 0 0-1.5-1.5H16"/></svg>', esc(T('Dans Safari, touche le bouton Partager, en bas de l\'écran.')))}
      ${step(2, '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8.5v7M8.5 12h7"/></svg>', esc(T('Choisis « Sur l\'écran d\'accueil » (fais défiler la liste si besoin).')))}
      ${step(3, '<svg class="pw-logo"><use href="#i-mark"/></svg>', esc(T('Touche « Ajouter » : Ink Orbit s\'ouvre ensuite comme une appli, même hors ligne.')))}</ol>` });
  }
  /** Invitation à installer, une fois, au bon moment (appelée quand la collection change). */
  function invite() {
    if (load('installAsked', 0) || snoozed() || !['ready', 'ios'].includes(state()) || (typeof UI !== 'undefined' && UI.stack.length)) return;
    let n = 0; for (const q of Object.values(COLL.map)) n += q;
    if (n < 5) return;
    save('installAsked', Date.now());
    const el = openSheet({ title: T('Garde Ink Orbit sous la main'), cls: 'pw-invite', html: `<div class="pw-hero"><svg class="pw-hero-logo" aria-hidden="true"><use href="#i-logo"/></svg></div>
      <ul class="pw-pts"><li>${esc(T('S\'ouvre d\'un toucher, comme une appli'))}</li><li>${esc(T('Marche hors ligne : ta collection, tes decks, le compteur de lore'))}</li><li>${esc(T('Gratuit, sans publicité, sans compte obligatoire'))}</li></ul>
      <div class="btn-row"><button type="button" class="btn btn-primary" data-pw="go">${esc(state() === 'ios' ? T('Voir comment') : T('Installer'))}</button><button type="button" class="btn btn-ghost" data-pw="later">${esc(T('Plus tard'))}</button></div>` });
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-pw]'); if (!b) return;
      el.close();
      if (b.dataset.pw === 'go') install(); else save('installX', Date.now());
    });
  }

  /* ── Service worker ── */
  async function check() { try { if (reg) await reg.update(); const c = navigator.serviceWorker.controller; if (c) c.postMessage({ type: 'io-shell?' }); } catch (e) { /* hors ligne */ } }
  function swInit() {
    if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
    navigator.serviceWorker.addEventListener('message', e => {
      const b = e.data && e.data.type === 'io-shell' && e.data.build;
      if (!b || b === IO_BUILD || told) return;
      told = true;
      toast(T('Nouvelle version d\'Ink Orbit'), { action: T('Recharger'), onAction: () => location.reload(), ms: 12000 });
    });
    const go = async () => {
      try {
        const r = await fetch('sw.js', { method: 'HEAD', cache: 'no-store' });
        if (!r.ok || !/javascript|ecmascript/i.test(r.headers.get('content-type') || '')) return;
        reg = await navigator.serviceWorker.register('sw.js', { scope: './' });
        check();
      } catch (e) { /* jamais gênant : l'appli marche sans service worker */ }
    };
    if (document.readyState === 'complete') go(); else window.addEventListener('load', go);
    let hidden = 0;
    document.addEventListener('visibilitychange', () => { if (document.hidden) hidden = Date.now(); else if (hidden && Date.now() - hidden > 36e5) check(); });
  }

  /* ── Hors ligne, stockage, préchargement ── */
  function netPaint() {
    let el = document.getElementById('offline');
    if (navigator.onLine) { if (el) el.hidden = true; return; }
    if (!el) { el = document.createElement('div'); el.id = 'offline'; el.className = 'pw-offline'; el.setAttribute('role', 'status'); el.innerHTML = `<svg class="i"><use href="#i-offline"/></svg><span>${esc(T('Hors ligne'))}</span>`; document.body.appendChild(el); }
    el.hidden = false;
  }
  function persist() { try { if (Object.keys(COLL.map).length && navigator.storage && navigator.storage.persist) navigator.storage.persisted().then(p => p || navigator.storage.persist()); } catch (e) { /* ignore */ } }
  /** Petites images de la collection vers le cache du service worker : Wi-Fi seulement, une fois par semaine, 120 au plus (le cache du service worker en garde 200). */
  function warm() {
    const c = navigator.connection, ctl = navigator.serviceWorker && navigator.serviceWorker.controller;
    if (!ctl || !c || c.type !== 'wifi' || c.saveData || prefs().warm === false || Date.now() - load('warmAt', 0) < 7 * 864e5 || !CARDS.ready) return;
    const urls = [...collById(COLL.map).keys()].slice(0, 120).map(id => cardImg(CARDS.byId.get(id), 'small')).filter(Boolean);
    if (!urls.length) return;
    save('warmAt', Date.now());
    ctl.postMessage({ type: 'io-warm', urls });
  }

  /* ── Lancement : écran de lancement, raccourcis, partages reçus ── */
  function splashOff() { const s = document.getElementById('splash'); if (!s || s.classList.contains('out')) return; s.classList.add('out'); setTimeout(() => s.remove(), 300); }
  /** ?open=add|lore (raccourcis de l'icône), ?url= / ?text= / ?title= (partage vers l'appli), file_handlers (CSV ouvert avec Ink Orbit). */
  async function launch() {
    let q; try { q = new URLSearchParams(location.search); } catch (e) { return; }
    const open = q.get('open'), shared = [q.get('url'), q.get('text'), q.get('title')].filter(Boolean).join('\n').trim();
    if (open || shared) try { history.replaceState(history.state, '', location.pathname); } catch (e) { /* ignore */ }
    if (open === 'add' && typeof openAddCards === 'function') { await dataLoad().catch(() => {}); openAddCards(); }
    else if (open === 'lore' && typeof openLore === 'function') openLore();
    if (shared) receive(shared);
    if ('launchQueue' in window) window.launchQueue.setConsumer(async p => { const f = p.files && p.files[0]; if (f) { const file = await f.getFile(); fillImport(await file.text()); } });
  }
  /** Texte partagé : un lien d'échange (?p=) → la liste ; plusieurs lignes « 4 Nom » → import de deck ; sinon → recherche de la carte. */
  function receive(s) {
    const p = /[?&]p=([\w-]+)/.exec(s);
    if (p && typeof openPublicTrade === 'function') { openPublicTrade(p[1]); return; }
    const lines = s.split(/\r?\n/).filter(l => /^\s*\d{1,2}\s*x?\s+\S/.test(l));
    if (lines.length >= 3 && typeof dkImportSheet === 'function') { showView('decks'); dkImportSheet(); const t = document.getElementById('dkImpText'); if (t) t.value = s; return; }
    if (typeof pickCard === 'function') pickCard({ title: T('Chercher une carte'), q: s.slice(0, 60), onPick: c => openCard(c.id) });
  }
  function fillImport(text) {
    if (typeof openImport !== 'function') return;
    showView('coll'); openImport();
    const t = document.querySelector('.sheet [data-text]'); if (t) t.value = text;
  }

  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; emit(); });
  window.addEventListener('appinstalled', () => { installed = true; deferred = null; emit(); toast(T('Ink Orbit est installée')); });
  window.addEventListener('online', netPaint); window.addEventListener('offline', netPaint);
  swInit();
  setTimeout(splashOff, 600);
  document.addEventListener('io:data', () => { splashOff(); persist(); setTimeout(warm, 8000); });
  onColl(() => { persist(); setTimeout(invite, 1500); });
  window.addEventListener('load', () => { netPaint(); launch(); });
  return { state, install, on, standalone, ios, guide };
})();
