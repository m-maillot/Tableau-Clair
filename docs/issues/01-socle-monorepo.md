---
title: "Socle : monorepo TypeScript, lint, tests, CI"
milestone: V1
labels: [infra, v1]
---

## Contexte

Initialiser le monorepo décrit en spec §11 : `apps/web`, `apps/api`, `packages/domain`, `packages/contracts`, `packages/db`.

## Critères d'acceptation

- [x] pnpm workspaces, TypeScript strict partagé, alias de paquets
- [x] ESLint + Prettier, Vitest configuré par paquet
- [x] GitHub Actions : lint, `tsc --noEmit`, tests, build
- [x] README : lancer le projet en local
