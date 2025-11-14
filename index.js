import http from 'http';
import { app } from './server.js';

const PORT = process.env.PORT || 3000;

function startWebServer() {
  const srv = http.createServer(app);
  srv.listen(PORT, () => {
    console.log(`[WEB] Mock API Tool listening on port ${PORT}`);
  });
  return srv;
}

function main() {
  startWebServer();
}

main();
