# Tableau Clair

Cartographie de tableaux électriques DIN : composition réelle sur rail, circuits alimentés, plan du logement.

- Spécification : [docs/SPEC.md](docs/SPEC.md)
- Tickets : [docs/issues/](docs/issues/) (création sur GitHub : `scripts/create-issues.sh`)

## Prérequis

- Node.js 24 (voir `.nvmrc`)
- [pnpm](https://pnpm.io) 10 (`corepack enable` suffit)

## Démarrer en local

```bash
pnpm install
pnpm dev        # API sur :3000, web sur :5173 (proxy /api → API)
```

## Commandes

| Commande         | Rôle                                       |
| ---------------- | ------------------------------------------ |
| `pnpm dev`       | API et web en mode développement           |
| `pnpm lint`      | ESLint                                     |
| `pnpm format`    | Prettier (écriture) ; `format:check` en CI |
| `pnpm typecheck` | `tsc --noEmit` dans chaque paquet          |
| `pnpm test`      | Vitest dans chaque paquet                  |
| `pnpm build`     | Build de l'API (tsup) et du web (Vite)     |
| `pnpm check`     | Enchaîne tout ce que la CI exécute         |

## Organisation

```
apps/
  web/          React + Vite
  api/          Fastify
packages/
  domain/       règles métier pures (capacité, collisions, liaisons)
  contracts/    schémas Zod partagés front/back
  db/           schéma et migrations (à venir)
```

Les paquets de `packages/` sont consommés en TypeScript source (pas d'étape de build) : le web les résout via Vite, l'API les embarque via tsup.
Ils s'importent sous `@tableau-clair/<nom>`.
