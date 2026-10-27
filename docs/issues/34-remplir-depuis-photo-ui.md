---
title: "Remplir un tableau depuis une photo (interface)"
milestone: V1.1
labels: [frontend, ai, v1.1]
---

## Contexte

[SPEC-import-photo.md](../SPEC-import-photo.md) §3. Écrans non maquettés : feuille de capture, relecture (mobile et bureau), états quota épuisé / échec / aucun appareil.

## Critères d'acceptation

- [x] Bouton « Remplir depuis une photo » (état vide et menu de l'éditeur), masqué pour un lecteur ou sans clé d'API
- [x] Feuille (dialogue sur bureau) : prise ou choix de la photo, conseils, aperçu, mention d'envoi à Anthropic, quota restant
- [x] Chargement avec `role="status"`
- [x] Relecture : rail et liste modifiable, cases, « À vérifier » (icône + texte), conflits décochés et expliqués, remarques du modèle
- [ ] « Ajouter N appareils » via l'endpoint de lot ; annulable d'un geste si l'éditeur le permet
- [x] États : quota épuisé (heure de remise à zéro), hors ligne, photo refusée, aucun appareil, échec avec quota restitué, analyse déjà en cours
- [x] Tests front (quota, bouton désactivé à 0, conflits, édition d'une ligne, erreurs)

## Dépendances

ajout-appareils-lot, analyse-photo-api, ajout-element
