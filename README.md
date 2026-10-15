# Tableau Clair

Cartographie de tableaux électriques DIN : composition réelle sur rail, circuits alimentés, plan du logement.

- Spécification : [docs/SPEC.md](docs/SPEC.md)
- Tickets : [docs/issues/](docs/issues/) (création sur GitHub : `scripts/create-issues.sh`)

## Prérequis

- Node.js 24 (voir `.nvmrc`)
- [pnpm](https://pnpm.io) 10 (`corepack enable` suffit)

## Démarrer en local

```bash
docker compose up -d   # postgres, minio (bucket créé), mailpit
pnpm install
pnpm dev               # API sur :6001, web sur :6002 (proxy /api → API)
```

Aucune configuration n'est nécessaire en local : l'API lit `.env.example` (valeurs adaptées au
`docker compose` de dev), puis `.env` s'il existe et le surcharge. Créez un `.env` pour changer un
port ou renseigner `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`. Les migrations sont appliquées au
démarrage de l'API.

Services de développement :

| Service  | URL / port                                      |
| -------- | ----------------------------------------------- |
| Postgres | `localhost:6010` (`tableau` / `tableau`)        |
| MinIO    | S3 `localhost:6020`, console `:6021`            |
| Mailpit  | interface `http://localhost:6031`, SMTP `:6030` |

Tous les ports de développement sont dans la plage **6000–6100**, pour ne pas entrer en conflit avec
d'autres projets. Évitez 6000 (bloqué par Chrome, Edge et Brave : `ERR_UNSAFE_PORT`), 6566 et 6665–6669 :

| Port        | Service                                                 |
| ----------- | ------------------------------------------------------- |
| 6002        | Web (Vite ; échoue plutôt que de prendre un autre port) |
| 6001        | API                                                     |
| 6010        | PostgreSQL                                              |
| 6020 / 6021 | MinIO (S3 / console)                                    |
| 6030 / 6031 | Mailpit (SMTP / interface)                              |

Ils se changent dans `.env` (`POSTGRES_PORT`, `S3_PORT`, `S3_CONSOLE_PORT`, `SMTP_PORT`,
`MAILPIT_UI_PORT`). Les tests d'intégration utilisent les mêmes ports (`TEST_DATABASE_URL`,
`TEST_S3_ENDPOINT` pour les surcharger). En production, seuls 80 et 443 sont publiés par Caddy.

## Production

`docker-compose.prod.yml` lance l'application (l'API sert aussi le front), PostgreSQL et Caddy (HTTPS automatique). Le stockage objet est un S3 externe, configuré par les variables `S3_*`.

```bash
cp .env.example .env   # puis remplacer les valeurs marquées PROD
docker compose -f docker-compose.prod.yml up -d --build
```

## Base de données

Schéma Drizzle dans `packages/db/src/schema.ts`, migrations SQL versionnées dans `packages/db/drizzle/`
(la migration `integrity` porte les contraintes que le schéma déclaratif ne sait pas exprimer :
non-chevauchement, propriétaire minimum, versionnage).

```bash
pnpm --filter @tableau-clair/db db:generate   # nouvelle migration après un changement de schéma
pnpm --filter @tableau-clair/db db:migrate    # applique les migrations (DATABASE_URL)
pnpm --filter @tableau-clair/db db:seed       # données de démonstration (base vide uniquement)
```

L'API applique les migrations au démarrage. Les tests d'intégration créent une base jetable par
fichier sur le PostgreSQL de `docker compose up -d` (ou `TEST_DATABASE_URL`).

## Authentification

Sans mot de passe : lien magique par e-mail et Google (Apple en V1.1). Les inscriptions sont fermées :
seules les adresses de `ALLOWED_EMAILS` obtiennent un compte ou une session, quel que soit le
fournisseur ; une adresse refusée reçoit la même réponse qu'une adresse admise et le refus est journalisé.

