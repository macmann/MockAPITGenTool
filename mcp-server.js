import express from 'express';
import { createMcpRouter } from './mcp-express.js';

export function mountMcp(app, options = {}) {
  if (!app || typeof app.use !== 'function') {
    throw new Error('A valid Express app instance is required to mount MCP');
  }

  const serverId = options.serverId || process.env.MCP_SERVER_ID || 'default-mcp';
  const mockBaseUrl = options.mockBaseUrl || process.env.MOCK_BASE_URL;
  const basePath = options.basePath || '/mcp';

  const router = createMcpRouter({ serverId, mockBaseUrl });
  app.use(basePath, router);

  console.log(
    `[MCP] Mounted at ${basePath} (serverId=${serverId}, mockBaseUrl=${mockBaseUrl || 'auto'})`
  );
  return router;
}

export async function startStandaloneMcpServer(options = {}) {
  const app = express();
  app.use(express.json());

  const basePath = options.basePath || '/mcp';
  const port = Number(options.port || process.env.PORT || process.env.MCP_PORT || 3030);

  mountMcp(app, {
    serverId: options.serverId,
    mockBaseUrl: options.mockBaseUrl,
    basePath
  });

  return new Promise((resolve, reject) => {
    const server = app
      .listen(port, () => {
        console.log(`[MCP] Standalone listening on ${port}${basePath}`);
        resolve(server);
      })
      .on('error', (err) => {
        console.error('[MCP] Failed to start standalone server', err);
        reject(err);
      });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startStandaloneMcpServer().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
