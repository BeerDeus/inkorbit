# Ink Orbit — développement

La doc produit est dans `README.md`. Ce fichier décrit le code, le build et les tests. Les conventions communes (jetons de thème, icônes, API de la coque, format des données) sont dans `docs/contrat.md`.

## Arborescence

| Chemin | Rôle |
|---|---|
| `src/` | Sources de la page : modules JS concaténés **dans l'ordre de `build.mjs`** (scripts classiques, pas de modules ES), `css/theme.css` (jetons), `style.css`, `css/*.css` (`zz-desktop.css` en dernier, sous `@media (min-width:1024px)`), `body.html`, `icons.html` (sprite SVG), `i18n/`. `src/package.json` les marque CommonJS : les tests Node les chargent avec `require` |
| `build.mjs` | Assemble `src/*` → **`public/index.html`** (versionné). Refuse deux fonctions du même nom dans deux fichiers |
| `serve.mjs` | Serveur statique de développement et des tests (zéro dépendance), port 8790 |
| `gen-cards.mjs`, `gen-prices.mjs` | Générateurs des données du jour (`public/data/`). `CACHE_DIR=<dossier>` garde les téléchargements |
| `public/` | Le site tel qu'il est publié |
| `tests/` | Tests (Node, jsdom, navigateur). Dépendances de dev dans `tests/package.json` |
| `docs/` | Contrat commun, rapport de Phase 0, direction artistique |

Le `package.json` de la racine n'a **aucune dépendance**. Ne pas en ajouter.

## Build

    node build.mjs        # → public/index.html (à committer avec les sources)

Toujours committer `src/` **et** `public/index.html` ensemble : la CI vérifie que la page est à jour.

## Textes et langues

- Tous les textes sont en français dans le code : `T('Texte {n}', { n })`, et les pluriels avec `TN(n, '{n} carte', '{n} cartes')`.
- Les traductions vont dans `src/i18n/<langue>.<partie>.json` (`{ "texte français": "traduction" }`).
- Les textes fixes de `body.html` sont traduits au démarrage (`i18nDom`).

## Données

| Fichier | Contenu |
|---|---|
| `public/data/cards.json` | `{ v, inks, types, rarities, sets, cards }`. Une carte est une ligne compacte : `[id, set, num, inkMask, cost, inkwell, type, rarity, str, wil, lore, foil, img, core, max, parentSet]` |
| `public/data/cards-<langue>.json` | `[id, nom, version, texte, sous-types, histoire]` pour chaque carte. Une carte absente de la langue prend l'anglais |
| `public/data/prices.json` | `{ v, src, p: { id: [eur, eurFoil, usd, usdFoil] } }`, en centimes, 0 = pas de prix |

- Le champ `img` vaut soit un jeton Lorcast `<hex>?<version>`, soit `r:<chemin>` pour la miniature LorcanaJSON de secours.
- Le format est détaillé dans `docs/contrat.md` › Données.

## Tests

    cd tests && npm ci && cd ..
    node build.mjs
    bash tests/run-tests.sh           # tout, un par un → tests/run-tests.out + tests/logs/
    bash tests/run-tests.sh --node    # sans navigateur
    bash tests/run-tests.sh test-gen.mjs
    node --test tests/test-gen.mjs    # un seul test

- Navigateur : Chromium ou Chrome via `playwright-core`. Le chemin est dans `CHROMIUM` ; par défaut, Chrome de Windows s'il est installé, sinon `/opt/pw-browsers/chromium`. En CI : `/usr/bin/google-chrome`.
- Ne jamais lancer deux tests en même temps : les ports sont fixes.
- Un nouveau test s'ajoute dans les listes `NODE` ou `BROWSER` de `tests/run-tests.sh` : la CI le lance d'office.
- `test-gen.mjs` (`node:test`) : les fonctions pures des générateurs, sur de petites données fabriquées dans le test. On y vérifie :
  - les jointures LorcanaJSON ↔ Lorcast et ↔ tcgcsv ;
  - les promos, les variantes « 4a », les Enchantées sans version normale, l'image de secours ;
  - qu'un prix Cardmarket à 0 compte comme « pas de prix », et le cas Holofoil seul.
- `test-qr.mjs` : l'encodeur QR (`src/qr.js`), contre un décodeur indépendant et des matrices de référence (qrcodegen). Les textes des matrices sont ceux de Mana Orbit : ne pas les changer.

## CI

- `.github/workflows/tests.yml` : vérifie que le build est à jour, puis lance `run-tests.sh` à chaque push, à chaque pull request et à la demande. Un push qui ne touche que `public/data/` ou des `.md` ne relance pas les tests.
- `.github/workflows/data.yml` : les données du jour (voir `README.md`).

## Compte et synchro (Firebase)

- `src/cloud.js` : projet Firebase `ink-orbit` (configuration web publique, pas un secret), SDK lu sur gstatic à la demande (seulement après un premier clic sur « Se connecter », ou si un compte a déjà été connecté sur l'appareil).
- Un document par compte : `users/{uid}/data/main` (`coll`, `wants`, `hold`, `decks`, `prefs`, `at`, `dev`). Fusion entre appareils : `core.js` › `mergeDocs`.
- Règles : `firestore.rules`, à publier dans la console (Firestore › Règles) ou avec `firebase deploy --only firestore:rules`.
- Tests sur émulateurs (Java 21+), outils installés à part (`--no-save`, jamais dans le dépôt) :

      npm i --no-save --prefix /tmp/fb firebase-tools@15.31.0 @firebase/rules-unit-testing@5.0.2 firebase@12.19.0
      RULES_DEPS=/tmp/fb/node_modules /tmp/fb/node_modules/.bin/firebase emulators:exec --only auth,firestore --project ink-orbit "node tests/rules-test.mjs && node tests/sync-e2e.mjs"

  Sans émulateur, `run-tests.sh` les ignore. `sync-e2e.mjs` : deux appareils, création du compte par e-mail, fusion, changements en direct, déconnexion ; l'appli se branche sur les émulateurs grâce à `localStorage['inkorbit:emu']` (seulement sur localhost).
