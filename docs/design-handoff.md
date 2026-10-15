# Tableau Clair — Récapitulatif design (handoff)

Maquettes : https://claude.ai/artifact/XCVWg2AM1MRKCnHLmdte8A (canevas Design, 27 écrans).
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

### 3.9 Paramètres du tableau (`TableauParam`, `TableauBureau`) (§7.1)
- Mobile : nom, emplacement, photo (vignette + « Changer »), steppers **Rangées** et **Modules par rangée**, notes, puis « Dupliquer ce tableau » et « Supprimer le tableau… » ; barre fixe Annuler / Enregistrer.
- **Refus de réduction** : si la valeur demandée est inférieure à l'occupation d'une rangée, le stepper passe en rouge (bordure + fond + icône) et un `role="alert"` indique le minimum possible et la rangée en cause. Barres d'occupation par rangée en dessous.
- Bureau : formulaire à gauche ; à droite aperçu « à N modules » (zone hors rail hachurée, élément fautif entouré), duplication (champ nom de la copie + « Créer la copie ») et zone de suppression.
- Nouveau token : `danger` fond `#FDE8E6`, texte `#8A1C12`, bordure `#B42318` (toujours avec icône + texte).

### 3.10 Supprimer le tableau (`TableauSuppr`) (§7.1, §5)
Feuille basse : titre « Supprimer « nom » ? », listes « supprimé » / « conservé », lien d'export JSON, champ de confirmation par saisie du nom, bouton danger désactivé tant que le nom ne correspond pas, Annuler.

### 3.11 Conflit d'édition (`Conflit`) (§7.2)
Feuille basse : « Cet élément a été modifié entre-temps », version enregistrée (auteur, heure, n°) contre version locale, tableau champ par champ pour les seuls champs en désaccord (bordure sombre = ma valeur, claire = enregistrée). Actions : **Garder ma version** (primaire, écrase), **Recharger la version enregistrée** (secondaire, abandonne), Décider plus tard. Chaque action est accompagnée de sa conséquence en une ligne. Pas de fusion automatique.

### 3.12 Hors ligne (`HorsLigne`) (§10)
Bandeau sombre en tête (icône hors-ligne lime, « Hors ligne · lecture seule », heure du dernier état). Contenu identique à l'écran en ligne mais sans actions d'édition (feuille de détail remplacée par un message explicatif). Barre d'onglets conservée.

### 3.13 Chargement (`Chargement`)
Squelettes à la forme du contenu (en-tête, rangées du rail), pulsation douce, `role="status"` + libellé « Chargement du tableau… ». Même principe pour les autres écrans.

### 3.14 États vides (`Vides`)
Gabarit unique : pastille d'icône (lime = invitation à agir, bleu clair = neutre, vert clair = « tout est fait »), titre, phrase, une action. Cas : aucun tableau, rangée vide, aucun étage, rien à vérifier, aucun résultat.

### 3.15 États d'erreur (`Erreurs`)
- Chargement échoué : carte danger `role="alert"` + Réessayer + retour accueil.
- Échec d'enregistrement : notification passagère sombre + Réessayer (au-dessus de la barre d'onglets).
- 403 / 404 / session expirée : carte neutre ou orange + action de sortie.

### 3.16 Installation PWA (`PWA`) (§10)
Feuille d'invitation (icône, avantages, Installer / Plus tard, astuce iPhone) et bannière « Nouvelle version disponible · Mettre à jour ». Manifeste et service worker (mise en cache du dernier état lu) à implémenter côté front.

### 3.17 Modifier un appareil (`ModifierAppareil`) (§7.2, §5)
Feuille haute : rail réduit en haut (appareil sélectionné lime + contour), puis en-tête (pastille de calibre, type, position, dernière modification) et zone scrollable : libellé, calibre (chips), courbe et pôles (segments), différentiel en amont (liste), position (← →, rangée, largeur avec − / + ; message « Le module 5 est occupé : largeur maximale 1 »), câbles sortants, section, marque, modèle, notes, photo, carte bleue « N équipements alimentés · x vérifiés · y supposés · z inconnus » vers `Fiche`. Barre fixe : Supprimer (icône danger) · Annuler · Enregistrer. Les champs varient selon le type (§6) ; seul le disjoncteur est dessiné.

### 3.18 Supprimer l'appareil (`SupprAppareil`, `SupprAppareilBureau`) (§5)
Mobile : feuille basse ; bureau : dialogue. Contenu : « Supprimer « libellé » ? », ce qui change (module libéré ; N équipements passent à « inconnue », liste avec « + n autres »), bandeau orange « Aucun équipement n'est supprimé », bouton danger + Annuler. Pas de saisie du nom (contrairement au tableau).

### 3.19 Variantes bureau (`ConnexionBureau`, `AccueilBureau`, `PlanBureau`, `VerifierBureau`, `SupprTableauBureau`, `ConflitBureau`)
- Mise en page fluide (flex-wrap), sidebar sombre commune à tous les écrans de l'app.
- Connexion : panneau bleu d'accroche (rail illustré) + formulaire.
- Accueil : 3 indicateurs, grille de tableaux + « Ajouter un tableau », carte « À vérifier ».
- Plan : plan large (coordonnées en %), contrôle du fond (opacité, verrouillage), palette d'équipements et panneau du circuit sélectionné avec l'action « Je viens de le couper ».
- À vérifier : filtres en pastilles, cartes en grille 2 colonnes.
- Dialogues (suppression tableau/appareil, conflit) : modale centrée sur fond `rgba(13,27,61,.5)`, `role="dialog"` `aria-modal`.
- Pas de variante dédiée : Ajout, Fiche, Modifier (couverts par la palette et le panneau de l'éditeur bureau), états hors ligne / chargement / vides / erreurs / PWA (même gabarit, plus large).

## 4. Navigation

```
Connexion → Accueil
Accueil ── Tableaux → Éditeur ── paramètres → Paramètres du tableau → Supprimer
                          ├─ module libre → Ajout → Éditeur
                          └─ élément → Modifier ── Supprimer l'appareil
                                   └─ Fiche → Plan
        ── Plan
        ── À vérifier → (Plan | Fiche)
```
Barre d'onglets mobile : Accueil · Tableaux · Plan · À vérifier. Compte / export / déconnexion : à dessiner (§7.9).

## 5. Ce qui n'est pas encore dessiné

- Formulaire « Autre appareil » et enregistrement du modèle personnalisé (§7.3).
- Fiche d'équipement sur le plan et liaison depuis l'équipement (§7.4).
- Photos (tableau, élément, équipement) : prise, aperçu, URL signées (§9).
- Lien lecture seule, QR, récapitulatif A4, avertissement avant création (§7.8, V1.1).
- Membres, invitations, rôles (§7.7, V1.1).
- Export JSON, suppression de compte, mention RGPD (§7.9).
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
