---
title: "Socle : monorepo TypeScript, lint, tests, CI"
milestone: V1
labels: [infra, v1]
---

## Contexte

Initialiser le monorepo décrit en spec §11 : `apps/web`, `apps/api`, `packages/domain`, `packages/contracts`, `packages/db`.

## Critères d'acceptation

- [ ] pnpm workspaces, TypeScript strict partagé, alias de paquets
- [ ] ESLint + Prettier, Vitest configuré par paquet
- [ ] GitHub Actions : lint, `tsc --noEmit`, tests, build
- [ ] README : lancer le projet en local
