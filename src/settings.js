/* ── settings.js : Réglages (langues, devise, thème, sauvegarde, installation) et À propos ───────────────────────────────────
   Thème : « Nuit » par défaut ; « Parchemin » (clair) ; « Auto » suit le téléphone. Sauvegarde : un fichier JSON avec tout ce que l'appli garde
   (collection, recherches, cartes gardées, decks, réglages, historique de valeur, compteur de lore, carte mystère) : seul moyen de changer d'appareil tant qu'il n'y a pas de comptes. */
const BACKUP_KEYS = ['coll', 'wants', 'hold', 'decks', 'prefs', 'valhist', 'lore', 'mystery', 'scanlot', 'tradeMode'];
function themeApply() {
  const t = prefs().theme, light = t === 'light' || (t === 'auto' && matchMedia('(prefers-color-scheme: light)').matches);
  document.documentElement.dataset.theme = light ? 'light' : 'dark';
  const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = light ? '#f4ecdc' : '#140f2e';
}
themeApply();
try { matchMedia('(prefers-color-scheme: light)').addEventListener('change', themeApply); } catch (e) { /* ignore */ }

onAct('settings', openSettings);
onAct('about', openAbout);
function openSettings() {
  const p = prefs(), seg = (k, opts) => `<div class="seg" role="group" data-pref="${k}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${String(p[k]) === String(v)}">${esc(l)}</button>`).join('')}</div>`;
  const inst = typeof PWA !== 'undefined' ? PWA.state() : 'manual';
  const el = openSheet({ title: T('Réglages'), cls: 'settings-sheet', html: `<div class="acct-host">${cloudAccountHtml()}</div>${typeof prgRowHtml === 'function' ? `<div class="list">${prgRowHtml()}</div>` : ''}
    <div class="field"><span class="label">${esc(T('Langue de l\'appli'))}</span><select class="select" data-ui>${i18nLangs().map(([c, n]) => `<option value="${c}"${c === I18N.lang ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
    <div class="field"><span class="label">${esc(T('Langue des cartes'))}</span><select class="select" data-clang>${IO_LANGS.map(l => `<option value="${l}"${l === p.clang ? ' selected' : ''}>${esc(I18N_LANGS[l])}</option>`).join('')}</select><span class="muted small">${esc(T('Noms et recherche. Les images restent en anglais.'))}</span></div>
    <div class="field"><span class="label">${esc(T('Devise des prix'))}</span>${seg('cur', [['EUR', T('Euro (Cardmarket)')], ['USD', T('Dollar (TCGplayer)')]])}</div>
    <div class="field"><span class="label">${esc(T('Thème'))}</span>${seg('theme', [['', T('Nuit')], ['light', T('Parchemin')], ['auto', T('Auto')]])}</div>
    <div class="da-rule"><span>${esc(T('Sauvegarde'))}</span></div>
    <p class="muted small">${esc(T('Tes données restent sur cet appareil. Exporte une sauvegarde pour les retrouver sur un autre téléphone ou après avoir vidé le navigateur.'))}</p>
    <div class="btn-row"><button type="button" class="btn" data-backup><svg class="i"><use href="#i-download"/></svg>${esc(T('Exporter'))}</button><label class="btn"><svg class="i"><use href="#i-upload"/></svg>${esc(T('Restaurer'))}<input type="file" accept=".json,application/json" data-restore hidden></label></div>
    <label class="switch"><input type="checkbox" data-warm${p.warm === false ? '' : ' checked'}><span>${esc(T('Précharger les images en Wi-Fi'))}<br><small class="muted">${esc(T('Les vignettes de ta collection restent visibles hors ligne.'))}</small></span></label>
    ${inst === 'ready' || inst === 'ios' ? `<div class="da-rule"><span>${esc(T('Appli'))}</span></div><button type="button" class="btn btn-primary" data-install>${esc(T('Installer Ink Orbit'))}</button>${inst === 'ios' ? `<p class="muted small">${esc(T('Sur iPhone : bouton Partager, puis « Sur l\'écran d\'accueil ».'))}</p>` : ''}` : ''}
    <div class="list"><button type="button" class="row" data-act="about"><svg class="i"><use href="#i-info"/></svg><span class="row-main"><span class="row-title">${esc(T('À propos et mentions'))}</span><span class="row-sub">${esc(T('Version {v}', { v: typeof IO_BUILD !== 'undefined' ? IO_BUILD : 'dev' }))}</span></span><svg class="i"><use href="#i-chev"/></svg></button></div>` });
  const repaint = () => { const h = $('.acct-host', el); if (h) h.innerHTML = cloudAccountHtml(); };
  CLOUD.subs.add(repaint);
  const close = el.close; el.close = () => { CLOUD.subs.delete(repaint); close(); };
  el.addEventListener('click', async e => {
    const b = e.target.closest('[data-pref] [data-v]');
    if (b) { const k = b.closest('[data-pref]').dataset.pref; setPref(k, b.dataset.v); $$('[data-v]', b.parentElement).forEach(x => x.setAttribute('aria-pressed', x === b)); if (k === 'theme') themeApply(); else collSave(); return; }
    if (e.target.closest('[data-backup]')) downloadText(`ink-orbit-sauvegarde-${dayKey()}.json`, JSON.stringify({ app: 'ink-orbit', v: 1, at: new Date().toISOString(), data: Object.fromEntries(BACKUP_KEYS.map(k => [k, load(k, null)]).filter(([, v]) => v != null)) }), 'application/json');
    if (e.target.closest('[data-install]')) PWA.install();
  });
  el.addEventListener('change', async e => {
    if (e.target.matches('[data-warm]')) { setPref('warm', e.target.checked); return; }
    if (e.target.matches('[data-ui]')) { try { localStorage.setItem('inkorbit:lang', e.target.value); } catch (err) { /* ignore */ } location.reload(); }
    if (e.target.matches('[data-clang]')) { setPref('clang', e.target.value); location.reload(); }
    if (e.target.matches('[data-restore]')) {
      const f = e.target.files[0]; if (!f) return;
      try {
        const j = JSON.parse(await f.text()); if (j.app !== 'ink-orbit' || !j.data) throw new Error('format');
        if (!(await askSheet({ title: T('Restaurer la sauvegarde ?'), text: T('Remplacer les données de cet appareil par cette sauvegarde du {d} ?', { d: new Date(j.at).toLocaleDateString(LOC()) }), ok: T('Restaurer'), danger: true }))) return;
        for (const k of BACKUP_KEYS) if (k in j.data) save(k, j.data[k]);
        location.reload();
      } catch (err) { toast(T('Ce fichier n\'est pas une sauvegarde Ink Orbit.')); }
    }
  });
}
function openAbout() {
  openSheet({ title: T('À propos'), cls: 'about-sheet', html: `
    <div class="about-logo"><svg class="about-mark" aria-hidden="true"><use href="#i-logo"/></svg></div>
    <p>${esc(T('Ink Orbit range ta collection de cartes Disney Lorcana, suit sa valeur, prépare tes échanges et tes decks.'))}</p>
    <div class="panel about-legal"><p>${esc(T('Ink Orbit est une application de fan gratuite et non officielle. Elle utilise des marques et des droits d\'auteur associés à Disney Lorcana TCG, dans le cadre de la Community Code Policy de Ravensburger. Il nous est expressément interdit de vous faire payer l\'accès à ce contenu. Ink Orbit n\'est ni publiée, ni approuvée, ni soutenue par Disney ou Ravensburger. Disney Lorcana © Disney ; jeu édité par Ravensburger.'))}</p></div>
    <div class="da-rule"><span>${esc(T('Crédits'))}</span></div>
    <ul class="about-credits">
      <li>${esc(T('Données des cartes'))} : <a href="https://lorcanajson.org/" target="_blank" rel="noopener">LorcanaJSON</a>${CARDS.v ? ` <span class="muted small">(${esc(CARDS.v.slice(0, 10))})</span>` : ''}</li>
      <li>${esc(T('Images des cartes'))} : <a href="https://lorcast.com/" target="_blank" rel="noopener">Lorcast</a></li>
      <li>${esc(T('Prix'))} : <a href="https://www.cardmarket.com/" target="_blank" rel="noopener">Cardmarket</a> (€), <a href="https://www.tcgplayer.com/" target="_blank" rel="noopener">TCGplayer</a> via <a href="https://tcgcsv.com/" target="_blank" rel="noopener">tcgcsv</a> ($)${PRICES.v ? ` <span class="muted small">(${esc(PRICES.v)})</span>` : ''}</li>
      <li>${esc(T('Polices'))} : Fraunces, Nunito Sans (SIL Open Font License)</li>
    </ul>
    <p class="btn-row"><a class="btn" href="legal.html">${esc(T('Mentions légales'))}</a><a class="btn" href="privacy.html">${esc(T('Confidentialité'))}</a></p>
    <p class="muted small">${esc(T('Version {v}', { v: typeof IO_BUILD !== 'undefined' ? IO_BUILD : 'dev' }))}</p>` });
}
