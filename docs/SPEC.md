# Tableau Clair — Spécification fonctionnelle et technique

> Statut : **v1.1 — maquettes intégrées** — 2026-10-14
> Tous les points ouverts des versions précédentes sont tranchés (voir §13). V1 en **compte unique**, inscriptions fermées, partage en V1.1. Les maquettes (8 écrans) sont résumées en §15 ; le découpage en tickets est dans `docs/issues/`.

## 1. Objectif

Application web permettant de documenter un ou plusieurs tableaux électriques résidentiels existants, de visualiser leur composition réelle sur rail DIN et d'identifier ce qu'alimente chaque disjoncteur, avec des données **centralisées en base** et **partageables avec d'autres personnes**.

Elle sert à la fois de :

- **repérage durable** (inventaire fiable, à jour, accessible depuis n'importe quel appareil) ;
- **aide au diagnostic** (« quel disjoncteur couper pour cette prise ? ») ;
- **support d'étiquetage** (mettre à jour les étiquettes physiques du tableau) ;
- **outil partagé** (conjoint, famille, locataire, électricien).

## 2. Décisions structurantes

| Sujet | Décision |
|---|---|
| Architecture | Application web (SPA) + **API backend** + **base PostgreSQL** + **stockage objet S3** pour les photos et images de plan. |
| Hébergement | **Serveur personnel, via Docker** (V1). **MinIO** en développement local, **S3 externe** en production. |
| Domaine | **`tableau-clair.fr`** uniquement. HTTPS obligatoire. |
| Authentification | **V1 : lien magique (e-mail) et Google.** Apple Sign-In en V1.1, dès que le compte Apple Developer est prêt. Pas de mot de passe. |
| E-mails | **Brevo** (compte existant), pour les liens magiques puis les invitations. |
| Inscription | **Fermée en V1** : liste d'adresses autorisées, contenant uniquement `martial@racomach.fr`. Toute autre adresse est refusée à la connexion. |
| Utilisateurs V1 | **Un seul compte.** Le modèle de données gère déjà les membres et rôles ; leur interface arrive en V1.1. |
| Unité de partage | Le **logement** : tableaux, plan, pièces, équipements et circuits sont partagés ensemble (V1.1). |
| Rôles | Propriétaire, éditeur, lecteur (voir §8). |
| Plan du logement | **Plan visuel par pièce**, un **plan par étage**, avec **image de fond optionnelle**. |
| Lien public / QR | Un lien de consultation en lecture seule **par tableau**, photos exclues. |
| Traçabilité | « Dernière modification par X, le … » (pas de journal détaillé en V1). |
| Design | Identité propre, **pas de DSFR**. Pistes explorées avec Claude Design. |
| Terminaux | **Mobile** devant le tableau (relevé, consultation, photos) et **desktop** pour la saisie. Responsive, tactile, installable (PWA). |
| Réseau | Connexion requise pour modifier. Consultation du dernier état vu possible hors-ligne (cache lecture seule). |
| Langue | Interface en français uniquement (textes centralisés pour une i18n éventuelle). |
| Langage | TypeScript strict, front et back, avec types partagés. |

## 3. Principes de conception

1. **Simplicité de maintenance** : une seule base de code TypeScript (monorepo), un seul service applicatif, une seule base, peu de dépendances.
2. **Les données de l'utilisateur lui appartiennent** : export complet (JSON) à tout moment, suppression de compte effective.
3. **Les types standards aident, ne contraignent pas** : toute valeur proposée par un modèle reste modifiable.
4. **L'incertitude est une donnée** : le statut *vérifiée / supposée / inconnue* est un citoyen de première classe.
5. **Utilisable doigts froids, devant un tableau, au téléphone** : grandes zones tactiles, saisie rapide, photos faciles.
6. **Le droit d'accès est vérifié côté serveur, toujours** : le client n'est jamais une frontière de sécurité.

## 4. Glossaire

- **Logement** : ensemble regroupant tableaux, étages, pièces et équipements. C'est l'unité de partage. Un logement peut être alimenté par plusieurs tableaux.
- **Tableau** : coffret électrique, composé de rangées.
- **Rangée** : un rail DIN, de capacité fixe en modules.
- **Module** : unité de largeur DIN (≈ 17,5 mm).
- **Élément** : appareil monté sur une rangée (disjoncteur, différentiel, parafoudre, emplacement libre…).
- **Circuit** : ensemble des équipements alimentés par un disjoncteur.
- **Étage** : niveau du logement, porteur d'un plan et d'une image de fond optionnelle.
- **Équipement** : prise, point lumineux, appareil dédié, etc. placé sur le plan.
- **Membre** : utilisateur ayant accès à un logement avec un rôle donné.

## 5. Modèle de données

Toutes les entités portent `id` (UUID), `createdAt`, `updatedAt`, `updatedBy` et `version` (entier incrémenté, pour la détection de conflits d'édition).

```ts
type Verification = 'verified' | 'assumed' | 'unknown';
type Role = 'owner' | 'editor' | 'viewer';
type AuthProvider = 'magic_link' | 'google' | 'apple';

interface User {                // Compte
  id; email; displayName?;
  // comptes liés (un utilisateur peut avoir plusieurs fournisseurs, rapprochés par e-mail vérifié)
}

interface Property {            // Logement
  id; name; address?; notes?;
}

interface Membership {          // Appartenance d'un utilisateur à un logement
  id; propertyId; userId; role: Role;
}

interface Invitation {          // Invitation en attente
  id; propertyId; email; role: Role;
  tokenHash; expiresAt; acceptedAt?; invitedBy;
}

interface ShareLink {           // Lien de consultation lecture seule d'un tableau (QR code)
  id; boardId;
  tokenHash; expiresAt?; revokedAt?;
  // photos toujours exclues en V1
}

interface Board {               // Tableau
  id; propertyId;
  name; location?; photoId?;
  rows: number; modulesPerRow: number;
  notes?;
}

interface Row {
  id; boardId; index: number;   // 0 = en haut
  capacity: number;             // par défaut Board.modulesPerRow
}

interface Element {             // Appareil sur rail
  id; rowId;
  position: number;             // module de départ, 0-indexé
  width: number;                // modules occupés (≥ 1)
  kind: ElementKind;            // voir §6
  label: string;                // « Prises cuisine »
  role?; brand?; model?; notes?; photoId?;
  outgoingCables?: number;
  cableSection?: number;        // mm²
  // Spécifique aux protections
  ratingA?: number;             // calibre
  poles?: 1 | 2 | 3 | 4;
  curve?: 'B' | 'C' | 'D';
  sensitivityMa?: number;       // différentiel
  rcdType?: 'AC' | 'A' | 'F' | 'B';
  protectedByRcdId?: string;    // différentiel en amont
}

interface Floor {               // Étage / niveau du plan
  id; propertyId;
  name: string; index: number;  // ordre d'affichage
  backgroundImageId?: string;   // image de fond optionnelle
  backgroundOpacity?: number;
  width: number; height: number; // dimensions du canevas
}

interface Room {                // Pièce du plan
  id; floorId;
  name;
  geometry: { x; y; w; h };
}

interface Fixture {             // Équipement sur le plan
  id; roomId;
  kind: FixtureKind;            // socket | light | appliance | zone | unknown
  label: string;
  x; y;
  notes?; photoId?;
}

interface Circuit {             // Lien équipement ↔ disjoncteur
  id; fixtureId; breakerId;     // breakerId → Element
  status: Verification;
  notes?;
}

interface Photo {               // Métadonnées ; le fichier est en stockage S3
  id; propertyId; objectKey; mimeType; width; height; sizeBytes;
  usage: 'board' | 'element' | 'fixture' | 'floor_background';
}
```

Règles d'intégrité (appliquées **côté serveur**, doublées côté client pour le retour immédiat) :

- Un élément ne peut pas dépasser `Row.capacity` ni chevaucher un autre élément de la même rangée.
- Supprimer un disjoncteur ne supprime pas ses équipements : les liens passent à **inconnu / à identifier** (confirmation demandée).
- Un équipement n'est relié qu'à **un seul** disjoncteur (décision V1).
- Toute lecture ou écriture est filtrée par appartenance au logement (§8).
- Un logement a toujours au moins un propriétaire.
- Un tableau n'a au plus qu'un lien de consultation actif ; en régénérer un révoque le précédent.

## 6. Types d'éléments standards

Chaque type fournit des valeurs par défaut (largeur, icône, champs affichés), toutes modifiables.

| Type | Largeur par défaut | Champs spécifiques |
|---|---|---|
| Interrupteur différentiel | 2 | calibre, sensibilité, type (AC/A/F/B), pôles |
| Disjoncteur divisionnaire | 1 | calibre, courbe, pôles, différentiel en amont |
| Contacteur heures pleines / creuses (chauffe-eau) | 1 | calibre, marque/modèle |
| Télérupteur | 1 | calibre |
| Parafoudre | 2 | type, pôles |
| Compteur / suivi de consommation | 2 | — |
| Module connecté (ex. Shelly) | 1 | marque, modèle, notes |
| Relais / contacteur modulaire | 1 | calibre |
| Emplacement libre / réserve | 1 | — |
| **Personnalisé** | libre | nom, rôle, marque, modèle/référence, modules (obligatoires) |

Les champs communs (libellé, rôle, marque, modèle, modules, câbles sortants, section, notes, photo) existent pour tous les types.

## 7. Fonctionnalités

### 7.1 Gestion des logements et tableaux
- Créer, renommer, supprimer un logement (propriétaire uniquement pour la suppression).
- Créer, renommer, dupliquer, supprimer un tableau ; renseigner nom, emplacement, photo, rangées, modules par rangée, notes.
- Modifier la géométrie après coup : réduire une rangée sous son occupation est refusé avec message explicite.

### 7.2 Éditeur de tableau (vue rail DIN)
- Rendu **à l'échelle** : chaque rangée = ligne de N modules, chaque élément = bloc de largeur proportionnelle.
- Ajouter depuis une palette ; déplacer par glisser-déposer (souris et tactile) ; redimensionner ; supprimer.
- **Collisions et dépassement** empêchés en direct ; occupation de chaque rangée affichée (« 18 / 24 modules »).
- Les emplacements libres sont visibles comme tels et comptent dans l'occupation.
- Sélection d'un élément → panneau de détail (champs §5, photo, circuits associés, « dernière modification par X »).
- Alternative au glisser-déposer sur mobile : boutons « ← → » et « déplacer vers la rangée ».
- Annuler / rétablir la dernière action.
- **Édition concurrente** : si un élément a été modifié par quelqu'un d'autre entre-temps (`version` différente), l'utilisateur est averti et choisit de garder sa version ou de recharger. Pas de co-édition temps réel en V1.

### 7.3 Éléments personnalisés
Création depuis la palette (« Autre appareil ») avec les 5 champs minimaux. Possibilité d'enregistrer le modèle personnalisé pour le réutiliser dans le compte.

### 7.4 Plan du logement
- **Un plan par étage** : onglets d'étages, ajout / renommage / réordonnancement / suppression.
- **Image de fond par étage** (photo d'un plan papier, export d'agent immobilier, croquis…) : import, réglage de l'opacité, repositionnement et mise à l'échelle ; verrouillable pour ne pas la déplacer par accident. Stockée sur S3.
- Dessiner des pièces (rectangles) par-dessus, les nommer, les déplacer et les redimensionner.
- Placer des équipements (prise, point lumineux, appareil dédié, zone, inconnu) par glisser-déposer depuis une palette.
- Chaque équipement doit pouvoir être relié à un disjoncteur depuis sa fiche, et inversement.
- Les équipements sans liaison sont signalés visuellement (« à identifier »).

### 7.5 Cartographie des circuits et recherche bidirectionnelle
- **Depuis un disjoncteur** : liste et surbrillance sur le plan des équipements qu'il alimente, par pièce et par étage.
- **Depuis une pièce, une prise ou un appareil** : disjoncteur à couper, avec libellé, position (tableau, rangée, module) et photo.
- Chaque liaison porte un statut **vérifiée / supposée / inconnue** (couleur + icône, jamais la couleur seule).
- Action rapide « Je viens de couper ce disjoncteur : qu'est-ce qui est tombé ? » pour passer une liaison de `supposée` à `vérifiée`.

### 7.6 Tableau de bord et suivi des vérifications
- Par tableau : occupation de chaque rangée, nombre d'éléments, éléments sans libellé.
- Liste « À vérifier » : liaisons supposées ou inconnues, disjoncteurs sans équipement, équipements sans disjoncteur.
- Recherche globale (libellé, pièce, marque, référence) dans les logements accessibles.

### 7.7 Partage et collaboration *(V1.1)*
En V1, l'unique compte est propriétaire de tous ses logements. Cette section est livrée en V1.1 ; le modèle de données (`Membership`, `Invitation`, rôles, droits §8) est en place dès la V1 pour éviter une migration lourde.

- **Une invitation acceptée ajoute l'adresse de l'invité à la liste des adresses autorisées** : c'est le seul moyen d'ouvrir l'accès à une autre personne tant que les inscriptions sont fermées.
- **Inviter par e-mail** avec un rôle ; l'invité accepte via un lien à durée limitée (le compte est créé par la connexion).
- Liste des membres, **changement de rôle**, **retrait d'un membre**, quitter un logement.
- Transfert de la propriété d'un logement.
- Chaque fiche indique **qui** l'a modifiée en dernier et **quand**.

### 7.8 Lien lecture seule, QR code et récapitulatif imprimable
- Le propriétaire génère, **pour un tableau**, un **lien de consultation** : page lecture seule, sans compte, avec composition du tableau et circuits alimentés.
- Le lien est un **jeton aléatoire non devinable**, **révocable** à tout moment, avec **expiration optionnelle**. **Les photos sont exclues** (y compris l'image de fond du plan).
- **QR code** généré à partir de ce lien, imprimable pour la porte du tableau.
- **Récapitulatif imprimable** (A4) : vue rail + tableau des circuits, avec le QR en pied de page.

> ⚠ Un lien ou QR public expose le repérage de l'installation électrique à toute personne qui le possède. Cet avertissement est affiché avant la création du lien.

### 7.9 Compte et données personnelles
- Connexion par lien magique ou Google (Apple en V1.1) ; déconnexion ; gestion des méthodes de connexion liées au compte.
- Export de toutes ses données (JSON + photos).
- Suppression du compte : le logement dont l'utilisateur est le seul propriétaire est supprimé après confirmation explicite, ou propriété transférée.

## 8. Droits d'accès

| Action | Lecteur | Éditeur | Propriétaire |
|---|:-:|:-:|:-:|
| Consulter le logement, tableaux, plan, circuits | ✓ | ✓ | ✓ |
| Modifier tableaux, éléments, étages, pièces, équipements, circuits, photos | | ✓ | ✓ |
| Créer / supprimer un tableau | | ✓ | ✓ |
| Inviter, changer les rôles, retirer un membre | | | ✓ |
| Créer / révoquer un lien lecture seule | | | ✓ |
| Supprimer le logement, transférer la propriété | | | ✓ |

Le lien lecture seule (§7.8) donne uniquement un droit de consultation, sans identité.

## 9. Authentification et sécurité

**Authentification**
- **Lien magique** envoyé par e-mail (usage unique, durée de vie courte, lié à la session qui l'a demandé).
- **Google** via OAuth 2.0 / OpenID Connect. **Apple** en V1.1 (compte Apple Developer, domaine vérifié, HTTPS).
- **Pas de mot de passe** stocké : pas de réinitialisation, pas de hachage à gérer.
- **Liste d'adresses autorisées** vérifiée **côté serveur** à chaque création de session, quel que soit le fournisseur : une adresse hors liste n'obtient ni compte ni session, et la réponse ne révèle pas si l'adresse existe.
- **Perte d'accès** : sans mot de passe, perdre sa boîte mail et son compte Google revient à perdre l'accès. Accepté pour la V1 ; le propriétaire du serveur peut rétablir l'accès en modifiant la configuration.
- **Rapprochement de comptes** : une même adresse vérifiée reliée à plusieurs fournisseurs correspond à un seul utilisateur. Les adresses relais d'Apple (« Masquer mon e-mail ») sont traitées comme des adresses distinctes.
- Sessions par cookie `HttpOnly`, `Secure`, `SameSite`, avec protection CSRF.
- Limitation du nombre de demandes de lien magique, de connexions et d'invitations, par adresse et par IP.
- Authentification à deux facteurs : sans objet avec ces méthodes, la sécurité repose sur les fournisseurs d'identité et la boîte mail.

**Inscriptions fermées**
- En V1 l'accès est restreint par une liste d'adresses autorisées (variable d'environnement), réduisant fortement la surface d'attaque. Le service reste exposé sur Internet : limitation de débit sur la demande de lien magique et sur les connexions, taille maximale des images, et journalisation des tentatives refusées.
- Si l'inscription est un jour ouverte à tous, il faudra ajouter : quotas par compte, anti-bots sur l'envoi de lien magique, interrupteur d'urgence.

**Autorisation**
- Chaque requête résout l'utilisateur, puis vérifie son rôle sur le logement visé (§8). Les identifiants UUID ne sont pas une protection.
- Les jetons d'invitation, de lien magique et de partage sont stockés **hachés** en base.

**Photos et images de plan**
- Stockées dans un bucket S3 **privé** ; accès par URL signée de courte durée après contrôle des droits.
- Validation du type et de la taille à l'envoi ; redimensionnement (≈ 1600 px pour les photos, davantage pour les plans) et suppression des métadonnées EXIF (dont la géolocalisation).

**Données personnelles (RGPD)**
- Données personnelles : e-mail, nom affiché, adresse du logement (optionnelle), photos du domicile.
- Mention d'information, droits d'accès / export / suppression assurés par §7.9.
- Aucun traceur tiers. Les seuls tiers : fournisseurs d'identité choisis par l'utilisateur et service d'envoi d'e-mails.

## 10. Exigences non fonctionnelles

- **Performance** : édition fluide jusqu'à 10 tableaux × 6 rangées × 24 modules et 300 équipements par logement sur un téléphone d'entrée de gamme ; réponses API usuelles < 300 ms.
- **Fiabilité** : **aucune sauvegarde automatisée en V1** (décision assumée). Le risque de perte (disque, erreur de manipulation) est atténué par l'**export JSON manuel** (§7.9) et les volumes Docker nommés. Une sauvegarde planifiée de la base, hors du serveur, est un **prérequis** de l'ouverture du partage (V1.1). Les images, sur S3 externe, ne sont pas concernées par la perte du serveur.
- **Accessibilité** : navigation clavier de l'éditeur, contrastes AA, statuts non portés par la seule couleur.
- **Mobile** : application installable (PWA) ; consultation du dernier état chargé sans réseau.
- **Observabilité** : journaux structurés, suivi d'erreurs, endpoint de santé.
- **Tests** : logique métier (collisions, capacité, liaisons, droits) couverte par des tests unitaires ; tests d'intégration API sur base réelle ; un parcours de bout en bout automatisé (connexion, invitation, partage).

## 11. Architecture technique proposée

Monorepo TypeScript, un seul déploiement applicatif.

| Domaine | Choix | Raison |
|---|---|---|
| Langage | TypeScript (strict) partout | Demandé ; types partagés front/back. |
| Front | **React** + **Vite**, éditeur en **SVG** | SPA simple ; un seul mode de rendu pour rail et plan. |
| API | **Fastify** (ou Hono) en REST/JSON | Léger, rapide, bien typé. |
| Contrat d'API | **Zod** partagé (validation + types) | Une seule source de vérité pour entrées/sorties. |
| Base de données | **PostgreSQL** | Relationnel adapté (tableaux → rangées → éléments → circuits), contraintes d'intégrité. |
| Accès base / migrations | **Drizzle ORM** (ou Kysely) | SQL explicite, migrations versionnées, bon typage. |
| Authentification | **Better Auth** (lien magique, Google ; Apple en V1.1) | Évite de réimplémenter sessions et OAuth ; fournisseurs supportés nativement. |
| Stockage objet | **S3-compatible** : **MinIO** en local, **S3 externe** en production (fournisseur à choisir) | Même API partout, URL signées ; les images sortent du serveur applicatif, ce qui réduit le risque de perte. |
| E-mails | **Brevo** (SMTP ou API) ; **Mailpit** en local | Liens magiques et invitations. Domaine d'envoi authentifié (SPF, DKIM, DMARC) sur `tableau-clair.fr`. |
| Déploiement | **Docker Compose** : `app`, `postgres`, reverse proxy (Caddy ou Traefik) avec HTTPS automatique | Maintenance minimale sur un serveur personnel. |
| CI | GitHub Actions : lint, `tsc`, tests, build de l'image | — |
| Tests | **Vitest**, **Playwright** | Standard Vite/TS. |
| QR code | `qrcode` (génération côté serveur ou client) | Léger. |

Organisation du code (indicative) :

```
apps/
  web/            # React + Vite
  api/            # Fastify
packages/
  domain/         # règles métier pures (collisions, capacité, liaisons, droits)
  contracts/      # schémas Zod, types partagés
  db/             # schéma, migrations
docker-compose.yml        # dev : postgres, minio, mailpit
docker-compose.prod.yml   # prod : app, postgres, proxy (S3 externe)
```

La logique métier est **pure** (sans dépendance à la base ni à React) : testable seule et exécutée à la fois dans le navigateur (retour immédiat) et sur le serveur (garantie).

## 12. Découpage proposé

**V1 — MVP mono-utilisateur**
1. Socle : monorepo, Docker Compose (dev et prod), reverse proxy HTTPS sur `tableau-clair.fr`, CI, base, stockage S3, e-mails Brevo.
2. Authentification (lien magique, Google) avec liste d'adresses autorisées ; logements.
3. Tableaux, rangées, éléments (types standards + personnalisé), contrôle de capacité côté serveur.
4. Éditeur rail DIN (glisser-déposer + alternative boutons), photos.
5. Étages, image de fond, pièces et équipements sur plan visuel, liaisons avec statuts.
6. Recherche dans les deux sens, liste « À vérifier », « dernière modification par X ».
7. Export JSON du compte, détection de conflits d'édition, limitation de débit.

**V1.1**
- Partage : invitations par e-mail, membres et rôles (§7.7).
- Lien de consultation par tableau, QR code et récapitulatif imprimable.
- Connexion avec Apple.
- Protections détaillées (différentiel associé, courbe, sensibilité, pôles) exploitées dans les vues.
- Sauvegardes planifiées de la base, **livrées avant l'ouverture du partage** (prérequis de la V1.1, pas une option).

**V2 / V3**
- Alertes de cohérence (section de câble vs calibre, etc.), formulées comme des aides et non comme une validation d'installation.
- Plusieurs disjoncteurs par équipement.
- Journal détaillé des modifications.
- Co-édition temps réel, mode hors-ligne en écriture.

## 13. Décisions

| Sujet | Décision |
|---|---|
| Hébergement | Serveur personnel, Docker Compose |
| Stockage objet | MinIO en dev, S3 externe en production |
| Domaine | `tableau-clair.fr` uniquement |
| Authentification V1 | Lien magique + Google ; Apple en V1.1 |
| E-mails | Brevo |
| Inscription | Fermée, liste d'adresses autorisées = `martial@racomach.fr` |
| Utilisateurs V1 | Un seul compte ; partage en V1.1 |
| Partage V1.1 | Une invitation acceptée ajoute l'adresse à la liste autorisée |
| Sauvegardes | Aucune automatisée en V1 (export JSON manuel) ; planifiées avant l'ouverture du partage |
| Perte d'accès | Acceptée en V1 |
| Équipement ↔ disjoncteurs | Un seul disjoncteur en V1 |
| Plans | Un plan par étage, image de fond en V1 |
| Lien public / QR | Un lien par tableau, sans photos |
| Traçabilité | « Dernière modification par X » |
| Design | Libre, pas de DSFR. **Direction figée par les maquettes** (§15) : bleu vif + lime, cartes très arrondies, Plus Jakarta Sans. Mode sombre non décidé. |
| Alertes de cohérence | V2 / V3 |
| Nom | « Tableau Clair », dépôt GitHub créé |

## 14. Prérequis avant de démarrer le front

- ~~Direction de design figée~~ : faite, voir §15. Reste à décider le mode sombre.
- Compte Brevo avec domaine `tableau-clair.fr` authentifié (SPF, DKIM, DMARC).
- Client OAuth Google configuré (URIs de redirection sur `tableau-clair.fr`).
- Fournisseur S3 externe choisi et bucket privé créé.
- Serveur : Docker, DNS et HTTPS opérationnels.

## 15. Design et maquettes

Maquettes : <https://claude.ai/artifact/XCVWg2AM1MRKCnHLmdte8A> (canevas Design, 8 écrans, **statiques** : les interactions décrites ici sont l'intention, pas encore prototypée).

### 15.1 Direction visuelle

Mobile d'abord (390 × 844), version bureau pour la saisie. Cartes très arrondies, bleu vif + lime, fond blanc, **pas de DSFR**. Police : **Plus Jakarta Sans** (400–800).

| Token | Valeur | Usage |
|---|---|---|
| `ink` | `#0D1B3D` | Texte, différentiels, contour de sélection, cartes d'alerte |
| `blue` | `#0F5BFF` | Action primaire, disjoncteurs, cartes tableau, onglet actif |
| `lime` | `#C5F26A` | Accent, élément sélectionné, action rapide, pastilles icône |
| `surface` | `#F1F4FA` | Cartes, champs, boutons secondaires |
| `bg-soft` | `#EAF0FE` | Fond de page bureau, écran de connexion |
| `muted` | `#56627F` | Texte secondaire (≥ 4,5:1 sur blanc et `surface`) |
| `module-other` | `#D5E1FF` | Contacteur, télérupteur, parafoudre, compteur |
| `slot-border` | `#8E9AB8` | Module libre (pointillés) |
| `status-verified` | fond `#D9F7A0`, texte `#1F4D00` | Statut « vérifiée » |
| `status-assumed` | fond `#FFE7CC`, texte `#7A3B00`, bordure `#B45309` | Statut « supposée » |
| `status-unknown` | fond `#E3E7F0`, texte `#0D1B3D` | Statut « inconnue » |

Rayons : cartes 22–28 px, boutons 14–18 px, pastilles 14 px, feuille basse 32 px. Zones tactiles ≥ 44 px. Ombre feuille / barre d'onglets : `0 8px 28px rgba(13,27,61,.14)`.

Accessibilité : un statut n'est **jamais** porté par la couleur seule (couleur + icône ✓ / ~ / ? + libellé) ; boutons-icônes avec `aria-label`, champs avec `<label>`, icônes décoratives `aria-hidden` ; couleurs de statut distinguables par la luminosité.

### 15.2 Rendu des éléments sur le rail (complète §6)

| Type | Largeur par défaut | Rendu |
|---|---|---|
| Différentiel | 2 | fond `ink`, texte blanc, calibre |
| Disjoncteur | 1 | fond `blue`, texte blanc, calibre + libellé vertical |
| Contacteur HC / télérupteur / parafoudre / compteur | 1–2 | fond `module-other`, sigle (HC, TL, PF, kWh) |
| Module connecté | 1 | fond blanc, bordure bleue 2 px, « S » |
| Réserve | 1 | pointillés `muted` + « rés. » (compte dans l'occupation) |
| Module libre | 1 | pointillés `slot-border`, « + n » |
| Sélectionné | — | fond `lime` + contour `ink` 3 px |

### 15.3 Composants

`StatusChip` · `TabBar` (mobile) · `SidebarNav` (bureau) · `BoardCard` · `RailRow` · `RailElement` · `FreeSlot` · `BottomSheet` · `TypeChip` · `Stepper` · `FixtureMarker` (`highlighted`, `linked`, `unlinked`) · `FloorTabs` · `SummaryCard` · `AlertCard`.

### 15.4 Écrans

| Écran | Contenu | Réf. |
|---|---|---|
| **Connexion** | E-mail + « Recevoir un lien magique » ; « Continuer avec Google » ; mention « inscriptions fermées ». | §9 |
| **Accueil** | Sélecteur de logement, recherche globale, carte de fiabilité du repérage (barre segmentée), liste des tableaux, carte d'alerte vers « À vérifier ». | §7.6 |
| **Éditeur rail (mobile)** | Une carte par rangée, **strip horizontal** (1 module = **44 px**), calibre en gros + libellé vertical, en-tête « x / 24 modules » ; feuille basse fixe pour l'élément sélectionné (← →, changer de rangée, ouvrir la fiche) ; chaque module libre est une case cliquable. | §7.2 |
| **Ajout d'un appareil** | Feuille basse : module choisi, espace disponible, type (chips avec largeur), libellé, calibre (10/16/20/32), largeur (stepper), « Ajouter au module N ». | §7.2, §7.3 |
| **Fiche disjoncteur** | Calibre / courbe / pôles, position, équipements alimentés avec `StatusChip`, action « Je viens de le couper : qu'est-ce qui est tombé ? », « Voir sur le plan », dernière modification. | §7.5 |
| **Plan** | Onglets d'étages, « + Équipement », bandeau du circuit sélectionné, pièces sur fond quadrillé (image de fond), équipements en surbrillance / autre circuit / à identifier, légende. | §7.4 |
| **À vérifier** | Bandeau « N liaisons à confirmer », filtres (Tout / Supposées / Sans lien), cartes avec actions rapides. | §7.6 |
| **Éditeur (bureau)** | Sidebar sombre, barre d'outils (recherche, annuler/rétablir, imprimer), palette, rangées pleine largeur (24 colonnes), panneau de détail à droite. Fluide : sidebar et panneau passent sous le contenu en largeur étroite. | §7.2 |
| **Paramètres du tableau** | Nom, emplacement, photo, steppers rangées / modules par rangée, notes ; occupation par rangée ; message de refus si réduction sous l'occupation ; actions Dupliquer et Supprimer ; barre fixe Annuler / Enregistrer. Version bureau : formulaire + aperçu de la réduction (zone hors rail hachurée), duplication (nom de la copie) et zone de suppression. | §7.1 |
| **Supprimer le tableau** | Feuille de confirmation : ce qui est supprimé (rangées, éléments, photo), ce qui est conservé (équipements du plan, liaisons passées à « inconnue »), export JSON préalable, saisie du nom pour activer le bouton danger. | §7.1, §5 |

Navigation : Connexion → Accueil ; Accueil → Tableaux → Éditeur → Paramètres du tableau → Supprimer ; Éditeur → (module libre → Ajout) | (élément → Fiche → Plan) ; Accueil → Plan ; Accueil → À vérifier → (Plan | Fiche). Barre d'onglets mobile : Accueil · Tableaux · Plan · À vérifier.

### 15.5 Règles de comportement issues des maquettes

- L'alternative au glisser-déposer sur mobile est la feuille de détail fixe (← →, changer de rangée) : c'est le mode d'édition **par défaut** sur mobile ; le glisser-déposer est réservé au bureau.
- Dans « Ajout », les types dont la largeur ne tient pas dans l'espace restant sont **grisés** ; un ajout qui dépasse la capacité ou chevauche est refusé.
- « Autre appareil… » ouvre le formulaire d'élément personnalisé (5 champs minimaux).
- Sur la connexion, une adresse refusée reçoit un message **neutre** qui ne révèle pas l'existence d'un compte.
- Réduire le nombre de modules par rangée **sous l'occupation maximale** d'une rangée est refusé : le stepper passe en erreur et un message cite la rangée et l'occupation (« Impossible de descendre sous 18 modules. La rangée 1 en occupe 18… »). Mêmes règles côté serveur (§5).
- La **duplication** copie rangées et éléments, **pas** les liaisons avec les équipements (un équipement n'a qu'un seul disjoncteur) ; le nom proposé est « <nom> (copie) ».
- La **suppression** ne supprime pas les équipements du plan : leurs liaisons passent à « inconnue » (§5). Elle exige la saisie du nom du tableau et propose l'export JSON ; le bouton reste désactivé tant que le nom ne correspond pas.

### 15.6 Reste à dessiner

- Suppression d'un disjoncteur avec équipements liés : confirmation « passent à inconnu » (§5).
- Conflit d'édition concurrente : garder ma version / recharger (§7.2).
- Formulaire « Autre appareil » et enregistrement du modèle personnalisé (§7.3).
- Fiche d'équipement sur le plan et liaison depuis l'équipement (§7.4) ; réglage de l'image de fond (opacité, verrouillage), dessin et redimensionnement des pièces, palette d'équipements.
- Photos : prise, aperçu (§9).
- Compte, export JSON, suppression de compte, mention RGPD (§7.9).
- États vide, chargement, erreur, hors-ligne ; états de la connexion (lien envoyé, refus, erreur réseau).
- V1.1 : lien lecture seule, QR, récapitulatif A4 (§7.8), membres et invitations (§7.7).
- Mode sombre (non décidé).
