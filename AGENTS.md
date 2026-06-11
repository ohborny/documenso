# Agent Guidelines for Documenso

## Build/Test/Lint Commands

- `npm run build` - Build all packages
- `npm run lint` - Lint all packages
- `npm run lint:fix` - Auto-fix linting issues
- `npm run test:e2e` - Run E2E tests with Playwright
- `npm run test:dev -w @documenso/app-tests` - Run single E2E test in dev mode
- `npm run test-ui:dev -w @documenso/app-tests` - Run E2E tests with UI
- `npm run format` - Format code with Biome
- `npm run dev` - Start development server for Remix app

**Important:** Do not run `npm run build` to verify changes unless explicitly asked. Builds take a long time (~2 minutes). Use `npx tsc --noEmit` for type checking specific packages if needed.

## Code Style Guidelines

- Use TypeScript for all code; prefer `type` over `interface`
- Use functional components with `const Component = () => {}`
- Never use classes; prefer functional/declarative patterns
- Use descriptive variable names with auxiliary verbs (isLoading, hasError)
- Directory names: lowercase with dashes (auth-wizard)
- Use named exports for components
- Never use 'use client' directive
- Never use 1-line if statements
- Structure files: exported component, subcomponents, helpers, static content, types

## Error Handling & Validation

- Use custom AppError class when throwing errors
- When catching errors on the frontend use `const error = AppError.parse(error)` to get the error code
- Use early returns and guard clauses
- Use Zod for form validation and react-hook-form for forms
- Use error boundaries for unexpected errors

## UI & Styling

- Use Shadcn UI, Radix, and Tailwind CSS with mobile-first approach
- Use `<Form>` `<FormItem>` elements with fieldset having `:disabled` attribute when loading
- Use Lucide icons with longhand names (HomeIcon vs Home)

## TRPC Routes

- Each route in own file: `routers/teams/create-team.ts`
- Associated types file: `routers/teams/create-team.types.ts`
- Request/response schemas: `Z[RouteName]RequestSchema`, `Z[RouteName]ResponseSchema`
- Only use GET and POST methods in OpenAPI meta
- Deconstruct input argument on its own line
- Prefer route names such as get/getMany/find/create/update/delete
- "create" routes request schema should have the ID and data in the top level
- "update" routes request schema should have the ID in the top level and the data in a nested "data" object

## Translations & Remix

- Use `<Trans>string</Trans>` for JSX translations from `@lingui/react/macro`
- Use `t\`string\`` macro for TypeScript translations
- Use `(params: Route.Params)` and `(loaderData: Route.LoaderData)` for routes
- Directly return data from loaders, don't use `json()`
- Use `superLoaderJson` when sending complex data through loaders such as dates or prisma decimals

## Cursor Cloud specific instructions

This is an npm-workspaces + Turborepo monorepo. The core product is the Remix web app (`@documenso/remix`) plus a Postgres database and an SMTP catcher; standard scripts live in the root `package.json` and `docker/development/compose.yml`.

Node/npm: login shells use nvm Node v22.22.2 with npm 11.11.0 (the repo requires npm `>=11.11.0`). The interactive (non-login) shell may resolve a different injected `node`; prefer running commands in a login shell so node+npm stay consistent.

Dependencies/`.env`: the startup update script runs `npm install` (which triggers `patch-package` and `prisma generate` via post-install hooks) and creates `.env` from `.env.example` if it is missing. The default `.env` runs background jobs in-process (`local`), stores uploads in Postgres (`database`), and signs PDFs with a local cert — so Redis, MinIO/S3, and Gotenberg are all OPTIONAL.

Docker is installed but NOT auto-started (there is no systemd/init). Before starting services you must launch the daemon yourself, e.g. `sudo dockerd` in a background tmux session, then run docker via `sudo`. Start dev services with `sudo docker compose -f docker/development/compose.yml up -d database inbucket redis minio`. Skip the `gotenberg` service unless you specifically need DOCX→PDF conversion — it builds a heavy LibreOffice image.

Database: migrations and seed data persist in the `documenso_database` Docker volume in the snapshot. If starting from a fresh DB, run `npm run prisma:migrate-dev` then `npm run prisma:seed`. Seeded logins are `example@documenso.com` / `password` and `admin@documenso.com` / `password` (the seed also creates ~1000 sample documents, so it takes ~20s).

Run the app: `npm run dev` (serves the Remix app, tRPC, public API, and in-process jobs on port 3000). The first request triggers a Vite cold compile that can take ~30–40s before the page renders — this is expected, not a hang. View outgoing emails (signing links, etc.) in the Inbucket web UI at `http://localhost:9000` (SMTP on port 2500).

Lint/test/build: `npm run lint` (Biome; emits warnings but exits 0), `npm run test:e2e` (Playwright; builds the app first, see `packages/app-tests`), `npm run build`. Per the build note above, avoid `npm run build` just to verify changes — prefer `npx tsc --noEmit` for targeted type checks.
