const path = require('path');
const Database = require('better-sqlite3');

const dbFile = path.join(__dirname, 'data.sqlite');
const db = new Database(dbFile);

db.pragma('journal_mode = WAL');

db.prepare(
  `CREATE TABLE IF NOT EXISTS routes (
    id TEXT PRIMARY KEY,
    method TEXT NOT NULL,
    path TEXT NOT NULL,
    response TEXT NOT NULL,
    description TEXT DEFAULT ''
  )`
).run();

function getAllRoutes() {
  return db.prepare('SELECT id, method, path, response, description FROM routes ORDER BY path ASC').all();
}

function saveRoute(route) {
  const record = {
    id: route.id,
    method: route.method,
    path: route.path,
    response: route.response,
    description: route.description || ''
  };

  db.prepare(
    `INSERT INTO routes (id, method, path, response, description)
     VALUES (@id, @method, @path, @response, @description)
     ON CONFLICT(id) DO UPDATE SET
       method = excluded.method,
       path = excluded.path,
       response = excluded.response,
       description = excluded.description`
  ).run(record);

  return record;
}

module.exports = {
  db,
  getAllRoutes,
  saveRoute
};
