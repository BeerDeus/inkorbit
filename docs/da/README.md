# Direction artistique d'Ink Orbit

Planche complète : [maquettes.html](maquettes.html) (autonome) · captures : [shots/identite.png](shots/identite.png), [shots/ecrans.png](shots/ecrans.png), [shots/ecrans-parchemin.png](shots/ecrans-parchemin.png).
Régénérer : `node tools/make-icons.mjs` (icônes de `public/icons/`) et `node tools/make-icons.mjs --sheet` (planche et captures, depuis `docs/da/planche.html`). Il faut Chrome (ou `CHROME=<chemin>`).

## Intention

« Un livre de contes ouvert la nuit. » Le ciel est indigo puis violet. Les filigranes sont dorés, dans un or chaud et jamais jaune. L'encre et l'aquarelle apparaissent en halos flous, et quelques étincelles scintillent. Les vraies couleurs viennent des cartes elles-mêmes : l'interface reste sombre et calme autour d'elles. On ne copie ni le logo, ni les cadres, ni les polices du jeu officiel.

- Le téléphone passe d'abord. Les vignettes de cartes sont grandes, les zones de toucher font au moins 44 px, et les chiffres sont gros (valeur, lore).
- L'or est réservé à ce qui compte : la valeur de la collection, le bouton Scanner, l'onglet actif, les filets.
- Le mouvement reste discret : les étoiles scintillent lentement, et tout s'arrête avec `prefers-reduced-motion`.

## Thèmes et couleurs (`src/css/theme.css`)

| Jeton | Nuit (défaut) | Parchemin (`data-theme="light"`) |
|---|---|---|
| `--bg` / `--bg-2` | `#120d2e` / `#2a1756` | `#f5eedf` / `#ece1c9` |
| `--surface` / `-2` / `-3` | `#1d1745` / `#282056` / `#171138` | `#fffaf0` / `#efe5d0` / `#f9f3e6` |
| `--line` | `#3b3074` | `#d8c9a8` |
| `--ink` / `-2` / `-3` | `#f5f0fd` / `#cfc5ea` / `#a99dce` | `#2a1b46` / `#4b3b6d` / `#66567f` |
| `--gold` / `--gold-2` | `#e9c47c` / `#c99a45` | `#8a5d14` / `#6e4a10` (or bruni) |
| `--accent` | `#b9a2ff` (lavande) | `#5a3db2` |
| `--good` `--warn` `--bad` | `#62d6a6` `#f2bb63` `#ff8c9c` | `#137a52` `#97600a` `#b4334a` |

Contrastes : `--ink-3` dépasse 4,5:1 sur `--bg`, `--surface` et `--surface-2` dans les deux thèmes. En Parchemin, `--gold` atteint 4,9:1 sur `--bg`, il reste donc lisible même pour un petit texte. `--sky` donne le dégradé du ciel et `--foil` le reflet des cartes foil.

**Les six encres** ont nos propres teintes, et le thème clair les assombrit : Ambre `#f3aa3c`, Améthyste `#a274ee`, Émeraude `#33b27a`, Rubis `#ea4c63`, Saphir `#3f97e6`, Acier `#a3afc0`. Chacune a aussi sa variante `--<encre>-soft` pour les fonds.

**Les raretés** vont du plus discret au plus précieux : `--r-common` gris lavande, `--r-uncommon` menthe, `--r-rare` bleu, `--r-super` violet, `--r-legendary` or, `--r-epic` rose, `--r-enchanted` cyan, `--r-iconic` ivoire, `--r-special` corail.

## Typographie

Les deux polices sont sous licence SIL OFL et chargées par Google Fonts (voir `build.mjs`).

- **Fraunces** pour les titres et les grands chiffres. On utilise les axes `SOFT 100` et `WONK 1` (`.da-title`) : un sérif doux et un peu bancal, qui évoque un livre de contes sans imiter la police du jeu.
- **Nunito Sans** pour le texte, les boutons et les petites données. Elle est ronde et très lisible à 12 px.

## Logo

Une **goutte d'encre magique** (dégradé lavande, violet puis saphir, avec un reflet et une étincelle intérieure) est traversée par une **orbite d'or**. L'anneau passe derrière la goutte en haut et devant en bas, comme celui d'une planète. Une **étoile à quatre branches** tourne en satellite. La goutte dit « Ink », l'anneau et l'étoile disent « Orbit ».

- `#i-logo` (sprite `src/icons.html`, 100 × 100) : la version complète, à partir de 28 px.
- `#i-mark` (24 × 24) : une version simplifiée pour l'en-tête et les petites tailles, lisible jusqu'à 16 px.
- L'icône de l'appli (`public/icons/`) place le logo sur un ciel de nuit plein cadre, avec quelques étoiles. Le système arrondit lui-même les coins. La version maskable réduit le logo à 60 % pour qu'il tienne dans la zone sûre.
- Le mot-symbole « Ink Orbit » s'écrit en Fraunces 700 (SOFT 100, WONK 1). Le logo passe toujours à gauche du nom.
- Règles d'usage : pas de contour ajouté ni de couleur changée, pas de déformation. Il faut une marge libre égale à la moitié de la goutte. Sur un fond clair, on garde le logo tel quel, car la goutte et l'or tiennent sur le parchemin.

Autres pistes envisagées et écartées :
1. **Une plume en orbite.** Joli, mais trop fin à 24 px et trop proche des logos de « littérature ».
2. **Un livre ouvert sous un anneau d'étoiles.** Très « conte », mais illisible en favicon, et le livre ouvert est banal.
3. **La goutte et son orbite (retenue).** C'est une silhouette simple et unique, qui fonctionne de 16 à 512 px et relie directement les deux mots du nom.

## Symboles des encres (`#ink-*`)

Ce sont des dessins originaux en couleur pleine, sans cadre hexagonal :

- Ambre : un éclat de soleil à 8 branches.
- Améthyste : un croissant de lune et une étincelle.
- Émeraude : une feuille.
- Rubis : une flamme.
- Saphir : une goutte traversée d'une vague.
- Acier : un bouclier.
- `#i-inkwell` (encrable) : un encrier rond et sa plume, et non l'hexagone du jeu.

## Classes décoratives (`da-`)

- `.da-sky` : un ciel étoilé en CSS pur (deux couches d'étoiles, scintillement lent). Les étoiles sont éteintes en Parchemin.
- `.da-spark` : une étincelle à quatre branches.
- `.da-rule` : un filet doré, avec un losange (`<i></i>`) ou un intitulé (`<span>`) au centre.
- `.da-frame` : un cadre filigrane, avec un liseré doré dégradé, un filet intérieur et des points aux coins. On le réserve à la valeur de la collection et aux encarts mis en avant.
- `.da-ink[data-ink]` : un halo d'aquarelle derrière un contenu.
- `.da-pip[data-ink]` : une pastille d'encre.
- `.da-title` : un titre en Fraunces doux.

## Ce qu'on s'interdit (cadre légal)

- Le logo Disney Lorcana, le logo Disney, la police officielle du jeu, les symboles officiels des encres et l'hexagone d'encrier.
- Les personnages Disney ou les illustrations de cartes dans l'identité : logo, icône, visuels de présentation, publicité. Les images de cartes n'apparaissent que dans l'appli, comme des cartes, avec la mention de la source (Lorcast).
- « Disney » ou « Lorcana » dans le nom ou l'icône. « Pour Disney Lorcana » ne peut figurer que dans une description.
- Toute présentation qui ferait croire à une appli officielle. La mention de fan non officielle accompagne toujours l'identité.
