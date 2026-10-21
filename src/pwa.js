/* ── pwa.js : installation de l'appli et service worker (modèle : Mana Orbit) ──────────────────────────────────────────────
   Chrome / Edge / Android : « beforeinstallprompt » est gardé, PWA.install() ouvre la vraie fenêtre d'installation.
   iPhone / iPad : seulement « Sur l'écran d'accueil » (rien à déclencher) → état 'ios', l'appli explique le geste.
   sw.js : enregistré seulement en http(s) et s'il existe vraiment (aperçu, fichier local : l'appli marche sans).
   Nouvelle version : le service worker dit quelle page il garde (message « io-shell ») ; différente de celle qui tourne (IO_BUILD) → toast « Recharger ». */
const PWA = (() => {
  let deferred = null, installed = false;
  const subs = new Set();
  const mq = q => { try { return matchMedia(q).matches; } catch (e) { return false; } };
  const standalone = () => mq('(display-mode: standalone)') || mq('(display-mode: minimal-ui)') || navigator.standalone === true;
  const ios = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const emit = () => subs.forEach(f => { try { f(); } catch (e) { /* ignore */ } });
  /** standalone : déjà ouverte comme une appli · installed : installée à l'instant · ready : installation possible · ios · manual : menu du navigateur */
  const state = () => standalone() ? 'standalone' : installed ? 'installed' : deferred ? 'ready' : ios() ? 'ios' : 'manual';
  async function install() {
    if (!deferred) return 'none';
    const d = deferred; deferred = null; emit();             // l'événement ne sert qu'une fois
    try { await d.prompt(); const r = await d.userChoice; return (r && r.outcome) || 'dismissed'; } catch (e) { return 'error'; }
  }
  const on = f => { subs.add(f); return () => subs.delete(f); };

  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; emit(); });
  window.addEventListener('appinstalled', () => { installed = true; deferred = null; emit(); toast(T('Ink Orbit est installée')); });
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    let told = false;
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
        await navigator.serviceWorker.register('sw.js', { scope: './' });
        const c = navigator.serviceWorker.controller; if (c) c.postMessage({ type: 'io-shell?' });
      } catch (e) { /* jamais gênant : l'appli marche sans service worker */ }
    };
    if (document.readyState === 'complete') go(); else window.addEventListener('load', go);
  }
  return { state, install, on, standalone, ios };
})();
