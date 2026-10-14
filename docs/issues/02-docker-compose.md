---
title: "Docker Compose dev et prod"
milestone: V1
labels: [infra, v1]
---

## Contexte

Environnement local reproductible et description du déploiement (spec §11).

## Critères d'acceptation

- [x] `docker-compose.yml` (dev) : postgres, minio (bucket créé au démarrage), mailpit
- [x] `docker-compose.prod.yml` : app, postgres, reverse proxy HTTPS (Caddy ou Traefik) ; S3 externe via variables d'environnement
- [x] Fichier `.env.example` documenté
- [x] Health check de l'app et de la base (`/api/health` ; le contrôle de connexion à la base depuis l'app arrive avec le ticket « Schéma de base de données »)

## Dépendances

socle-monorepo
