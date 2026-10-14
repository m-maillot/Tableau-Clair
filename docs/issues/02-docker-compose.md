---
title: "Docker Compose dev et prod"
milestone: V1
labels: [infra, v1]
---

## Contexte

Environnement local reproductible et description du déploiement (spec §11).

## Critères d'acceptation

- [ ] `docker-compose.yml` (dev) : postgres, minio (bucket créé au démarrage), mailpit
- [ ] `docker-compose.prod.yml` : app, postgres, reverse proxy HTTPS (Caddy ou Traefik) ; S3 externe via variables d'environnement
- [ ] Fichier `.env.example` documenté
- [ ] Health check de l'app et de la base

## Dépendances

socle-monorepo
