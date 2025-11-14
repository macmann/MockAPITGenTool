import { startServer } from './server.js';

const PORT = process.env.PORT || 3000;

function main() {
  startServer({ port: PORT });
}

main();
