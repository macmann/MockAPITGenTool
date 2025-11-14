import http from 'http';
import { fileURLToPath } from 'url';

import app from './gui-mock-api/server.js';

const DEFAULT_PORT = process.env.PORT || 3000;

export function createHttpServer() {
  return http.createServer(app);
}

export function startServer(options = {}) {
  const { port = DEFAULT_PORT } = options;
  const server = createHttpServer();
  server.listen(port, () => {
    console.log(`[WEB] Mock API Tool listening on port ${port}`);
  });
  return server;
}

const isDirectExecution = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectExecution) {
  startServer();
}

export { app };
export default app;
