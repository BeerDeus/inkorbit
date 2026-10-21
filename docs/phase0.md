# Phase 0 : ce qu'il faut savoir avant de coder (21 octobre 2026)

Ce rapport est pour Martin. Tout a été vérifié par de vraies requêtes le 21/10/2026.

Décision déjà prise : **PWA seulement**, pas d'appli Android, **pas de serveur au départ**. Le site est statique, dans `public/` ; les données du jour sont produites par GitHub Actions.

## 1. Nettoyage de la copie de Mana Orbit

- La copie a été **déplacée hors du projet**, dans le scratchpad de la session. Elle sert de référence en lecture seule. Le dossier « Ink Orbit » est reparti de zéro, avec son propre dépôt git.
- `android-app/` (environ 500 Mo) et `.idea/` ont été supprimés.
- Fichiers et valeurs propres à Mana Orbit trouvés dans la copie (aucun n'est repris) :
  - les APK et AAB compilés, et les valeurs Firebase générées (clé d'API dans `values.xml`) dans `android-app/android/app/build/…` et `android-app/android/app/release/app-release.aab` ;
  - la clé d'API web Firebase, le projet `m2s-mtg`, `messagingSenderId` et `appId` dans `src/cloud.js` ;
  - les identifiants AdMob (`ca-app-pub-…`) dans `proxy.mjs` et `src/ads.js` ;
  - le domaine `manaorbit.app` (et `card.m2s-photo.fr`) un peu partout, et le paquet `app.manaorbit` ;
  - le générateur de clés VAPID (`gen-vapid.mjs`), l'empreinte de l'e-mail administrateur et les empreintes de signature (App Links) dans `proxy.mjs`.
- **Aucun** `google-services.json`, `.env`, `.jks`, `.keystore` ni dossier `.data/` n'était présent dans la copie.
- Seul fichier repris tel quel : `src/qr.js`, l'encodeur de QR code, qui est générique. Son test vient aussi de Mana Orbit.

## 2. Données des cartes

| Critère | LorcanaJSON | Lorcast | lorcana-api.com |
|---|---|---|---|
| Dernier set | 14 « Hyperia City » (le 15 et le 16 sont annoncés, sans cartes) | 14 | 13 (en retard) |
| Langues | EN, FR à jour ; DE, IT en retard sur le set 14 (111 cartes) ; pas de JA ni de ZH | EN | EN |
| Noms traduits | Oui, avec le même `id` dans chaque langue | Non | Non |
| Images | 1468×2048 et 367×512 en JPG, sur le serveur de l'appli officielle (`api.lorcana.ravensburger.com`) | AVIF 146 / 488 / 674 px + JPG complet, CDN `cards.lorcast.io` | PNG |
| Prix | Non, mais les identifiants Cardmarket et TCGplayer sont là | USD seulement | Non |
| Fichier complet | Oui, environ 10 Mo par langue | Non (26 appels, ~10 requêtes/s au plus) | Partiel |
| Licence | Code MIT, données sous la tolérance de Ravensburger | Idem | ? |

- **Choix : LorcanaJSON** pour le catalogue, joint par `id` entre EN, FR, DE et IT, et **Lorcast pour les images**, joint par extension et numéro imprimé.
- **Fait** : `gen-cards.mjs` produit `public/data/cards.json` (318 Ko) et `cards-<langue>.json` (760 à 930 Ko avant compression).
  - Couverture : 3 556 cartes et 17 extensions (1 à 14, Q1 à Q3).
  - 3 448 cartes ont une image Lorcast. Les 108 autres, surtout les quêtes Q1 et Q2 que Lorcast n'a pas, utilisent la miniature LorcanaJSON en secours.
  - Une carte absente d'une langue (promos anglaises, set 14 en DE/IT) prend le texte anglais.
- Raretés : Common, Uncommon, Rare, Super Rare, Legendary, Epic, Enchanted, Iconic, Special (promos).
- Les promos gardent l'extension mère (`setCode`) et leur groupe dans `promoGrouping` (P1, P2, C1, D23…).

## 3. Prix

- **EUR : guide public de Cardmarket**, jeu 19 = Lorcana.
  - Fichier : `downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_19.json`, 3 983 entrées, régénéré chaque nuit.
  - On prend le prix tendance, puis la moyenne sur 7 jours. Un 0 compte comme « pas de prix ».
  - ⚠ **Les conditions d'utilisation n'ont pas été trouvées** : cardmarket.com refuse les robots. Voir la décision n° 2 plus bas.
- **USD : TCGplayer via tcgcsv.com**, catégorie 71. On prend `marketPrice` en Normal et en Cold Foil ou Holofoil. La FAQ de tcgcsv dit « Permission is implicit », avec un User-Agent identifiable.
- **Jointure** par les identifiants `externalLinks` de LorcanaJSON. Une carte sans identifiant (set tout neuf) est rapprochée de TCGplayer par extension et numéro.
- **Fait** : `gen-prices.mjs` produit `public/data/prices.json` (71 Ko).
  - 3 501 cartes sur 3 556 ont un prix.
  - Le set 14 a ses prix USD (240 cartes sur 242) mais pas encore d'EUR, faute d'identifiants Cardmarket dans LorcanaJSON. Ce sera rattrapé à sa prochaine mise à jour.
  - Garde-fou : si moins de 2 000 cartes ont un prix, rien n'est écrit et le fichier de la veille reste.
- Contrôle croisé : Elsa Spirit of Winter (set 1 n°42) vaut 2,60 € / 53,45 € en foil chez Cardmarket, et 4,73 $ / 66,98 $ chez TCGplayer. Les ordres de grandeur sont cohérents.
- Lorcast n'apporte rien de plus que tcgcsv pour l'USD : mêmes valeurs. JustTCG est inutile, et son offre gratuite interdit l'usage commercial.

## 4. Cadre légal (Disney et Ravensburger)

- Le **Community Code** de Ravensburger (cdn.ravensburger.com/lorcana/community-code-fr) ne parle que du comportement des joueurs : triche, harcèlement, contrefaçon. **Il n'existe pas de « politique de contenu de fan » officielle.**
- Les mentions légales de disneylorcana.com interdisent toute réutilisation, sans exception pour les fans.
- En pratique, la communauté (Lorcast, Dreamborn, LorcanaJSON, lorcana.gg) affiche toute le même avertissement, calqué sur la politique de Wizards. C'est une **tolérance de fait**, pas une licence.
  - Ce qui est toléré : noms et images des cartes, deck builders, collections, scan, liens affiliés (Dreamborn en a).
  - Ce qui est risqué : faire payer, laisser croire à une affiliation, utiliser le logo, proposer un simulateur jouable.
- **Pixelborn** : en mai 2024, Disney a demandé l'arrêt, effectif le 16/06/2024. C'était un simulateur jouable, et la demande visait la copie des cartes et toute affiliation suggérée. **Aucun gestionnaire de collection n'a été retiré** à notre connaissance.
- L'appli officielle « Disney Lorcana » fait déjà collection, decks et compteur de lore. Il ne faut jamais qu'on puisse la confondre avec Ink Orbit.
- Ce qu'on applique :
  - nom sans « Disney » ni « Lorcana », logo et icône 100 % originaux, aucune police officielle ;
  - « pour Disney Lorcana » seulement dans la description ;
  - **gratuit, sans pub ni abonnement**, pas de jeu en ligne ;
  - l'avertissement dans le pied de page, dans Réglages › À propos et dans `legal.html` ;
  - retrait immédiat sur simple demande.

## 5. Decks populaires

- Il n'y a ni API ni conditions claires : inkdecks.com bloque les robots (403), lorcana.gg réserve tous les droits, Dreamborn et melee.gg n'ont pas d'API publique. Limitless a une API, mais aucun tournoi Lorcana.
- **Recommandation : seulement les decks de l'utilisateur**, plus :
  - l'import d'une decklist collée, au format « 4 Elsa - Snow Queen » ;
  - des liens sortants vers les pages méta d'inkdecks et de lorcana.gg, sans rien aspirer.

## 6. Import CSV

- **Dreamborn** : `Set Number,Card Number,Variant,Count,Name,Color,Rarity`. Set Number est complété par des zéros, Card Number peut valoir « 4a » ou « 57/P3 ».
- **TCGplayer** : `Product ID, TCGplayer Id, Product Name, Set Name, Number, Rarity, Condition, Printing, Add to Quantity, …`. La quantité est dans « Add to Quantity ».
- Lorcanito, l'appli officielle et Dragon Shield n'ont pas d'export documenté.
- Plan : un seul lecteur qui reconnaît les colonnes par leur en-tête, puis rapproche chaque ligne par extension et numéro, et par le nom en dernier recours. On demandera des fichiers d'exemple aux utilisateurs.

## 7. Fonctions de Mana Orbit → Ink Orbit

Effort : S (moins d'une journée), M (1 à 3 jours), L (plus).

| Fonction Mana Orbit | Décision | Ce qui change pour Lorcana | Effort |
|---|---|---|---|
| Collection (liste, recherche, filtres, stats) | Adapter | Encres, raretés Lorcana, foil, langue de la carte | M |
| Ajout manuel (lot, choix de l'édition) | Adapter | Une impression = une carte (`id`) : bien plus simple | S |
| Import / export CSV | Adapter | Dreamborn, TCGplayer, format maison | S |
| Valeur et courbe | Garder | EUR ou USD au choix | S |
| Liste d'échange, souhaits | Adapter | Doublons au-delà de N exemplaires (4 par défaut) | S |
| Page publique et QR code | Adapter | Lien autonome compressé (`?p=`), sans Firestore | M |
| Classeur 3×3 | Garder | — | S |
| Masterset par extension | Adapter | Base 1 à 204, puis Enchantées, Épiques, Iconiques | M |
| Scan (OCR) | Adapter, en plus simple | Ligne du bas « 12/204 • FR • 3 », puis le nom en secours | L |
| Carte mystère du jour | Adapter | Tirage local et reproductible, sans classement serveur | M |
| Compteur de partie | Adapter | Compteur de lore 0 → 20, en 1 contre 1 surtout | S |
| Decks (création, import, prix) | Adapter | 60 cartes, 1 ou 2 encres, 4 exemplaires au plus | M |
| Carte en grand, navigation, visite guidée | Adapter | Visite guidée plus tard | S |
| PWA (service worker, installation, hors ligne) | Garder | — | S |
| Langues (`T()`, `TN()`, dictionnaires) | Garder | FR + EN d'abord, DE et IT ensuite | S |
| Comptes et synchro (Firebase) | Plus tard | Firebase créé par Martin | M |
| Amis, échange en direct, notifications | Plus tard | Demande un serveur | L |
| Decks EDHREC, Commander, symboles de mana, Scryfall, CardTrader | Retirer | — | — |
| Widgets, AdMob, FCM, APK, App Links | Retirer | PWA seulement | — |
| Administration, scans signalés, mode streamer, niveaux et badges | Retirer en V1 | Demande un serveur, ou n'est pas prioritaire | — |

## 8. Architecture

- Même principe que Mana Orbit : une seule page assemblée par `node build.mjs` (`src/*` → `public/index.html`, versionnée), du JS concaténé sans dépendance, et les textes en `T()` avec `src/i18n/`.
- Le contrat commun est dans `docs/contrat.md`.
- Pas de `proxy.mjs`. `serve.mjs` est un petit serveur statique pour le développement et les tests. En production, n'importe quel hébergeur statique fait l'affaire.
- Ordre de construction :
  1. `gen-cards.mjs` et `gen-prices.mjs` (**faits**) ;
  2. thème et icônes, coque de l'appli (téléphone puis ordinateur), PWA ;
  3. `core.js` (logique pure testée sous Node) et `data.js` (catalogue, noms traduits, prix, images) ;
  4. catalogue et prix ;
  5. collection (recherche, ajout manuel, import) ;
  6. scan ;
  7. échange (QR, page publique) ;
  8. valeur ;
  9. classeur ;
  10. masterset ;
  11. compteur de lore ;
  12. carte mystère ;
  13. decks.
- Ce qui est repris tel quel : la structure du build, le système de langues, `qr.js`, le principe du service worker (copie hors ligne, « Recharger ») et la forme des tests (`run-tests.sh`, `node:test`, Playwright).
- Ce qui est réécrit : la couche de données (LorcanaJSON au lieu de Scryfall), les prix, le scan (une seule ligne à lire au lieu de symboles et d'illustrations), et toute l'interface.

## 9. Nom et domaine

Vérification RDAP du 21/10/2026, et recherche web des conflits de nom :

| Nom | .app | .com | .fr | Conflit de nom |
|---|---|---|---|---|
| **Ink Orbit** | pris le **15/10/2026** chez Cloudflare (par toi ?) | pris depuis 2009 (GoDaddy) | **libre** | Aucun. Il existe « InkOrb », une appli de peinture sur F-Droid |
| Lore Orbit | libre | libre | — | Aucun |
| Glimmer Orbit | libre | libre | — | Aucun, mais « glimmer » est un terme du jeu |
| Inkbound | pris | — | — | `inkboundapp.com` pris aussi ; écarté |

`inkorbit.net` est libre aussi. Le Play Store n'est pas concerné, puisqu'il n'y a pas d'appli Android.

## 10. Décisions pour Martin

1. **Nom et domaine**
   - a) Ink Orbit sur `inkorbit.app`, si c'est toi qui l'as enregistré le 15/10, sinon sur `inkorbit.fr` (libre) ;
   - b) Lore Orbit (`loreorbit.app` et `.com` libres) ;
   - c) Glimmer Orbit.
   - **Recommandation : a.** Le nom évoque l'encre du jeu sans le nommer, et reste cohérent avec Mana Orbit.
2. **Prix en euros (Cardmarket, conditions inconnues)**
   - a) les afficher avec « Prix indicatifs : Cardmarket » et un lien vers la fiche, et écrire au support de Cardmarket pour confirmer ;
   - b) USD seulement (tcgcsv, autorisé) ;
   - c) EUR seulement après accord écrit.
   - **Recommandation : a.** L'EUR est indispensable pour un public français. On ne copie que trois champs par carte, et on coupe au premier refus.
