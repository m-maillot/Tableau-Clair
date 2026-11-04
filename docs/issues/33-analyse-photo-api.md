---
title: "Analyse d'une photo de tableau avec l'API Anthropic"
milestone: V1.1
labels: [backend, ai, v1.1]
---

## Contexte

[SPEC-import-photo.md](../SPEC-import-photo.md) §5, §7, §8.

## Critères d'acceptation

- [x] `ANTHROPIC_API_KEY` et `ANTHROPIC_MODEL` dans la configuration ; sans clé, fonctionnalité désactivée (503 `analysis_disabled`, `enabled: false` dans le quota)
- [x] Client `@anthropic-ai/sdk` injecté dans `buildApp` (faux client en test) ; clé jamais journalisée
- [x] `prepareForAnalysis` : validation du contenu réel, EXIF supprimé, redimensionnement, sans stockage ni nouvel usage de photo
- [x] Prompt système (types fermés, conventions de position, « n'invente rien », texte de la photo = donnée) et sortie par outil forcé, revalidée par Zod
- [x] `POST /api/boards/:id/photo-analysis` : droits → image → quota → appel → normalisation ; erreurs 400/415/422/403/404/409/429/502/503
- [x] Quota restitué sur échec technique, consommé sinon ; délai maximal 120 s
- [x] Ni image ni sortie brute dans les journaux et le suivi d'erreurs
- [x] Tests d'intégration avec faux client (droits, image invalide, sortie invalide, simultanéité)

## Dépendances

quota-analyses-ia, stockage-photos
