// Assemble src/* → public/index.html (document autonome, versionné : l'hébergeur statique ne lance aucun build).
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const rd = f => readFileSync(join(root, 'src', f), 'utf8');

// Thème (src/css/theme.css : jetons de couleur, polices) puis feuille principale, puis feuilles par fonction (src/css/*.css, ordre alphabétique ; zz-desktop.css en dernier) : une seule <style>.
const CSS_DIR = join(root, 'src', 'css');
const css = [...(existsSync(join(CSS_DIR, 'theme.css')) ? [readFileSync(join(CSS_DIR, 'theme.css'), 'utf8')] : []), existsSync(join(root, 'src', 'style.css')) ? rd('style.css') : '', ...(existsSync(CSS_DIR) ? readdirSync(CSS_DIR).filter(f => f.endsWith('.css') && f !== 'theme.css').sort().map(f => readFileSync(join(CSS_DIR, f), 'utf8')) : [])].join('\n').trim();
// Sprite SVG (logo, symboles des encres, icônes : src/icons.html) posé à la place de <!--icons--> dans body.html.
const body = rd('body.html').trim().replace('<!--icons-->', () => (existsSync(join(root, 'src', 'icons.html')) ? rd('icons.html').trim() : ''));
// Dictionnaires (src/i18n/<code>.<partie>.json : { « texte français » : « traduction » }) : fusionnés par langue, un bloc JSON inerte chacun.
const I18N_DIR = join(root, 'src', 'i18n'), i18nAll = {};
for (const f of (existsSync(I18N_DIR) ? readdirSync(I18N_DIR) : []).sort()) {
  const m = /^([a-z]{2})(?:\.[a-z0-9-]+)?\.json$/.exec(f); if (!m) continue;
  Object.assign(i18nAll[m[1]] = i18nAll[m[1]] || {}, JSON.parse(readFileSync(join(I18N_DIR, f), 'utf8')));
}
// Ordre de chargement : core (logique pure, testable sous Node) d'abord, main (démarrage) à la fin.
const JS = ['core.js', 'data.js', 'ui.js', 'motion.js', 'viewer.js', 'catalog.js', 'collection.js', 'value.js', 'trade.js', 'qr.js', 'binder.js', 'masterset.js', 'decks.js', 'starters.js', 'pubdecks.js', 'scan.js', 'lore.js', 'mystery.js', 'cloud.js', 'badgeart.js', 'progress.js', 'home.js', 'settings.js', 'onboard.js', 'pwa.js', 'main.js'];
const js = JS.filter(f => existsSync(join(root, 'src', f))).map(rd).join('\n\n').replace(/<\/script/gi, '<\\/script').trim();
{ const seen = new Set(), dup = []; for (const m of js.matchAll(/^(?:async )?function\*? ?([A-Za-z0-9_$]+)\s*\(/gm)) { if (seen.has(m[1])) dup.push(m[1]); seen.add(m[1]); } if (dup.length) { console.error('Fonctions déclarées deux fois (la 2e remplace la 1re) : ' + dup.join(', ')); process.exit(1); } }
const i18nTags = Object.keys(i18nAll).sort().map(c => `<script type="application/json" id="i18n-${c}">${JSON.stringify(i18nAll[c]).replace(/</g, '\\u003c')}</script>`).join('\n');

// Version : sw.js lit la ligne « const IO_BUILD = '…' » de la page (copie hors ligne, « Recharger ») : ne pas en modifier la forme.
const BUILD = createHash('sha1').update(css + body + i18nTags + js).digest('hex').slice(0, 8);
const TITLE = 'Ink Orbit';
const FONTS = 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght,SOFT,WONK@9..144,500..800,100,1&family=Nunito+Sans:opsz,wght@6..12,400..800&display=swap';
const DESC = 'Ta collection de cartes Lorcana, tes decks et leur valeur. Appli de fan gratuite et non officielle.';
const SITE = process.env.SITE_URL || 'https://ink.manaorbit.app/';      // adresse publique : aperçus des liens partagés (Open Graph), adresse canonique

const doc = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark light">
<meta name="description" content="${DESC}">
<meta name="theme-color" content="#140f2e">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" type="image/svg+xml" href="icons/icon.svg">
<link rel="icon" type="image/png" sizes="32x32" href="icons/favicon-32.png">
<link rel="canonical" href="${SITE}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${TITLE}">
<meta property="og:title" content="${TITLE} : ta collection Lorcana">
<meta property="og:description" content="${DESC}">
<meta property="og:url" content="${SITE}">
<meta property="og:image" content="${SITE}og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="${TITLE}">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<title>${TITLE}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<style>
${css}
</style>
</head>
<body>
<div id="splash" aria-hidden="true"><svg><use href="#i-logo"/></svg><p>${TITLE}</p></div>
${body}
${i18nTags}
<script>
const IO_BUILD = '${BUILD}';
${js}
</script>
</body>
</html>
`;

writeFileSync(join(root, 'public', 'index.html'), doc);
console.log('public/index.html', (doc.length / 1024).toFixed(1) + ' KB', BUILD);
