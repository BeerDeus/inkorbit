/* Ink Orbit — service worker (modèle : celui de Mana Orbit, simplifié : pas de serveur, pas de notifications).
   • Page : copie locale tout de suite (l'appli s'ouvre hors ligne), rafraîchie en arrière-plan ; version gardée différente de celle qui tourne
     (IO_BUILD) → message « io-shell » à la page, qui propose « Recharger ». Lien de partage (?p=) ou copie de plus de 7 jours : réseau d'abord.
   • Catalogue et prix (data/*.json) : réseau d'abord, 4 s au plus (réseau lent : la copie d'hier tout de suite), copie si hors ligne.
     Gardés dès le premier lancement (install : cards.json, prices.json ; les fichiers de langue au premier passage de l'appli).
   • Icônes, manifeste, polices, SDK Firebase, Tesseract (adresses versionnées) : cache d'abord.
   • Images des cartes : cache d'abord. Elles sont « opaques » (Lorcast n'envoie pas d'en-tête CORS) : Chrome compte ~7 Mo par réponse opaque
     dans le quota du site (mesuré : ≈ 8,5 Mo par image de 9 Ko) → 200 images au plus (≈ 1,7 Go comptés), les plus anciennes partent.
     ponytail: plafond en nombre ; passer en fetch CORS (taille réelle) si Lorcast ajoute Access-Control-Allow-Origin un jour.
   • « io-warm » (pwa.js) : préchargement des petites images de la collection, une par une, dans la même limite. */
const V = 'inkorbit-v2';
const SHELL = V + '-shell', STATIC = V + '-static', DATA = V + '-data', IMG = V + '-img', CDN = V + '-cdn';
const IMG_HOSTS = ['cards.lorcast.io', 'api.lorcana.ravensburger.com'];
const IMG_MAX = 200;
const SHELL_TTL = 7 * 864e5, DATA_WAIT = 4000, BUILD_RE = /const IO_BUILD = '([\w-]+)'/;
const BASE = new URL('./', self.location).pathname, ROOT = new URL('./', self.location).href;
const ASSETS = ['manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png', 'icons/icon.svg', 'icons/favicon-32.png'];
const DATA0 = ['data/cards.json', 'data/prices.json'];
const rel = u => (u.pathname.startsWith(BASE) ? u.pathname.slice(BASE.length) : null);
function cdnKind(u) {
  if (u.protocol !== 'https:') return null;
  if (u.hostname === 'fonts.gstatic.com') return 'imm';
  if (u.hostname === 'fonts.googleapis.com') return 'swr';
  if (u.hostname === 'www.gstatic.com' && /^\/firebasejs\/\d+\.\d+\.\d+\//.test(u.pathname)) return 'imm';
  if (u.hostname === 'cdn.jsdelivr.net' && /^\/npm\/(@[\w.-]+\/)?[\w.-]+@\d[\w.-]*\//.test(u.pathname)) return 'imm';
  return null;
}

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const st = await caches.open(STATIC), sh = await caches.open(SHELL), dt = await caches.open(DATA);
    await Promise.all([...ASSETS.map(a => st.add(new Request(a, { cache: 'reload' }))), ...DATA0.map(a => dt.add(new Request(a, { cache: 'reload' })))].map(p => p.catch(() => {})));
    try { await keepShell(sh, await fetch(new Request(ROOT, { cache: 'reload' }))); } catch (_) { /* mis en cache à la première visite */ }
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keep = [SHELL, STATIC, DATA, IMG, CDN];
    for (const k of await caches.keys()) {
      if (!k.startsWith('inkorbit-') || keep.includes(k)) continue;
      const suffix = k.slice(k.lastIndexOf('-'));      // ancienne version : ses données et images passent dans la nouvelle (rien à retélécharger hors ligne)
      const to = keep.find(x => x.endsWith(suffix));
      if (to && to !== SHELL) { const a = await caches.open(k), b = await caches.open(to); for (const r of await a.keys()) if (!(await b.match(r))) await b.put(r, await a.match(r)); }
      await caches.delete(k);
    }
    await self.clients.claim();
  })());
});

