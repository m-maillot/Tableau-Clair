---
title: "API REST : logements, tableaux, rangées, éléments"
milestone: V1
labels: [backend, v1]
---

## Contexte

Contrats Zod partagés (`packages/contracts`), autorisation par rôle côté serveur (spec §8).

## Critères d'acceptation

- [x] CRUD logements, tableaux (dont duplication), rangées, éléments
- [x] Validation serveur des règles de capacité/collision via `packages/domain`
- [x] Contrôle de `version` à l'écriture : 409 en cas de conflit avec la version courante
- [x] Chaque réponse expose `updatedBy` / `updatedAt`
- [x] Aucune lecture ni écriture hors des logements de l'utilisateur

## Dépendances

schema-db, domain-regles, auth-backend
