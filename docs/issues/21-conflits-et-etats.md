---
title: "Conflits d'édition et états vide / chargement / erreur / hors-ligne"
milestone: V1
labels: [frontend, v1]
---

## Contexte

Spec §7.2, §10. Maquettes disponibles (canevas Design : « Conflit d'édition », « Hors ligne », « Chargement », « États vides », « États d'erreur », « Installation PWA ») ; règles en §15.4 et §15.5.

## Critères d'acceptation

- [x] Maquettes fournies (conflit, hors ligne, chargement, vides, erreurs, PWA)
- [x] Écran de conflit sur `version` différente : comparaison champ par champ, **Garder ma version** (écrase) / **Recharger** (abandonne) / Décider plus tard
- [x] États vide, chargement (squelettes, `role="status"`, `prefers-reduced-motion`) et erreur sur chaque écran, avec une action de sortie (Réessayer, retour)
- [x] Échec d'enregistrement : notification passagère avec Réessayer ; aucune perte silencieuse
- [x] Session expirée : reconnexion proposée, modifications non enregistrées conservées sur l'appareil
- [x] PWA installable (manifeste, service worker) ; invite d'installation et bannière « nouvelle version »
- [x] Hors ligne : dernier état chargé consultable en lecture seule, bandeau avec l'heure, actions d'édition désactivées avec explication

## Dépendances

api-tableaux
