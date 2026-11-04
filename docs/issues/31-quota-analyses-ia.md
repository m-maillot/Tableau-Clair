---
title: "Quota d'analyses IA (3 par jour et par utilisateur)"
milestone: V1.1
labels: [backend, ai, v1.1]
---

## Contexte

[SPEC-import-photo.md](../SPEC-import-photo.md) §4.

## Critères d'acceptation

- [x] Migration `ai_analyses` (utilisateur, tableau, jour Europe/Paris, statut `pending` / `succeeded` / `failed`, modèle, tokens, nombre d'appareils), index `(user_id, day)`, suppression en cascade avec le compte
- [x] `AI_DAILY_LIMIT` (défaut 3) dans la configuration et `.env.example`
- [x] Réservation atomique (verrou consultatif par utilisateur) : 429 `quota_exceeded` au-delà du plafond, 409 `analysis_in_progress` si une analyse récente est en cours
- [x] Restitution après échec technique ; ligne `pending` de plus de 5 minutes ignorée
- [x] `GET /api/ai/quota` : `enabled`, `limit`, `used`, `remaining`, `resetsAt`
- [x] Tests d'intégration : 4ᵉ appel refusé, 5 appels simultanés → exactement 3 acceptés, changement de jour avec horloge injectée (heure d'été comprise)
- [x] Table incluse dans l'export JSON du compte

## Dépendances

schema-db
