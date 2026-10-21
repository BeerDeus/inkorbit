# Ink Orbit

Appli de fan gratuite et non officielle pour le jeu de cartes Disney Lorcana. Elle gère la collection, les decks, la valeur des cartes, l'échange par QR code, le masterset, le compteur de lore et la carte mystère du jour. C'est une **PWA** : un site qui s'installe sur le téléphone et marche hors ligne, sans appli Android et sans serveur.

Le code est décrit dans `DEV.md`. Le rapport d'avant-projet (sources, cadre légal, décisions) est dans `docs/phase0.md`.

> Ink Orbit est une application de fan gratuite et non officielle. Elle n'est ni publiée, ni approuvée, ni soutenue par Disney ou Ravensburger. Disney Lorcana © Disney ; jeu édité par Ravensburger.

## Ce qui est en ligne

Tout le site est le dossier `public/`, servi tel quel :

| Fichier | Rôle |
|---|---|
| `index.html` | L'appli. Elle est assemblée par `node build.mjs` et **commitée** : l'hébergeur ne lance aucun build |
| `sw.js`, `manifest.webmanifest`, `icons/` | Installation et fonctionnement hors ligne |
| `data/cards.json`, `data/cards-<langue>.json` | Catalogue des cartes, régénéré chaque jour |
| `data/prices.json` | Prix du jour en euros et en dollars |
| `legal.html`, `privacy.html`, `robots.txt` | Mentions légales et confidentialité |

Les données de l'utilisateur (collection, decks, réglages) restent **sur son appareil** (localStorage). Il n'y a ni compte ni serveur. Une sauvegarde par fichier est proposée dans Réglages.

## Données du jour

Le workflow `.github/workflows/data.yml` tourne chaque jour à 04:00 UTC, et aussi à la demande (onglet Actions › Données › Run workflow). Il enchaîne :

1. `node gen-cards.mjs` : le catalogue, depuis LorcanaJSON (EN, FR, DE, IT) avec les images de Lorcast.
2. `node gen-prices.mjs` : les prix, depuis Cardmarket (euros) et TCGplayer via tcgcsv (dollars). Si trop peu de cartes ont un prix, le fichier de la veille est gardé.
3. Un commit de `public/data/` s'il a changé.

## Mise en ligne (étapes pour Martin)

1. **Dépôt GitHub** : crée-le, puis pousse le code (`git remote add origin …`, puis `git push -u origin main`).
2. **Droits du workflow de données** : Settings › Actions › General › Workflow permissions › « Read and write permissions ». Lance-le une fois à la main pour vérifier.
3. **Hébergement**, au choix :
   - **Cloudflare Pages** (recommandé : HTTPS, compression, cache mondial) :
     - Workers & Pages › Create › Pages › Connect to Git, et choisis le dépôt ;
     - Build command : vide. Build output directory : `public` ;
     - chaque push, y compris celui des données du jour, publie le site.
   - **GitHub Pages** : Settings › Pages › Source « GitHub Actions », avec un petit workflow qui publie `public/` (`actions/upload-pages-artifact` puis `actions/deploy-pages`) : GitHub Pages ne sait pas servir directement un dossier `public/`.
4. **Domaine** : voir `docs/phase0.md` › Nom et domaine (`inkorbit.app` a été enregistré le 15/10/2026 chez Cloudflare ; `inkorbit.fr` est libre).
   - Si le domaine est chez Cloudflare : Pages › Custom domains › Set up a domain.
   - Le site doit être en HTTPS : sans HTTPS, pas d'installation ni de mode hors ligne.
5. **Contact** : complète l'adresse de contact dans `public/legal.html`.

## Lancer en local

    node gen-cards.mjs && node gen-prices.mjs      # données (déjà commitées : facultatif)
    node build.mjs                                 # → public/index.html
    node serve.mjs                                 # → http://localhost:8790/

## Crédits

- Données : [LorcanaJSON](https://lorcanajson.org/)
- Images : [Lorcast](https://lorcast.com/)
- Prix : [Cardmarket](https://www.cardmarket.com/) et TCGplayer, via [tcgcsv](https://tcgcsv.com/)
- Polices : Fraunces et Nunito Sans (SIL Open Font License)
