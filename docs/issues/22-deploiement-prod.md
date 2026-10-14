---
title: "Déploiement en production"
milestone: V1
labels: [infra, v1]
---

## Contexte

Spec §11, §14.

## Critères d'acceptation

- [ ] DNS et HTTPS sur `tableau-clair.fr`, domaine d'envoi Brevo authentifié (SPF, DKIM, DMARC)
- [ ] Client OAuth Google configuré, S3 externe et bucket privé créés
- [ ] Pipeline de déploiement (image Docker, `docker compose pull && up -d`)
- [ ] Journaux structurés, suivi d'erreurs, endpoint de santé
- [ ] Procédure d'export JSON documentée (en l'absence de sauvegarde automatique)

## Dépendances

docker-compose, auth-backend, stockage-photos