/** Garde la page seulement si c'est bien l'appli (IO_BUILD présent : jamais une page d'erreur d'hébergeur ou de portail wifi). */
async function keepShell(cache, r) {
  if (!r || r.status !== 200 || r.type !== 'basic' || r.redirected) return;
  const html = await r.text(), m = BUILD_RE.exec(html);
  if (!m) return;
  const h = new Headers(r.headers); for (const k of ['content-encoding', 'content-length', 'vary']) h.delete(k);
  h.set('x-io-build', m[1]); h.set('x-io-at', String(Date.now()));
  const put = () => cache.put(ROOT, new Response(html, { status: 200, headers: h }));
  try { await put(); } catch (_) { await caches.delete(IMG).catch(() => {}); await put().catch(() => {}); }      // stockage plein : les images cèdent la place
}
let shellCheck = Promise.resolve();
async function page(e) {
  const cache = await caches.open(SHELL), cached = await cache.match(ROOT);
  const net = fetch(e.request).then(async r => { await keepShell(cache, r.clone()); return r; });
  shellCheck = net.catch(() => {}); e.waitUntil(shellCheck);
  const u = new URL(e.request.url), age = cached ? Date.now() - Number(cached.headers.get('x-io-at')) : NaN;
  const plain = !/[?&]p=/.test(u.search);
  if (plain && age >= 0 && age < SHELL_TTL) return cached;
  const wait = new Promise((_, no) => setTimeout(no, cached && plain ? 4000 : 20000));
  try { const r = await Promise.race([net, wait]); if (r.ok || !cached) return r; } catch (_) { /* réseau absent ou lent */ }
  return cached || new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><body style="font:16px system-ui;background:#120d2e;color:#f5f0fd;display:grid;place-items:center;min-height:90vh;text-align:center"><p>Ink Orbit est hors ligne<br>et n\'a pas encore été ouvert avec du réseau.</p>', { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
self.addEventListener('message', e => {
  const d = e.data || {};
  if (d.type === 'io-warm' && Array.isArray(d.urls)) { e.waitUntil(warm(d.urls).catch(() => {})); return; }
  if (d.type !== 'io-shell?' || !e.source) return;
  e.waitUntil((async () => {
    await Promise.race([shellCheck, new Promise(r => setTimeout(r, 30000))]);
    const c = await (await caches.open(SHELL)).match(ROOT);
    e.source.postMessage({ type: 'io-shell', build: (c && c.headers.get('x-io-build')) || '' });
  })().catch(() => {}));
});

async function cacheFirst(e, name) {
  const cache = await caches.open(name), hit = await cache.match(e.request);
  if (hit) return hit;
  const r = await fetch(e.request);
  if (r.ok || r.type === 'opaque') e.waitUntil(cache.put(e.request, r.clone()).catch(() => {}));
  return r;
}
/** Données : réseau d'abord (le relevé du jour), mais jamais plus de 4 s si une copie existe. */
async function data(e) {
  const cache = await caches.open(DATA), hit = await cache.match(e.request, { ignoreSearch: true });
  const net = fetch(e.request).then(r => { if (r.ok) cache.put(e.request.url.split('?')[0], r.clone()).catch(() => {}); return r; });
  e.waitUntil(net.catch(() => {}));
  if (!hit) return net;
  try { const r = await Promise.race([net, new Promise((_, no) => setTimeout(no, DATA_WAIT))]); return r.ok ? r : hit; } catch (_) { return hit; }
}
async function swr(e, name) {
  const cache = await caches.open(name), hit = await cache.match(e.request);
  const net = fetch(e.request).then(r => { if (r.ok) cache.put(e.request, r.clone()).catch(() => {}); return r; });
  e.waitUntil(net.catch(() => {}));
  return hit || net;
}
let trimT = 0;
const trimSoon = () => { clearTimeout(trimT); trimT = setTimeout(() => trimImages().catch(() => {}), 3000); };
async function image(e) { const r = await cacheFirst(e, IMG); trimSoon(); return r; }
async function trimImages() {
  const c = await caches.open(IMG), keys = await c.keys();      // ordre d'insertion : les plus anciennes d'abord
  for (const k of keys.slice(0, Math.max(0, keys.length - IMG_MAX))) await c.delete(k);
}
/** Préchargement : images absentes du cache, une à la fois, sans dépasser la limite. */
async function warm(urls) {
  const c = await caches.open(IMG);
  let room = IMG_MAX - (await c.keys()).length;
  for (const u of urls) {
    if (room <= 0) break;
    let h; try { h = new URL(u).hostname; } catch (_) { continue; }
    if (!IMG_HOSTS.includes(h) || await c.match(u)) continue;
    try { const r = await fetch(u, { mode: 'no-cors' }); if (r.ok || r.type === 'opaque') { await c.put(u, r); room--; } } catch (_) { break; }      // réseau perdu : on arrête
  }
}

self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin === self.location.origin) {
    const p = rel(u);
    if (req.mode === 'navigate' && (p === '' || p === 'index.html')) { e.respondWith(page(e)); return; }
    if (p && p.startsWith('data/')) { e.respondWith(data(e)); return; }
    if (p && ASSETS.includes(p)) { e.respondWith(swr(e, STATIC)); return; }
    return;
  }
  if (IMG_HOSTS.includes(u.hostname)) { e.respondWith(image(e)); return; }
  const k = cdnKind(u);
  if (k === 'imm') e.respondWith(cacheFirst(e, CDN));
  else if (k === 'swr') e.respondWith(swr(e, CDN));
});
