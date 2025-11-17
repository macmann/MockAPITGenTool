# MindBridge X

MindBridge X is a full-stack playground for rapidly designing mock REST endpoints, testing payloads, and exposing them to Model Context Protocol (MCP) clients. The toolkit bundles a mock API web server, an MCP bridge, and a CLI code generator so you can prototype integrations quickly.

## Overview

MindBridge X provides a visual dashboard for crafting endpoints, a JSON-RPC bridge that turns those endpoints into MCP tools, and a generator CLI that scaffolds code from natural-language prompts. It stores all configuration in SQLite by default and secures the admin interface with an `ADMIN_KEY`.

## Features

- Visual endpoint builder with enable/disable toggles and request logging.
- Handlebars-style templating for responses, with reusable environment and path parameter data.
- MCP server management with per-tool JSON schemas and a single `/mcp/:slug` entrypoint.
- CLI code scaffolding via OpenAI models (`npm run generate -- "prompt"`).
- SQLite-backed persistence and production-friendly middleware (Helmet, compression, morgan).

## Quickstart

1. Copy the environment template and adjust values as needed:
   ```bash
   cp .env.example .env
   ```
   For local development, the defaults use SQLite (`DATABASE_URL="file:./prisma/dev.db"`) and a credentials-based NextAuth setup.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Apply the initial Prisma migrations (creates the SQLite dev database):
   ```bash
   npx prisma migrate dev
   ```
4. Start the Next.js app:
   ```bash
   npm run dev
   ```
5. Visit `http://localhost:3000/login` and sign in with the default admin credentials (`admin@example.com` / `password`) to begin creating projects and MCP mappings.

## Example Usage

- **Create endpoints**: From the admin dashboard, define method, path, status, headers, delays, and templated payloads. New endpoints go live immediately under the configured paths (e.g., `/api/users`).
- **Use the code generator**: Run `npm run generate -- "Write a function in JavaScript that reverses a string."` to stream code suggestions from your configured OpenAI model.
- **Expose endpoints via MCP**: Configure a server and tools in the MCP section, then POST JSON-RPC requests to `http://localhost:3000/mcp/<slug>`; the base `/mcp` proxies to the default slug.
- **Inspect logs**: Review captured request/response logs per endpoint for quick debugging.

## Architecture

```
API-MCPGenTool/
├─ server.js              # HTTP server wrapper for the Express app
├─ index.js               # Entry point for the mock API web server
├─ mcp-express.js         # Express router implementing the MCP JSON-RPC bridge
├─ src/index.js           # CLI code generator using OpenAI's Responses API
├─ gui-mock-api/          # Admin dashboard routes, views, and SQLite helpers
├─ public/                # Static assets served by the GUI (if applicable)
├─ package.json           # Root package scripts & dependencies
└─ README.md
```

## Database Setup

- **Local development**: Uses SQLite by default. Copy `.env.example` to `.env` and keep `DATABASE_URL="file:./prisma/dev.db"`. Run `npx prisma migrate dev` to create the schema and generate the Prisma Client locally.
- **Production**: Provision a managed Postgres database (Neon, Supabase, Render, Railway, etc.), set `DATABASE_URL` to the provided connection string, and run `npm run db:migrate:deploy` (or `npx prisma migrate deploy`) during deployment so the schema stays up to date.

## Database configuration

- **Local development**: Point `DATABASE_URL` at SQLite (`file:./prisma/dev.db`, the default) or at a local Postgres instance if you prefer parity with production. After switching providers, run `npx prisma migrate dev` so Prisma regenerates the client for your local database.
- **Production (Render or any managed Postgres)**: Set `DATABASE_URL` to your managed Postgres connection string and run `npx prisma migrate deploy` as part of the build or release process to apply schema changes safely before the app boots.

## Deployment

### Deployment → Vercel

