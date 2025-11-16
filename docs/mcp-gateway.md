# MCP Gateway Quickstart

Model Context Protocol (MCP) servers expose selected mock API endpoints as JSON-RPC tools that AI assistants can call. Each enabled server is reachable under `/mcp/:slug`, making it easy to route multiple MCP configurations through a single gateway.

## Configure the gateway

1. Create a new MCP server in the **Admin → MCP servers** page. This assigns a slug used in the URL (pattern: `/mcp/:slug`).
2. (Optional) Configure auth headers for the server.
3. Go to **Configure tools** for that server and choose either:
   - **Select from API List**
   - **Import OpenAPI Spec**
4. Save your changes and confirm the server is enabled.

## Test with curl

Replace `<your-host>` with your deployment hostname and `<slug>` with the server slug.

```bash
# Initialize
curl -s -i -X POST https://<your-host>/mcp/<slug> \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"manual-test","version":"0.0.1"}}}'

# List tools
curl -s -i -X POST https://<your-host>/mcp/<slug> \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'

# Call a tool
curl -s -i -X POST https://<your-host>/mcp/<slug> \
  -H 'Content-Type: application/json' \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"<toolName>","arguments":{"userId":"123"}}}'
```
