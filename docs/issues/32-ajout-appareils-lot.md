---
title: "Ajout d'appareils en lot et normalisation d'une proposition"
milestone: V1.1
labels: [backend, domain, ai, v1.1]
---

## Contexte

[SPEC-import-photo.md](../SPEC-import-photo.md) §5.3, §5.4, §6.

## Critères d'acceptation

- [x] Fonction pure du domaine : ignore rangées et valeurs inconnues, borne les champs, génère un libellé par défaut, signale `overlap` / `out_of_bounds` (existants et entre propositions), plafonne à 200
- [x] `POST /api/boards/:id/elements/bulk` : éditeur minimum, mêmes validations que la création unitaire, rangées verrouillées dans l'ordre stable
- [x] Tout ou rien : un conflit annule le lot, 422 avec l'index de l'élément fautif et le motif
- [x] Indépendant de l'IA : pas de quota
- [x] Tests unitaires du domaine et tests d'intégration (conflits dans le lot, droits)

## Dépendances

api-tableaux, domain-regles
