/* Ink Orbit — service worker (modèle : celui de Mana Orbit, simplifié : pas de serveur, pas de notifications).
   • Page : copie locale tout de suite (l'appli s'ouvre hors ligne), rafraîchie en arrière-plan ; version gardée différente de celle qui tourne
     (IO_BUILD) → message « io-shell » à la page, qui propose « Recharger ». Lien de partage (?p=) ou copie de plus de 7 jours : réseau d'abord.
   • Catalogue et prix (data/*.json) : réseau d'abord (relus chaque jour), copie si hors ligne.
   • Icônes, manifeste, polices, Tesseract (adresses versionnées) : cache d'abord.
   • Images des cartes : cache d'abord, 150 Mo et 5 000 fichiers au plus (les plus anciennes partent). */
const V = 'inkorbit-v1';
const SHELL = V + '-shell', STATIC = V + '-static', DATA = V + '-data', IMG = V + '-img', CDN = V + '-cdn';
const IMG_HOSTS = ['cards.lorcast.io', 'api.lorcana.ravensburger.com', 'lorcana-api.com'];
const IMG_LIM = { bytes: 150 * 1024 * 1024, max: 5000 };
const SHELL_TTL = 7 * 864e5, BUILD_RE = /const IO_BUILD = '([\w-]+)'/;
const BASE = new URL('./', self.location).pathname, ROOT = new URL('./', self.location).href;
const ASSETS = ['manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png', 'icons/icon.svg'];
const rel = u => (u.pathname.startsWith(BASE) ? u.pathname.slice(BASE.length) : null);
function cdnKind(u) {
  if (u.protocol !== 'https:') return null;
  if (u.hostname === 'fonts.gstatic.com') return 'imm';
  if (u.hostname === 'fonts.googleapis.com') return 'swr';
  if (u.hostname === 'cdn.jsdelivr.net' && /^\/npm\/(@[\w.-]+\/)?[\w.-]+@\d[\w.-]*\//.test(u.pathname)) return 'imm';
  return null;
}

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const st = await caches.open(STATIC), sh = await caches.open(SHELL);
    await Promise.all(ASSETS.map(a => st.add(new Request(a, { cache: 'reload' })).catch(() => {})));
    try { await keepShell(sh, await fetch(new Request(ROOT, { cache: 'reload' }))); } catch (_) { /* mis en cache à la première visite */ }
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('inkorbit-') && ![SHELL, STATIC, DATA, IMG, CDN].includes(k)) await caches.delete(k);
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
  try { await cache.put(ROOT, new Response(html, { status: 200, headers: h })); } catch (_) { await caches.delete(IMG).catch(() => {}); await cache.put(ROOT, new Response(html, { status: 200, headers: h })).catch(() => {}); }
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
  return cached || new Response('Ink Orbit est hors ligne et n\'a pas encore été ouvert avec du réseau.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
self.addEventListener('message', e => {
  if (!e.data || e.data.type !== 'io-shell?' || !e.source) return;
  e.waitUntil((async () => {
    await Promise.race([shellCheck, new Promise(r => setTimeout(r, 30000))]);
    const c = await (await caches.open(SHELL)).match(ROOT);
    e.source.postMessage({ type: 'io-shell', build: (c && c.headers.get('x-io-build')) || '' });
  })().catch(() => {}));
});

async function cacheFirst(e, name, key = e.request) {
  const cache = await caches.open(name), hit = await cache.match(key);
  if (hit) return hit;
  const r = await fetch(e.request);
  if (r.ok || r.type === 'opaque') e.waitUntil(cache.put(key, r.clone()).catch(() => {}));
  return r;
}
async function netFirst(e, name) {
  const cache = await caches.open(name);
  try { const r = await fetch(e.request); if (r.ok) e.waitUntil(cache.put(e.request, r.clone()).catch(() => {})); return r; }
  catch (err) { const hit = await cache.match(e.request); if (hit) return hit; throw err; }
}
async function swr(e, name) {
  const cache = await caches.open(name), hit = await cache.match(e.request);
  const net = fetch(e.request).then(r => { if (r.ok) cache.put(e.request, r.clone()).catch(() => {}); return r; });
  e.waitUntil(net.catch(() => {}));
  return hit || net;
}
/** Images : cache d'abord, puis le budget est tenu (les plus anciennes entrées partent). */
let trimT = 0;
async function image(e) {
  const r = await cacheFirst(e, IMG);
  clearTimeout(trimT); trimT = setTimeout(() => trimImages().catch(() => {}), 5000);
  return r;
}
async function trimImages() {
  const c = await caches.open(IMG), keys = await c.keys();
  if (keys.length <= IMG_LIM.max) return;
  for (const k of keys.slice(0, keys.length - IMG_LIM.max)) await c.delete(k);
}

self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin === self.location.origin) {
    const p = rel(u);
    if (req.mode === 'navigate' && (p === '' || p === 'index.html')) { e.respondWith(page(e)); return; }
    if (p && p.startsWith('data/')) { e.respondWith(netFirst(e, DATA)); return; }
    if (p && ASSETS.includes(p)) { e.respondWith(swr(e, STATIC)); return; }
    return;
  }
  if (IMG_HOSTS.includes(u.hostname)) { e.respondWith(image(e)); return; }
  const k = cdnKind(u);
  if (k === 'imm') e.respondWith(cacheFirst(e, CDN));
  else if (k === 'swr') e.respondWith(swr(e, CDN));
});
