---
title: "Liaisons équipement ↔ disjoncteur et recherche dans les deux sens"
milestone: V1
labels: [frontend, backend, v1]
---

## Contexte

Spec §7.5.

## Critères d'acceptation

- [x] Lier / délier un équipement à un disjoncteur depuis l'équipement et depuis le disjoncteur, avec statut
- [x] Depuis un disjoncteur : équipements alimentés, par pièce et par étage
- [x] Depuis une pièce, une prise ou un appareil : disjoncteur à couper (libellé, tableau, rangée, module, photo)
- [x] Endpoint de recherche globale

## Dépendances

plan-etages, fiche-disjoncteur
