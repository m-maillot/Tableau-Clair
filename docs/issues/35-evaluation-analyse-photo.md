---
title: "Évaluation de la qualité de l'analyse de photo"
milestone: V1.1
labels: [ai, quality, v1.1]
---

## Contexte

[SPEC-import-photo.md](../SPEC-import-photo.md) §9.

## Critères d'acceptation

- [ ] Jeu de 10 à 20 photos de tableaux annotées à la main, hors du dépôt
- [ ] Script `scripts/eval-photo-analysis` lancé à la main (jamais en CI) : exactitude du type, du calibre, de la position et de la largeur, appareils oubliés ou inventés, coût moyen
- [ ] Prompt réglé jusqu'à la cible initiale (type ≥ 90 %, position ≥ 80 %), ou repli documenté (prompt guidé, recadrage par rangée, autre modèle)
- [ ] Choix du modèle par défaut confirmé par la comparaison

## Dépendances

analyse-photo-api
