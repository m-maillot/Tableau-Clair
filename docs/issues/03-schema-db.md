---
title: "Schéma de base de données et migrations"
milestone: V1
labels: [backend, v1]
---

## Contexte

Modéliser les entités de la spec §5 avec Drizzle, y compris `Membership`, `Invitation`, `ShareLink`, `Floor` (membres/invitations/liens présents dès la V1 pour éviter une migration lourde).

## Critères d'acceptation

- [x] Toutes les entités §5 avec `id` UUID, `createdAt`, `updatedAt`, `updatedBy`, `version`
- [x] Contraintes d'intégrité : unicité rangée/index, un propriétaire minimum par logement, un seul lien actif par tableau
- [x] Migrations versionnées, jeu de données de démonstration
- [x] Tests d'intégration sur une base réelle

## Dépendances

docker-compose
