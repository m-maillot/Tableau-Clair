---
title: "Création et paramétrage d'un tableau"
milestone: V1
labels: [frontend, v1]
---

## Contexte

Maquettes disponibles (canevas Design : « Paramètres du tableau », « Supprimer le tableau », « Paramètres du tableau — bureau »). Spec §7.1 ; règles de comportement en §15.4 et §15.5. À implémenter.

## Critères d'acceptation

- [x] Maquette mobile + bureau de l'écran (fournie)
- [x] Nom, emplacement, photo, rangées, modules par rangée, notes
- [x] Refus de réduire une rangée sous son occupation, avec message explicite (stepper en erreur, `role="alert"`, minimum et rangée citées) ; même règle appliquée côté serveur
- [x] Aperçu bureau de la réduction (zone hors rail hachurée, élément fautif signalé)
- [x] Duplication : copie rangées et éléments, sans les liaisons ; nom proposé « <nom> (copie) »
- [x] Suppression avec confirmation : liste supprimé / conservé, export JSON proposé (export du tableau ; l'export complet du compte est le ticket « Compte »), saisie du nom requise pour activer le bouton ; les équipements du plan sont conservés et leurs liaisons passent à « inconnue »
- [x] Création d'un tableau : même formulaire avec champs vides, sans duplication ni suppression

## Dépendances

ui-fondations, api-tableaux