1. Import the GitHub repository into Vercel and select the default project settings.
2. Configure environment variables in the Vercel dashboard:
   - `DATABASE_URL` (Postgres connection string)
   - `NEXTAUTH_URL` (your Vercel site URL)
   - `NEXTAUTH_SECRET` (strong random value)
   - `GITHUB_ID`, `GITHUB_SECRET` (optional GitHub OAuth)
   - Any other app secrets you use (`OPENAI_API_KEY`, `ADMIN_KEY`, `MCP_PUBLIC_URL`, etc.).
3. Build command: `npm run build` (runs `prisma generate && next build`).
4. Start command: `npm run start`.
5. Run database migrations for the first deploy using `npm run db:migrate:deploy` as a post-deploy or manual job against the production `DATABASE_URL`.
6. Order of operations for the first launch: set environment variables → trigger a build → run migrations → open the app and sign in.

### Deployment → Generic Node Host (Render/Railway/etc.)

- **Runtime**: Use Node.js ≥ 18 (per `package.json` engines).
- **Environment**: Set the same variables as above (`DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, provider keys, `OPENAI_API_KEY`, etc.).
- **Build**: `npm run build`.
- **Start**: `npm run start`.
- **Migrations**: On first deploy (or after schema changes), run `npm run db:migrate:deploy` with the production `DATABASE_URL` before starting the app.

### Deployment (Render)

- **Database**: Render's managed Postgres (or any external Postgres) must be wired in through the `DATABASE_URL` environment variable. SQLite files are not supported in the Render runtime filesystem, so always supply a Postgres URL when deploying there.
- **Build command** (Render dashboard → _Build Command_):
  ```bash
  npm install
  npx prisma generate
  npm run db:migrate:deploy
  npm run build
  ```
- **Start command** (Render dashboard → _Start Command_):
  ```bash
  npm start
  ```
- **Required environment variables** (Render dashboard → _Environment_):
  - `DATABASE_URL` – Postgres connection string (required for boot & migrations).
  - `NEXTAUTH_SECRET` – strong random secret for NextAuth.
  - `NEXTAUTH_URL` – public HTTPS URL of your Render service.
  - `ADMIN_DEFAULT_ENABLED=false` – recommended so production admins must be created manually via the CLI/DB and the default seeded admin stays disabled.
  - Any other provider keys you need (e.g., `OPENAI_API_KEY`, OAuth keys, etc.).
- **Migrations at deploy time**: Because Render containers are immutable once built, make sure `npm run db:migrate:deploy` runs before `npm start`. The build command sequence above handles the Prisma client generation and migrations so no runtime path ever falls back to `prisma migrate dev`.

### Health check

- Endpoint: `GET /api/health`
- Response: `{ "status": "ok", "database": "ok" | "unavailable" }`
- Use this for uptime checks on Render, Railway, or other orchestrators.

### Deployment Checklist

- Copy `.env.example` to `.env` and fill in values.
- Local dev: ensure `DATABASE_URL=file:./prisma/dev.db`.
- Run `npx prisma migrate dev`.
- Run `npm run dev`.
- Production:
  - Provision Postgres and set `DATABASE_URL`.
  - Set `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, and any provider keys (e.g., GitHub OAuth).
  - Run `npx prisma migrate deploy` (or `npm run db:migrate:deploy`).
  - Run `npm run build` and `npm run start`.

## Screenshots

Screenshots of the admin dashboard and MCP configuration UI can be added here when available.

## Contributing Instructions

1. Fork the repository and create a feature branch.
2. Run `npm install` to install dependencies.
3. Add or update tests where appropriate.
4. Use clear commit messages and open a pull request describing your changes.

## Roadmap

- Add automated tests for endpoint templating and MCP mappings.
- Publish Docker assets for easier deployment.
- Expand CLI prompts and scaffolds for common API patterns.
- Provide sample MCP clients and SDK snippets.
- Attach example screenshots and walkthroughs to the documentation.
