---
title: "Authentification : lien magique, Google, liste autorisée"
milestone: V1
labels: [backend, auth, v1]
---

## Contexte

Spec §9. Better Auth, sans mot de passe, inscription fermée.

## Critères d'acceptation

- [x] Lien magique par e-mail via Brevo (SMTP ou API), Mailpit en local ; usage unique et courte durée
- [x] Connexion Google (OAuth/OIDC) — configuration vérifiée par test ; le parcours complet avec Google nécessite un client OAuth réel (voir README)
- [x] Liste d'adresses autorisées par variable d'environnement, vérifiée côté serveur pour tout fournisseur ; réponse neutre pour une adresse refusée
- [x] Sessions en cookie `HttpOnly`/`Secure`/`SameSite` + protection CSRF
- [x] Limitation de débit sur demande de lien et connexions ; journalisation des refus
- [x] Tests d'intégration : adresse autorisée, refusée, lien expiré, lien réutilisé

## Dépendances

schema-db

## Note issue du ticket « Schéma de base de données »

La table `users` (uuid, e-mail unique insensible à la casse, `display_name`) existe déjà. Better Auth
doit être configuré pour s'y adosser (nom de table, identifiants UUID) et ajouter ses propres tables
`session`, `account` et `verification` par une nouvelle migration.
