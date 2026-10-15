---
title: "Variantes bureau des écrans (connexion, accueil, plan, à vérifier, dialogues)"
milestone: V1
labels: [frontend, v1]
---

## Contexte

Maquettes bureau ajoutées au canevas : « Connexion — bureau », « Accueil — bureau », « Plan du logement — bureau », « À vérifier — bureau », « Supprimer l'appareil — bureau », « Supprimer le tableau — bureau », « Conflit d'édition — bureau » (§15.4, §15.5). Complète l'issue 19 (éditeur bureau).

## Critères d'acceptation

- [ ] Sidebar commune (logement, nav, badge « À vérifier », compte) ; layout fluide qui empile sous le contenu en largeur étroite
- [ ] Connexion : panneau d'accroche + formulaire (mêmes états que le mobile)
- [ ] Accueil : indicateurs, grille de tableaux, « Ajouter un tableau », carte « À vérifier »
- [ ] Plan : plan large, opacité et verrouillage du fond, palette d'équipements, panneau du circuit sélectionné
- [ ] À vérifier : filtres et cartes en grille deux colonnes
- [ ] Dialogues modaux : suppression (tableau, appareil) et conflit d'édition, accessibles au clavier (Échap, focus)
- [ ] États hors ligne / chargement / vides / erreurs / PWA fonctionnels en bureau avec le gabarit existant (pas de maquette dédiée)

## Dépendances

ui-fondations, version-bureau, plan-etages, a-verifier, conflits-et-etats
