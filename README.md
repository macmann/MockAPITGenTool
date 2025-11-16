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

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy environment defaults and edit as needed:
   ```bash
   cp .env.example .env
   ```
   Key variables: `OPENAI_API_KEY`, `ADMIN_KEY`, `PORT` (default `3000`), `DB_FILE` (default `mockapis.db`), `OPENAI_MODEL` (defaults to `gpt-4o-mini`), `MCP_DEFAULT_SLUG`, `MCP_PUBLIC_URL`, `MOCK_BASE_URL`.
3. Start the server:
   ```bash
   npm start
   ```
4. Visit `http://localhost:3000/admin`, enter your `ADMIN_KEY`, and begin adding endpoints.

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
