---
title: "Compte : export JSON et suppression"
milestone: V1
labels: [backend, frontend, v1]
---

## Contexte

Spec §7.9, §9 (RGPD). Écran compte non maquetté.

## Critères d'acceptation

- [x] Export JSON complet (données + photos ou liens)
- [x] Suppression du compte avec confirmation explicite ; suppression des logements dont l'utilisateur est seul propriétaire
- [x] Mention d'information (RGPD), déconnexion

## Dépendances

api-tableaux, stockage-photos
