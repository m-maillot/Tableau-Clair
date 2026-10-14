# Tableau Clair — Récapitulatif design (handoff)

Maquettes : https://claude.ai/artifact/XCVWg2AM1MRKCnHLmdte8A (canevas Design, 8 écrans).
Référence fonctionnelle : la spec v1.0 (§ cités ci-dessous). Ce document décrit **ce que montrent les maquettes** pour servir de base au découpage en issues et au développement du front (React + Vite, éditeur en SVG/DOM).

> Les maquettes sont statiques : les interactions décrites en « Comportement » sont l'intention, pas encore prototypée.

## 1. Direction visuelle

Mobile d'abord (390 × 844), version bureau pour la saisie. Cartes très arrondies, bleu vif + lime, fond blanc, pas de DSFR. Police : **Plus Jakarta Sans** (400–800).

### Tokens

| Token | Valeur | Usage |
|---|---|---|
| `ink` | `#0D1B3D` | Texte, différentiels, sélection (contour), cartes d'alerte |
| `blue` | `#0F5BFF` | Action primaire, disjoncteurs, cartes tableau, onglet actif |
| `lime` | `#C5F26A` | Accent, élément sélectionné, bouton d'action rapide, pastilles icône |
| `surface` | `#F1F4FA` | Cartes, champs, boutons secondaires |
| `bg-soft` | `#EAF0FE` | Fond de page bureau, écran de connexion |
| `muted` | `#56627F` | Texte secondaire (≥ 4.5:1 sur blanc et `surface`) |
| `module-other` | `#D5E1FF` | Contacteur, télérupteur, parafoudre, compteur |
| `slot-border` | `#8E9AB8` | Module libre (pointillés) |
| `status-verified` | fond `#D9F7A0`, texte `#1F4D00` | Statut « vérifiée » |
| `status-assumed` | fond `#FFE7CC`, texte `#7A3B00`, bordure `#B45309` | Statut « supposée » |
| `status-unknown` | fond `#E3E7F0`, texte `#0D1B3D` | Statut « inconnue » |

Rayons : cartes 22–28 px, boutons 14–18 px, pastilles 14 px, feuille basse 32 px. Zones tactiles ≥ 44 px.
Ombre feuille/barre d'onglets : `0 8px 28px rgba(13,27,61,.14)`.

### Règles d'accessibilité reflétées dans les maquettes
- Un statut n'est **jamais** porté par la couleur seule : couleur + icône (✓ / ~ / ?) + libellé (§7.5, §10).
- Boutons-icônes avec `aria-label`, champs avec `<label>`, icônes décoratives `aria-hidden`.
- Couleurs de statut distinguables par la luminosité (vert clair / orange / gris), pas par la teinte seule.

## 2. Composants à extraire

| Composant | Variantes / états | Écrans |
|---|---|---|
| `StatusChip` | `verified`, `assumed`, `unknown` ; icône + libellé | Fiche, À vérifier, Bureau |
| `TabBar` (mobile) | Accueil, Tableaux, Plan, À vérifier ; actif = bleu + gras | Tous écrans mobiles |
| `SidebarNav` (bureau) | Logement, nav, badge « À vérifier N », compte | Bureau |
| `BoardCard` | nom, emplacement, rangées, occupation | Accueil |
| `RailRow` | en-tête « Rangée N · x / 24 modules », strip scrollable | Éditeur, Bureau |
| `RailElement` | types ci-dessous ; états `default`, `selected` | Éditeur, Bureau |
| `FreeSlot` | module libre cliquable « + n » | Éditeur, Ajout, Bureau |
| `BottomSheet` | handle, titre, contenu, actions | Éditeur (détail), Ajout, Fiche |
| `TypeChip` | sélectionné / non ; indique la largeur (« · 2 ») | Ajout, Bureau (palette) |
| `Stepper` | − / valeur / + | Ajout (largeur) |
| `FixtureMarker` | `highlighted` (circuit sélectionné), `linked`, `unlinked` | Plan |
| `FloorTabs` | étages + ajout | Plan |
| `SummaryCard` | barre segmentée vérifié / supposé / inconnu | Accueil |
| `AlertCard` | icône lime + texte + action | Accueil, À vérifier |

### Types d'éléments sur le rail (§6)

