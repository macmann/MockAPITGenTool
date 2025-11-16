# API MCP Gen Tool

A full-stack playground for rapidly designing mock REST endpoints, testing payloads, and exposing them to Model Context Protocol (MCP) clients. The project bundles three complementary pieces:

- **Mock API web server** – An Express application with an admin dashboard for creating endpoints, templating responses, storing request logs, and publishing OpenAPI snippets.
- **MCP bridge** – Turns selected mock endpoints into MCP tools so assistants can call them through `/mcp/:slug` JSON-RPC endpoints.
- **Code generator CLI** – A minimal script that talks to OpenAI's code-capable models (defaults to `gpt-4o-mini`) to scaffold code from natural-language prompts.

The repository started as a Codex-style sample and has grown into a lightweight toolkit for experimenting with APIs and MCP integrations.

## Features

- **Visual endpoint builder** – Create, edit, enable/disable, or delete endpoints without writing code. Define methods, paths, headers, status codes, delays, and response payloads from the dashboard.
- **Templated responses** – Author responses using Handlebars-style tokens such as `{{vars.API_KEY}}` or `{{user.id}}`. The admin UI walks you through providing values for reusable variables and path-parameter groups.
- **Environment & path data store** – Maintain reusable key/value pairs per endpoint, grouped by path parameters (e.g., `:userId`).
- **Request logging** – Inspect inbound requests, captured headers, payload previews, response times, and filter logs per endpoint.
- **OpenAPI snippets** – Generate per-endpoint documentation from the UI to share with consumers or import into API tools.
- **MCP server management** – Register multiple MCP servers, toggle availability, and map endpoints to MCP tools with optional JSON schemas for tool arguments.
- **Single MCP entrypoint** – Serve JSON-RPC requests at `/mcp/:slug` for enabled servers (and `/mcp` falls back to the default server), logging each interaction for traceability.
- **CLI code scaffolding** – Run `npm run generate -- "prompt"` to request code snippets from OpenAI models directly in the terminal.
- **SQLite-backed persistence** – Stores endpoints, variables, logs, MCP configuration, and tool mappings in `mockapis.db` (configurable).
- **Production-friendly defaults** – Helmet, compression, and morgan logging enabled out of the box. Supports `ADMIN_KEY` protected access for the dashboard.

## Project structure

```
API-MCPGenTool/
├─ index.js               # Entry point for the mock API web server
├─ server.js              # Creates the HTTP server around the Express app
├─ mcp-express.js         # Express router implementing the MCP JSON-RPC bridge
├─ src/index.js           # CLI code generator using OpenAI's Responses API
├─ gui-mock-api/          # Express app + views backing the admin dashboard
│  ├─ server.js           # Route definitions and admin experience
│  ├─ db.js               # SQLite schema & helpers
│  ├─ templates.js        # Handlebars templating helpers
│  └─ views/              # EJS templates for the dashboard and public pages
├─ public/                # Static assets served by the GUI (if applicable)
├─ package.json           # Root package scripts & dependencies
└─ README.md
```

## Prerequisites

- **Node.js 18 or newer**
- **npm** (ships with Node)
- An OpenAI API key with access to a code-capable model (for the CLI)

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Create your environment file**
   ```bash
   cp .env.example .env
   ```
   Then edit `.env` and provide the variables you need:

   | Variable | Purpose |
   | --- | --- |
   | `OPENAI_API_KEY` | Required for the CLI code generator. |
   | `OPENAI_MODEL` | Optional override for the model (defaults to `gpt-4o-mini`). |
   | `ADMIN_KEY` | Protects the admin dashboard. Set a secret; you'll use it to log in. |
   | `PORT` | Port for the Express server (defaults to `3000`). |
   | `DB_FILE` | SQLite file path for mock data (`mockapis.db` by default). |
   | `MCP_DEFAULT_SLUG` | Preferred MCP server slug to serve at `/mcp`. |
   | `MCP_PUBLIC_URL` | Public base URL used when generating MCP connection instructions. |
   | `MOCK_BASE_URL` | Optional base URL hint shown in the admin UI.

3. **(Optional) Seed the database** – The app automatically creates SQLite tables on first run. If you want to start fresh, delete `mockapis.db`.

## Running locally

### Start the mock API dashboard

```bash
npm start
```

- Visit `http://localhost:3000/admin` and enter your `ADMIN_KEY` to access the dashboard.
- The public catalog at `/` surfaces featured endpoints and stats once you add data.
- Newly created endpoints become available immediately under their configured paths (e.g., `http://localhost:3000/api/users`).

### Use the code generator CLI

```bash
npm run generate -- "Write a function in JavaScript that reverses a string."
```

The script prints the generated code to stdout. Override the model by setting `OPENAI_MODEL` in your `.env`.

### Expose endpoints via MCP

1. Open the dashboard, go to **MCP** in the navigation, and create a server (name + optional API key header/value).
2. Add tools that map to existing mock endpoints and optionally describe their input schema (JSON Schema object).
3. Enabled servers receive a slug (e.g., `mcp-my-server`).
4. Clients can connect to `http://localhost:3000/mcp/<slug>` using JSON-RPC 2.0. The base `/mcp` route proxies to the default slug.

Logs capture every MCP request/response, making debugging easier when integrating assistants.

See [docs/mcp-gateway.md](docs/mcp-gateway.md) for curl-based MCP testing steps and gateway configuration reminders.

## Deployment notes

- The project is optimized for Render or similar Node hosts. Use `npm install` for build and `node server.js` (or `npm start`) for start.
- On Render's free tier the filesystem is ephemeral—SQLite state in `mockapis.db` will reset on redeploy. Provide external storage if persistence matters.
- Set the same environment variables you used locally in your hosting provider's dashboard. At minimum configure `ADMIN_KEY`, and set `MCP_PUBLIC_URL` to your public hostname so connection instructions are accurate.

Example Render setup:

- **Build Command:** `npm install`
- **Start Command:** `node server.js`
- **Environment Variables:** `NODE_ENV=production`, `ADMIN_KEY=<your-admin-secret>`, optional `DB_FILE`, `MCP_PUBLIC_URL`, `MOCK_BASE_URL`.

## Useful npm scripts

| Script | Description |
| --- | --- |
| `npm start` | Boots the Express server (admin UI + mock endpoints + MCP bridge). |
| `npm run generate -- "prompt"` | Runs the OpenAI code generator CLI with your prompt. |
| `npm run mcp-server` | Exposes the MCP router module for embedding elsewhere (exports `createMcpRouter`). |

## Troubleshooting

- **"Missing OPENAI_API_KEY"** – Set the variable in `.env` before using the CLI script.
- **Dashboard says "Access denied"** – Ensure `ADMIN_KEY` is set and you're including it via the login form or `?key=` query parameter.
- **Endpoints returning stale data** – Each save writes to SQLite. Delete `mockapis.db` or use a new `DB_FILE` path if you want a clean slate.
- **MCP client can't connect** – Confirm the server is enabled in the dashboard, the slug matches, and that you're POSTing JSON with `Content-Type: application/json`.

## License

This project is provided as-is for experimentation and internal tooling.
