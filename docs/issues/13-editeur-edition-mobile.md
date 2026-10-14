---
title: "Éditeur de rail : déplacement et annulation (mobile)"
milestone: V1
labels: [frontend, v1]
---

## Contexte

Spec §7.2, §15.5. Mode d'édition par défaut sur mobile : pas de glisser-déposer.

## Critères d'acceptation

- [x] Déplacer ← →, changer de rangée depuis la feuille de détail
- [x] Collisions et dépassements refusés avec retour visuel (règles du package `domain`)
- [x] Annuler / rétablir au moins la dernière action
- [x] Suppression d'un élément

## Dépendances

editeur-lecture