3. **Images des cartes**
   - a) Lorcast (CDN prévu pour les sites tiers, EN seulement), et LorcanaJSON en secours ;
   - b) les images du serveur officiel via LorcanaJSON, dans la langue de la carte ;
   - c) un réglage pour choisir.
   - **Recommandation : a.** On évite de dépendre du serveur de Ravensburger, quitte à ajouter c plus tard.
4. **Monétisation**
   - a) rien, l'appli reste gratuite ;
   - b) liens affiliés Cardmarket ou TCGplayer plus tard ;
   - c) des dons.
   - **Recommandation : a** pour la V1. On pourra revoir b, comme Dreamborn, une fois l'appli établie.
5. **Decks à monter**
   - a) seulement les decks de l'utilisateur, avec import et liens sortants ;
   - b) quelques decklists de tournoi saisies à la main, avec leur source.
   - **Recommandation : a.**
6. **Comptes et synchro**
   - a) plus tard, avec un projet Firebase que tu crées (Auth Google et Firestore, comme Mana Orbit) ;
   - b) jamais : sauvegarde par fichier seulement.
   - **Recommandation : a, après la V1.** En attendant, export et import d'une sauvegarde.

## Sources

[lorcanajson.org](https://lorcanajson.org/) · [Lorcast API](https://lorcast.com/docs/api) · [tcgcsv FAQ](https://tcgcsv.com/faq) · [Community Code](https://cdn.ravensburger.com/lorcana/community-code-fr) · [Mentions légales disneylorcana.com](https://www.disneylorcana.com/en-US/legal-notice) · [Pixelborn (lorcana.gg)](https://lorcana.gg/pixelborn-ends-disney-lorcana-support/) · [Pixelborn (Wargamer)](https://www.wargamer.com/disney-lorcana/pixelborn-shut-down) · [Avertissement Dreamborn](https://dreamborn.ink/disclaimer) · [Format CSV Dreamborn](https://github.com/Doberjohn/inkweave/issues/553) · [InkOrb (F-Droid)](https://f-droid.org/packages/com.wian.inkorb/)
