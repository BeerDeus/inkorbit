// Serveur statique de développement et des tests (zéro dépendance) : sert public/ comme le ferait l'hébergeur.
// PORT (8790), PUBLIC_DIR (public/). En production : n'importe quel hébergement statique (voir README › Hébergement).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.env.PUBLIC_DIR || join(dirname(fileURLToPath(import.meta.url)), 'public');
const port = Number(process.env.PORT) || 8790;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.css': 'text/css; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml' };

export function serve(p = port, dir = root) {
  const srv = createServer(async (req, res) => {
    try {
      let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (path.endsWith('/')) path += 'index.html';
      const file = normalize(join(dir, path));
      if (!file.startsWith(normalize(dir))) { res.writeHead(403).end(); return; }
      const s = await stat(file).catch(() => null);
      const f = s && s.isFile() ? file : !extname(path) ? join(dir, 'index.html') : null;      // adresse sans extension : la page (liens ?p=…)
      if (!f) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404'); return; }
      res.writeHead(200, { 'Content-Type': TYPES[extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : await readFile(f));
    } catch (e) { res.writeHead(500).end(); }
  });
  return new Promise(r => srv.listen(p, '127.0.0.1', () => r(srv)));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1])) serve().then(() => console.log(`Ink Orbit : http://localhost:${port}/`));