| Type | Largeur par défaut | Rendu |
|---|---|---|
| Différentiel | 2 | fond `ink`, texte blanc, calibre |
| Disjoncteur | 1 | fond `blue`, texte blanc, calibre + libellé vertical |
| Contacteur HC / télérupteur / parafoudre / compteur | 1–2 | fond `module-other`, sigle (HC, TL, PF, kWh) |
| Module connecté | 1 | fond blanc, bordure bleue 2 px, « S » |
| Réserve | 1 | pointillés `muted` + « rés. » (compte dans l'occupation) |
| Module libre | 1 | pointillés `slot-border`, « + n » |
| Sélectionné | — | fond `lime` + contour `ink` 3 px |

## 3. Écrans

### 3.1 Connexion (`Connexion`)
Champ e-mail + « Recevoir un lien magique » ; « Continuer avec Google » ; mention « Accès sur invitation : les inscriptions sont fermées ». Pas de mot de passe (§9).
- À prévoir hors maquette : états « lien envoyé », « adresse refusée » (message neutre, ne révèle pas l'existence du compte), erreur réseau.

### 3.2 Accueil (`Main`)
Bonjour + sélecteur de logement, recherche globale (« Quelle prise ? Quel disjoncteur ? »), carte de fiabilité du repérage (vérifiés / à identifier + barre segmentée), liste des tableaux, carte d'alerte vers « À vérifier » (§7.6).

### 3.3 Éditeur rail DIN — mobile (`Editeur`) (§7.2)
- Une carte par rangée, **strip horizontal scrollable** : 1 module = **44 px** (cible tactile suffisante). Rendu proportionnel à la largeur.
- Chaque élément : calibre en gros + libellé en écriture verticale.
- En-tête de rangée : `x / 24 modules`.
- Zone des rangées scrollable verticalement ; **feuille basse fixe** pour l'élément sélectionné : ← →, « Changer de rangée », « Ouvrir la fiche » (alternative au glisser-déposer, §7.2).
- **Chaque module libre est une case séparée** cliquable → écran Ajout.
- Bouton Annuler (annuler / rétablir à compléter).

### 3.4 Ajouter un appareil (`Ajout`) (§7.2, §7.3)
Feuille basse ouverte depuis un module libre : rail avec le module choisi en surbrillance, « module N · M modules disponibles », choix du type (chips avec largeur), libellé, calibre (10/16/20/32), largeur (stepper), « Ajouter au module N ».
- Règles à appliquer : refuser ce qui dépasse la capacité ou chevauche (§5) ; griser les types dont la largeur ne tient pas dans l'espace restant (non dessiné).
- « Autre appareil… » ouvre le formulaire d'élément personnalisé (5 champs minimaux : nom, rôle, marque, modèle, modules — non dessiné).

### 3.5 Fiche disjoncteur (`Fiche`) (§7.5)
Carte modale : titre, calibre/courbe/pôles, position (tableau · rangée · module), liste des équipements alimentés avec `StatusChip`, action lime **« Je viens de le couper : qu'est-ce qui est tombé ? »**, « Voir sur le plan », « Dernière modification par X, le … ».

### 3.6 Plan du logement (`Plan`) (§7.4)
Onglets d'étages, bouton « + Équipement », bandeau du circuit sélectionné, plan (pièces rectangulaires sur fond quadrillé figurant l'image de fond), équipements : **en surbrillance** (bleu + anneau lime), **autre circuit** (bordure grise), **à identifier** (pointillés orange + « ? »). Légende en bas.
- À compléter : réglage image de fond (opacité, verrouillage), dessin/redimensionnement des pièces, palette d'équipements.

### 3.7 À vérifier (`Verifier`) (§7.6)
Bandeau « N liaisons à confirmer », filtres (Tout / Supposées / Sans lien), cartes : prise supposée (Confirmer / Voir sur le plan), prise sans disjoncteur (Choisir un disjoncteur), disjoncteur sans équipement (Je viens de le couper).

### 3.8 Éditeur — bureau (`Bureau`)
Sidebar sombre, barre d'outils (recherche, annuler/rétablir, « Imprimer le récapitulatif »), palette « Ajouter sur le rail », rangées pleine largeur (24 colonnes `1fr`, libellés verticaux), panneau de détail à droite (libellé, calibre, courbe, section, différentiel amont, équipements liés + statuts, Enregistrer, Voir sur le plan, traçabilité).
- Fluide : sidebar et panneau passent sous le contenu en largeur étroite.

## 4. Navigation

```
Connexion → Accueil
Accueil ── Tableaux → Éditeur ── module libre → Ajout → Éditeur
                          └─ élément → Fiche → Plan
        ── Plan
        ── À vérifier → (Plan | Fiche)
```
Barre d'onglets mobile : Accueil · Tableaux · Plan · À vérifier. Compte / export / déconnexion : à dessiner (§7.9).

## 5. Ce qui n'est pas encore dessiné

- Création / paramétrage d'un tableau (nom, emplacement, photo, rangées, modules par rangée), duplication, suppression avec confirmation (§7.1).
- Suppression d'un disjoncteur avec équipements liés → confirmation « passent à inconnu » (§5).
- Conflit d'édition concurrente (garder ma version / recharger) (§7.2).
- Formulaire « Autre appareil » et enregistrement du modèle personnalisé (§7.3).
- Fiche d'équipement sur le plan et liaison depuis l'équipement (§7.4).
- Photos (tableau, élément, équipement) : prise, aperçu, URL signées (§9).
- Lien lecture seule, QR, récapitulatif A4, avertissement avant création (§7.8, V1.1).
- Membres, invitations, rôles (§7.7, V1.1).
- Export JSON, suppression de compte, mention RGPD (§7.9).
- États vide / chargement / erreur / hors-ligne (consultation du dernier état, §10).
- Mode sombre (non décidé, §13).

## 6. Pistes de découpage en issues

1. **Fondations UI** : tokens (CSS variables), police, `TabBar`, `BottomSheet`, `StatusChip`, `TypeChip`, boutons/champs.
2. **Connexion** : écran + états lien envoyé / refus / erreur.
3. **Accueil** : résumé de fiabilité, liste des tableaux, carte d'alerte, recherche globale.
4. **Éditeur rail (lecture)** : `RailRow`/`RailElement`/`FreeSlot`, strips scrollables, occupation, sélection + feuille de détail.
5. **Éditeur rail (édition)** : déplacer ← →, changer de rangée, annuler/rétablir, règles capacité/collision (package `domain`).
6. **Ajout d'élément** : feuille Ajout, types standards, élément personnalisé, grisage des largeurs impossibles.
7. **Fiche disjoncteur + circuits** : liste d'équipements, statuts, action « Je viens de le couper ».
8. **Plan** : étages, pièces, équipements, surbrillance par circuit, « à identifier ».
9. **À vérifier** : listes filtrées + actions rapides.
10. **Version bureau** : layout fluide, palette, panneau de détail, glisser-déposer.
11. **Photos & export JSON**, **conflits d'édition**, **états vides/erreurs/hors-ligne**.