- **Dev** : le lien magique arrive dans Mailpit (`http://localhost:6031`), l'URL du lien pointe sur `APP_URL`.
- **Google** : créer un client OAuth « Application Web » et déclarer l'URI de redirection
  `{APP_URL}/api/auth/callback/google`, puis renseigner `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
  Laissés vides, la connexion Google est simplement indisponible.
- **Production** : relais SMTP Brevo (`SMTP_HOST=smtp-relay.brevo.com`, port 587, identifiants SMTP Brevo)
  et domaine d'envoi authentifié (SPF, DKIM, DMARC). L'API refuse de démarrer avec le secret d'exemple
  ou une `APP_URL` en `http`.
- Routes : `/api/auth/*` (Better Auth) et `GET /api/me` (utilisateur courant, 401 sinon).

## API

Toutes les routes `/api/*` (hors santé et authentification) exigent une session. Les corps et réponses
sont décrits par les schémas Zod de `packages/contracts`.

| Méthode                | Route                                                                      | Rôle minimum      |
| ---------------------- | -------------------------------------------------------------------------- | ----------------- |
| `GET` `POST`           | `/api/properties`                                                          | membre / connecté |
| `GET` `PATCH`          | `/api/properties/:id`                                                      | membre / éditeur  |
| `DELETE`               | `/api/properties/:id`                                                      | propriétaire      |
| `GET`                  | `/api/properties/:id/overview` (fiabilité, dernière modification)          | membre            |
| `GET`                  | `/api/properties/:id/search?q=` (tableaux, appareils, pièces, équipements) | membre            |
| `GET` `POST`           | `/api/properties/:id/boards`                                               | membre / éditeur  |
| `GET` `PATCH` `DELETE` | `/api/boards/:id`                                                          | membre / éditeur  |
| `GET`                  | `/api/boards/:id/impact` (ce que la suppression retire et conserve)        | membre            |
| `POST`                 | `/api/boards/:id/duplicate` (corps facultatif : `{ name }`)                | éditeur           |
| `PATCH`                | `/api/rows/:id` (capacité)                                                 | éditeur           |
| `POST`                 | `/api/rows/:id/elements`                                                   | éditeur           |
| `GET` `PATCH` `DELETE` | `/api/elements/:id`                                                        | membre / éditeur  |
| `GET`                  | `/api/elements/:id/circuit` (équipements alimentés, par étage et pièce)    | membre            |
| `PUT` `DELETE`         | `/api/fixtures/:id/link` (relier / délier un équipement à un disjoncteur)  | éditeur           |
| `POST`                 | `/api/properties/:id/photos?usage=…` (corps = image)                       | éditeur           |
| `GET`                  | `/api/photos/:id` (métadonnées)                                            | membre            |
| `GET`                  | `/api/photos/:id/content` (302 vers URL signée)                            | membre            |
| `DELETE`               | `/api/photos/:id`                                                          | éditeur           |
| `GET`                  | `/api/account` (ce que la suppression du compte emporte)                   | connecté          |
| `GET`                  | `/api/account/export` (JSON complet : données, plan, liens des photos)     | connecté          |
| `DELETE`               | `/api/account` (corps `{ confirm: <e-mail> }`)                             | connecté          |

Conventions :

- **Recherche** : insensible à la casse et aux accents (extension PostgreSQL `unaccent`), 2 caractères
  minimum, 30 résultats au plus ; `%` et `_` sont cherchés comme du texte. Depuis un équipement du plan,
  le résultat indique le disjoncteur à couper (tableau, rangée, module) et le statut de la liaison.
- **404** pour toute ressource hors de ses logements (jamais 403 : on ne révèle pas son existence) ;
  **403** si le rôle est insuffisant.
- **409 `version_conflict`** : le `version` envoyé n'est plus le courant ; `details` contient l'état actuel.
- **422** : règle métier refusée (`overlap`, `out_of_bounds`, `row_not_empty`, `capacity_below_content`…),
  avec `details` exploitable par l'interface.
- Les écritures sur une rangée sont sérialisées (verrou de ligne) : deux ajouts simultanés au même
  emplacement ne peuvent pas réussir tous les deux.

### Ajout d'un appareil

Un module libre ouvre la feuille « Ajouter un appareil » : types standards avec leur largeur (grisés
quand ils ne tiennent pas dans l'espace restant), libellé, calibre, largeur bornée à l'espace libre,
photo facultative. « Autre appareil… » demande nom, rôle, marque, modèle / référence et modules ;
il peut être **enregistré comme modèle du compte** et réutilisé dans tous les logements
(« Mes modèles »). L'ajout entre dans l'historique : il s'annule et se rétablit.

### Plan du logement

Un plan par étage (onglets : ajout, renommage, ordre, suppression), dessiné en SVG dans un canevas de
1000 × 700 unités. Les règles de géométrie sont dans `packages/domain/src/plan.ts`, partagées par
le navigateur et le serveur :

- **Pièces** : rectangles tracés en mode « Dessiner une pièce », déplacés par glisser, redimensionnés
  par les poignées de coin (taille minimale 40, jamais hors du plan). Les équipements suivent leur
  pièce quand elle est déplacée, et sont ramenés dedans si elle rétrécit.
- **Équipements** : posés dans une pièce, depuis la palette (appui = au centre de la pièce active,
  glissé = là où on lâche) ou déplacés sur le plan. Hors de toute pièce, le dépôt est refusé.
- **Alternative au glisser** : flèches de déplacement fin et pas de taille, pour le clavier.
- **Image de fond** par étage : import, opacité, taille, verrouillage (déverrouillée, elle se déplace
  en la faisant glisser sur le plan). Remplacer ou retirer l'image supprime l'ancien fichier.
- **Circuit** : `?breaker=<id>` met en évidence les équipements d'un disjoncteur (anneau lime),
  les autres sont neutres, ceux sans disjoncteur sont en pointillés avec « ? ».

Hors périmètre de cet écran : lier un équipement à un disjoncteur (ticket « Liaisons »).

### Liaisons équipement ↔ disjoncteur

Un équipement n'a qu'**un seul** disjoncteur ; le relier à un autre remplace l'ancien lien. Chaque
liaison porte un statut **vérifiée / supposée / inconnue** (nouvelle liaison : supposée).

- **Depuis l'équipement** (fiche sur le plan) : choisir ou changer le disjoncteur, régler le statut,
  délier, voir le circuit. La photo du disjoncteur et sa position (tableau, rangée, module) s'affichent.
- **Depuis le disjoncteur** (fiche dans l'éditeur de rail) : équipements alimentés par étage puis par
  pièce, délier, lier un équipement du plan, « Voir sur le plan ».
- **Depuis une pièce** : disjoncteurs à couper et nombre d'équipements sans lien.
- Seul un élément de type disjoncteur du même logement peut alimenter un équipement (404 sinon pour
  un élément étranger, 422 `not_a_breaker` pour un autre type). Supprimer le disjoncteur laisse les
  équipements et passe leur liaison à « inconnue ».

### Édition du rail

Les actions de la feuille de détail (← →, changer de rangée, supprimer) sont validées localement par
les règles du package `domain`, appliquées au cache de manière optimiste, puis envoyées à l'API.
Les envois sont sérialisés (chacun avec la version à jour de l'élément) ; un échec ou un conflit
rétablit l'état précédent et l'indique. **Annuler / rétablir** (boutons, ou Ctrl/⌘+Z et
Ctrl/⌘+Maj+Z) conserve les 50 dernières actions de la session. Restaurer un élément supprimé le
recrée avec un nouvel identifiant : ses liaisons avec le plan restent « inconnues ».

## Photos et images de plan

Stockées dans un bucket S3 **privé** (MinIO en dev, S3 externe en production). Jamais servies sans
contrôle de droits : `GET /api/photos/:id/content` vérifie l'appartenance au logement puis redirige vers
une URL signée valable 5 minutes, utilisable directement dans une balise `<img>`.

- **Envoi** : corps binaire brut (`image/jpeg`, `image/png` ou `image/webp`, 15 Mo maximum) avec
  `?usage=board|element|fixture|floor_background`. Le contenu est vérifié sur le fichier lui-même, puis
  l'orientation EXIF est appliquée, **toutes les métadonnées sont supprimées** (géolocalisation comprise),
  l'image est réduite (1600 px, 3000 px pour une image de fond de plan) et ré-encodée en WebP.
- **Rattachement** : l'`id` de la photo se passe en `photoId` à la création ou modification d'un tableau,
  d'un élément (et plus tard d'un équipement ou d'un étage). Une photo d'un autre logement est refusée.
- **Suppression** : celle d'une photo ou d'un logement supprime aussi les fichiers.
- Compatibilité S3 : `S3_FORCE_PATH_STYLE=true` pour MinIO ; les sommes de contrôle automatiques du SDK
  sont désactivées (refusées par plusieurs S3 compatibles).

## Écrans et routes

| Route                      | Écran                                                                              | Accès                                                |
| -------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `/connexion`               | Connexion (lien magique, Google)                                                   | public ; redirige vers `/` si connecté               |
| `/`                        | Accueil : logement, fiabilité du repérage, tableaux, recherche                     | session requise, sinon redirection vers `/connexion` |
| `/tableaux`                | Liste des tableaux du logement actif                                               | session requise                                      |
| `/tableaux/nouveau`        | Création d'un tableau (nom, emplacement, photo, rangées, modules, notes)           | session requise                                      |
| `/tableaux/:id`            | Éditeur de rail : mobile (feuille de détail) et bureau (sidebar, palette, panneau) | session requise                                      |
| `/tableaux/:id/parametres` | Paramètres : modification, duplication, suppression                                | session requise                                      |
| `/plan`                    | Plan du logement par étage                                                         | session requise                                      |
| `/compte`                  | Compte : export JSON, déconnexion, suppression, mention RGPD                       | session requise                                      |
| `/verifier`                | À vérifier : liaisons supposées, équipements sans disjoncteur                      | session requise                                      |

Le front parle à l'API en same-origin (`/api/*`, proxy Vite en dev) via `apps/web/src/api/client.ts`.
Après une tentative échouée, le serveur renvoie sur `/connexion?error=…` (`INVALID_TOKEN`,
`access_denied`…) : les messages sont volontairement neutres et ne disent pas si une adresse existe.

## Design system

Tokens en variables CSS dans `apps/web/src/ui/tokens.css`, composants de base dans `apps/web/src/ui/`
(`Button`, `IconButton`, `TextField`, `StatusChip`, `TypeChip`, `Stepper`, `TabBar`, `BottomSheet`),
police Plus Jakarta Sans auto-hébergée (aucune requête vers Google Fonts).

- **Catalogue** : `pnpm dev` puis `http://localhost:6002/catalogue.html` (page interne, absente du build).
- **Accessibilité** : zones tactiles ≥ 44 px, focus visible, bouton-icône toujours nommé
  (`label` obligatoire), statut jamais porté par la couleur seule. Les paires texte / fond des tokens
  sont vérifiées AA par `tokens.test.ts`.
- **Écart avec les maquettes** : `--color-slot-border` passe de `#8e9ab8` (2,8:1 sur blanc) à `#8592b0`
  (3,1:1), seuil WCAG 1.4.11 pour un élément d'interface.

## Commandes

| Commande         | Rôle                                       |
| ---------------- | ------------------------------------------ |
| `pnpm dev`       | API et web en mode développement           |
| `pnpm lint`      | ESLint                                     |
| `pnpm format`    | Prettier (écriture) ; `format:check` en CI |
| `pnpm typecheck` | `tsc --noEmit` dans chaque paquet          |
| `pnpm test`      | Vitest dans chaque paquet                  |
| `pnpm build`     | Build de l'API (tsup) et du web (Vite)     |
| `pnpm check`     | Enchaîne tout ce que la CI exécute         |

## Organisation

```
apps/
  web/          React + Vite
  api/          Fastify
packages/
  domain/       règles métier pures (capacité, collisions, liaisons)
  contracts/    schémas Zod partagés front/back
  db/           schéma et migrations (à venir)
```

Les paquets de `packages/` sont consommés en TypeScript source (pas d'étape de build) : le web les résout via Vite, l'API les embarque via tsup.
Ils s'importent sous `@tableau-clair/<nom>`.

### Mode bureau (≥ 1024 px)

L'éditeur de rail s'adapte à la largeur (`useMediaQuery`, `DESKTOP_QUERY`) :

- **Sidebar** sombre à la place de la barre d'onglets, avec le badge « À vérifier » (liaisons à confirmer).
- **Barre d'outils** : recherche dans le tableau (Entrée sélectionne le premier résultat), annuler / rétablir.
- **Palette « Ajouter sur le rail »** : glisser un type sur un module libre, ou le choisir puis cliquer.
- **Glisser-déposer** d'un appareil sur un module libre (même rangée ou autre) ; refus avec message
  si l'emplacement ne convient pas, annulable comme les autres déplacements.
- **Rangées pleine largeur** (modules en `1fr`) et **panneau de détail à droite** ; sous 1280 px le
  panneau passe sous le contenu. Sous 1024 px, l'éditeur mobile (feuille basse, ← →) est inchangé.

### Compte et données personnelles

- **Export** : `GET /api/account/export` renvoie un JSON (compte, modèles personnalisés, et pour chaque
  logement ses tableaux, son plan avec les liaisons, ses photos). Les fichiers images sont référencés
  par `contentUrl` (accès avec session, redirection vers une URL signée).
- **Suppression** : l'adresse e-mail doit être retapée. Les logements dont la personne est la seule
  propriétaire sont supprimés avec leurs photos (base et S3) ; les autres logements sont conservés
  sans elle. Sessions, comptes liés, modèles personnalisés et jetons en attente partent avec.

### Conflits, états et hors ligne

- **Conflit d'édition** (`409`, `version` différente) : une feuille compare ma valeur et la version
  enregistrée champ par champ, sans fusion. « Garder ma version » renvoie avec la version enregistrée,
  « Recharger » l'abandonne, « Décider plus tard » ferme en laissant la version enregistrée affichée.
  Câblé sur le déplacement des appareils (rail) et sur la modification des équipements, pièces et étages.
- **États** : squelettes (`role="status"`, désactivés par `prefers-reduced-motion`), états vides à gabarit
  unique et erreurs avec « Réessayer » + sortie (`apps/web/src/ui/ScreenState.tsx`).
- **Échec d'enregistrement** : notification avec « Réessayer » ; l'état précédent est rétabli.
- **Session expirée** : la modification refusée (401) est gardée dans `localStorage`, la connexion est
  proposée, puis un bandeau offre de **réappliquer** ou d'ignorer (les versions périmées restent signalées).
- **PWA** : `public/manifest.webmanifest`, icônes, `public/sw.js` (coquille, ressources, **dernières
  lectures d'API**), invite d'installation (astuce iPhone) et bannière « Nouvelle version disponible ».
  Le service worker n'est enregistré qu'en production. Hors ligne : bandeau « lecture seule » avec
  l'heure du dernier état, actions d'édition retirées. La déconnexion et la suppression du compte
  vident les données gardées pour la lecture hors ligne.
