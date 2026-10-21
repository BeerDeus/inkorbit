# Contrat commun (agents et modules)

Ink Orbit : PWA de fan pour Disney Lorcana TCG (collection, decks, valeur, échange). Pas d'appli Android, pas de serveur : site statique dans `public/`.
Référence (lecture seule, hors dépôt) : copie de Mana Orbit dans
`C:\Users\marti\AppData\Local\Temp\claude\C--Users-marti-Desktop-Ink-Orbit\312a508c-3c38-43fb-a0fa-4b87c1c87a15\scratchpad\mana-ref\`.

## Build

- `node build.mjs` → `public/index.html` (une seule page). Ordre CSS : `src/css/theme.css`, `src/style.css`, puis `src/css/*.css` alphabétique (`zz-desktop.css` en dernier).
- `src/body.html` contient `<!--icons-->`, remplacé par `src/icons.html` (sprite SVG `<svg><defs><symbol id=…>`).
- Modules JS (ordre de `build.mjs` › `JS`, scripts classiques concaténés, pas de modules ES) : `core.js data.js ui.js viewer.js catalog.js collection.js value.js trade.js qr.js binder.js masterset.js decks.js scan.js lore.js mystery.js home.js settings.js pwa.js main.js`. Un fichier absent est ignoré. Deux fonctions du même nom dans deux fichiers = build refusé.
- `node serve.mjs` : http://localhost:8790/

## Textes

- Français dans le code : `T('Texte {n}', { n })`, pluriels `TN(n, '{n} carte', '{n} cartes')` (définis dans `core.js`). Traductions : `src/i18n/<langue>.<partie>.json` (`{ "texte français": "traduction" }`).
- Textes fixes de `body.html` : traduits au démarrage par `i18nDom(document.body)`.

## Jetons de thème (`src/css/theme.css`, à respecter partout)

Thème par défaut : « Nuit » (sombre). `html[data-theme="light"]` : « Parchemin » (clair). `html[data-theme="dark"]` force la nuit.

- Fonds : `--bg`, `--bg-2` (dégradé du ciel), `--surface`, `--surface-2`, `--surface-3`, `--line`
- Texte : `--ink`, `--ink-2`, `--ink-3` (≥ 4,5:1 sur `--bg` et `--surface`)
- Accents : `--gold`, `--gold-2`, `--gold-soft`, `--accent`, `--accent-ink`, `--accent-soft`, `--ring`
- États : `--good`, `--good-soft`, `--warn`, `--warn-soft`, `--bad`, `--bad-soft`
- Divers : `--scrim`, `--shadow`, `--shadow-lg`, `--r-lg` `--r-md` `--r-sm`, `--ease`, `--out`, `--spring`
- Polices : `--font-display` (Fraunces), `--font-body` (Nunito Sans), `--font-num`
- Encres : `--amber`, `--amethyst`, `--emerald`, `--ruby`, `--sapphire`, `--steel` (+ `--<encre>-soft`)
- Raretés : `--r-common` `--r-uncommon` `--r-rare` `--r-super` `--r-legendary` `--r-epic` `--r-enchanted` `--r-iconic` `--r-special`

## Icônes (`src/icons.html`)

`<svg class="i"><use href="#i-xxx"/></svg>` (trait `currentColor`, 24×24) : `i-logo` (logo complet), `i-mark` (logo seul, petit), `i-home i-cards i-scan i-trade i-deck i-search i-plus i-minus i-close i-back i-chev i-more i-gear i-share i-qr i-star i-heart i-binder i-chart i-filter i-sort i-camera i-trash i-edit i-check i-copy i-link i-download i-upload i-moon i-sun i-sparkle i-lore i-mystery i-info i-help i-book i-grid i-list i-refresh i-offline`.
Encres : `ink-amber ink-amethyst ink-emerald ink-ruby ink-sapphire ink-steel` (symboles originaux, en couleur pleine, jamais ceux du jeu officiel). Encrable : `i-inkwell`.

## Coque de l'appli (`ui.js`, `body.html`, `style.css`)

- `<main id="app">` contient les vues `<section class="view" id="v-home|v-coll|v-scan|v-trade|v-decks" hidden>`.
- Barre du bas (téléphone) `#nav`, boutons `data-view="home|coll|scan|trade|decks"` ; sur ordinateur (≥ 1024 px) la même navigation devient une colonne à gauche.
- En-tête `#bar` : logo, titre, bouton Réglages `#btnSettings`.
- API (globales, `ui.js`) :
  - `$(sel, root)`, `$$(sel, root)`, `esc(s)`, `toast(msg, { action, onAction, ms })`
  - `showView(name)`, `onView(name, fn)` (appelée à chaque affichage de la vue, rendu paresseux), `curView()`
  - `openSheet({ title, html, cls, onClose })` → élément `.sheet` (feuille du bas sur téléphone, fenêtre centrée sur ordinateur) ; `openScreen({ title, html, cls, onClose })` → écran plein ; `closeTop()` ; le bouton Retour du téléphone ferme la surcouche du dessus (history.pushState).
  - `fmtMoney(cents)` (devise des réglages), `fmtNum(n)`
- Le rendu ordinateur ne change jamais le rendu téléphone : tout ce qui est propre à l'ordinateur va dans `src/css/zz-desktop.css`, sous `@media (min-width:1024px)`.

## Données (`data.js`, `core.js`)

- `public/data/cards.json` : `{ v, inks, types, rarities, sets:[{c,t,d,b,n:{en,fr,de,it}}], cards:[[id,set,num,inkMask,cost,inkwell,type,rarity,str,wil,lore,foil,img,core,max,parentSet]] }`.
- `public/data/cards-<langue>.json` : `{ v, l, cards:[[id,name,version,text,subtypes,story]] }`.
- `public/data/prices.json` : `{ v, src, p:{ <id>:[eur,eurFoil,usd,usdFoil] } }` (centimes).
- Carte en mémoire (`CARDS.byId.get(id)`) : `{ id, set, num, ink, cost, inkwell, type, rar, str, wil, lore, foil, img, core, max, pset, name, ver, text, sub, story }`.
- Image : `cardImg(card, 'small'|'normal'|'large')`.
- Stockage local : préfixe `inkorbit:`.

## Mentions obligatoires

Pied de page, Réglages › À propos, pages légales : « Ink Orbit est une application de fan gratuite et non officielle… non publiée, approuvée ni soutenue par Disney ou Ravensburger » + crédits « Données : LorcanaJSON · Images : Lorcast · Prix : Cardmarket, TCGplayer (via tcgcsv) ». Jamais de logo Lorcana/Disney, de police officielle, de personnage Disney dans l'identité.

## API métier déjà écrite (`core.js`, `data.js`, `viewer.js`)

- `core.js` (pur, `module.exports` pour Node) : `INK_KEYS`, `INK_NAMES()`, `TYPE_NAMES()`, `RAR_KEYS`, `RAR_NAMES()`, `inksOf(mask)`, `normName`, `fullName(c)`, `nameSim(a,b)`,
  `collKey(id, foil, lang)` (« 123 », « 123* », « 123@fr »), `collParse`, `collAdd(map, key, n)`, `collById(map)`, `priceFor(prices, id, foil, cur)`, `collValue`,
  `csvSplit`, `parseCsv(text, ix)`, `collToCsv(map, byId)`, `cardIndex`, `findCard(ix, {set,num,name,ver})`, `parseDeck(text, ix)` → `{cards: Map carte→n, bad}`, `deckToText(deck, byId)`,
  `deckCheck(deck, byId)` → `{total, inks, over, ok, problems}`, `deckMissing(deck, map)`, `tradeLists(map, keep, hold, wants)`, `tradePack`/`tradeUnpack`, `tradeMatch`, `b64u`/`unb64u`,
  `dayKey(date)` (jour à Paris), `seedPick(s, n)`, `parseFootLine(text)` → `{num, of, lang, set}`.
- `data.js` : `CARDS` (`list`, `byId`, `sets` [{code,type,date,base,name}], `setsByCode`, `ix`, `ready`), `PRICES.p`, `dataLoad()` (promesse, une fois), `dataEn()` (noms anglais pour imports),
  `cardImg(c, size)`, `cardSearch(q, filtres, limit)`, `setName(code)`, `setLabel(c)`, `cardPrice(c, foil)`, `load(k, def)` / `save(k, v)` (localStorage `inkorbit:`), `prefs()` / `setPref(k, v)`,
  `COLL` (`map`, `wants`, `hold`), `collSave()`, `onColl(fn)`, `ownedOf(id)`. Évènement `io:data` sur `document` quand le catalogue est prêt.
- `viewer.js` : `thumbHtml(c, {qty, foil, missing, size, cap})` (vignette ; un conteneur `[data-cards]` définit la liste précédente/suivante ; `[data-pick]` désactive l'ouverture),
  `openCard(id, ids)`, `pickCard({title, onPick, keep, q})`, `collAddCard(c, n, {foil, lang, quiet})` (toast Annuler), `ownSplit(id)` → `{n, f}`, `inkPips(c)`, `rarLabel(c)`.
- Chaque module a sa feuille `src/css/<module>.css` ; ses textes passent par `T()`.
