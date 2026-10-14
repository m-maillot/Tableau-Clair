---
title: "Éditeur de rail DIN : affichage"
milestone: V1
labels: [frontend, v1]
---

## Contexte

Maquette « Éditeur rail (mobile) » (§15.4, §15.2).

## Critères d'acceptation

- [ ] `RailRow` / `RailElement` / `FreeSlot` en SVG ou DOM, 1 module = 44 px, strip horizontal scrollable
- [ ] En-tête « x / N modules » ; rendu par type (§15.2)
- [ ] Sélection d'un élément → feuille basse de détail
- [ ] Chaque module libre est une case cliquable

## Dépendances

ui-fondations, api-tableaux, domain-regles
