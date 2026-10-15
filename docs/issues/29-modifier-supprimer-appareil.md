---
title: "Modifier et supprimer un appareil du rail"
milestone: V1
labels: [frontend, v1]
---

## Contexte

Maquettes « Modifier un appareil » et « Supprimer l'appareil » (mobile + dialogue bureau), §15.4 et §15.5. Spec §7.2, §5, §6.

## Critères d'acceptation

- [x] Le bouton principal de la feuille de l'éditeur est « Modifier » et ouvre la feuille d'édition ; la fiche des circuits est accessible depuis la carte « N équipements alimentés »
- [x] Champs : libellé, calibre, courbe, pôles, différentiel en amont, position (← →, rangée, largeur), câbles sortants, section, marque, modèle, notes, photo
- [x] Les champs affichés dépendent du type d'élément (§6) ; les types sans protection n'affichent pas calibre / courbe
- [x] Largeur limitée par l'espace libre voisin avec message explicite ; mêmes règles côté serveur (`domain`)
- [x] Enregistrement avec détection de conflit (`version`) → écran de conflit (issue 21)
- [x] Suppression : confirmation listant le module libéré et les équipements concernés ; les équipements restent sur le plan, leurs liaisons passent à « inconnue » et apparaissent dans « À vérifier »
- [x] Variante bureau : suppression en dialogue modal centré (`role="dialog"`, `aria-modal`, focus piégé)

## Dépendances

editeur-edition-mobile, fiche-disjoncteur, conflits-et-etats
