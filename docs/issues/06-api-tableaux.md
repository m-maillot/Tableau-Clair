---
title: "API REST : logements, tableaux, rangées, éléments"
milestone: V1
labels: [backend, v1]
---

## Contexte

Contrats Zod partagés (`packages/contracts`), autorisation par rôle côté serveur (spec §8).

## Critères d'acceptation

- [ ] CRUD logements, tableaux (dont duplication), rangées, éléments
- [ ] Validation serveur des règles de capacité/collision via `packages/domain`
- [ ] Contrôle de `version` à l'écriture : 409 en cas de conflit avec la version courante
- [ ] Chaque réponse expose `updatedBy` / `updatedAt`
- [ ] Aucune lecture ni écriture hors des logements de l'utilisateur

## Dépendances

schema-db, domain-regles, auth-backend
