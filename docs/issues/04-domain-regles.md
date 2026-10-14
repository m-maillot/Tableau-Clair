---
title: "Package `domain` : capacité, collisions, liaisons"
milestone: V1
labels: [backend, frontend, v1]
---

## Contexte

Règles métier pures, partagées par le navigateur (retour immédiat) et le serveur (garantie) — spec §5, §7.2.

## Critères d'acceptation

- [ ] Fonctions pures : placer/déplacer/redimensionner un élément, détecter dépassement et chevauchement, calcul d'occupation par rangée
- [ ] Règles de liaison : un équipement ↔ un disjoncteur, passage à `unknown` à la suppression d'un disjoncteur
- [ ] Largeurs possibles à partir d'un module libre (pour griser les types dans « Ajout »)
- [ ] Couverture de tests élevée, aucune dépendance à React ou à la base

## Dépendances

socle-monorepo
