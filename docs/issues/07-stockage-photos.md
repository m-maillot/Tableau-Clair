---
title: "Photos et images de plan sur S3"
milestone: V1
labels: [backend, storage, v1]
---

## Contexte

Spec §9 (Photos et images de plan).

## Critères d'acceptation

- [x] Client S3 compatible (MinIO en dev, S3 externe en prod)
- [x] Envoi avec contrôle du type et de la taille ; redimensionnement (≈ 1600 px, plus pour les plans) ; suppression de l'EXIF
- [x] Bucket privé, accès par URL signée de courte durée après contrôle des droits
- [x] Types d'usage : `board`, `element`, `fixture`, `floor_background`

## Dépendances

api-tableaux
