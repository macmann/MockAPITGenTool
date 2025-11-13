import app from './gui-mock-api/server.js';

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Mock API server listening on port ${PORT}`);
});
