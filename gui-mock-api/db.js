import path from 'path';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbFile = path.join(__dirname, 'data.sqlite');
const DB_FILE = process.env.DB_FILE || 'mockapis.db';
export const db = new Database(DB_FILE);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS endpoints (
  id TEXT PRIMARY KEY,
  name TEXT DEFAULT '',
  description TEXT DEFAULT '',
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  match_headers TEXT DEFAULT '{}',
  response_status INTEGER DEFAULT 200,
  response_headers TEXT DEFAULT '{}',
  response_body TEXT DEFAULT '',
  response_is_json INTEGER DEFAULT 0,
  response_delay_ms INTEGER DEFAULT 0,
  template_enabled INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(method, path)
);
`);

db.exec(`
CREATE TABLE IF NOT EXISTS endpoint_vars (
  id TEXT PRIMARY KEY,
  endpoint_id TEXT NOT NULL,
  k TEXT NOT NULL,
  v TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(endpoint_id, k),
  FOREIGN KEY(endpoint_id) REFERENCES endpoints(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS api_logs (
  id TEXT PRIMARY KEY,
  endpoint_id TEXT,
  method TEXT,
  path TEXT,
  matched_params TEXT,
  query TEXT,
  headers TEXT,
  body TEXT,
  status INTEGER,
  response_ms INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(endpoint_id) REFERENCES endpoints(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS mcp_servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  base_url TEXT,           -- e.g. http://localhost:3000 or https://brillar-api-tool.onrender.com
  api_key_header TEXT,     -- e.g. x-api-key
  api_key_value TEXT,      -- e.g. secret
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  is_enabled INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS mcp_tools (
  id TEXT PRIMARY KEY,
  mcp_server_id TEXT NOT NULL,
  endpoint_id TEXT NOT NULL,
  name TEXT NOT NULL,       -- MCP tool name (e.g. getUserDetails)
  description TEXT,
  arg_schema TEXT,          -- JSON schema describing tool input
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(mcp_server_id) REFERENCES mcp_servers(id) ON DELETE CASCADE,
  FOREIGN KEY(endpoint_id) REFERENCES endpoints(id) ON DELETE CASCADE
);
`);

function normalizeEndpoint(row) {
  if (!row) return null;
  return {
    ...row,
    response_status: Number(row.response_status ?? 200),
    response_delay_ms: Number(row.response_delay_ms ?? 0),
    enabled: Boolean(row.enabled),
    response_is_json: Boolean(row.response_is_json),
    template_enabled: Boolean(row.template_enabled)
  };
}

export function allEndpoints() {
  const rows = db.prepare(`
    SELECT * FROM endpoints
    ORDER BY path ASC, method ASC
  `).all();
  return rows.map(normalizeEndpoint);
}

export function getEndpoint(id) {
  const row = db.prepare('SELECT * FROM endpoints WHERE id = ?').get(id);
  return normalizeEndpoint(row);
}

export function upsertEndpoint(route) {
  const now = new Date().toISOString();
  const record = {
    id: route.id,
    name: route.name || '',
    description: route.description || '',
    method: route.method || 'GET',
    path: route.path || '/',
    enabled: route.enabled ? 1 : 0,
    match_headers: route.match_headers || '{}',
    response_status: Number.isFinite(route.response_status) ? Number(route.response_status) : 200,
    response_headers: route.response_headers || '{}',
    response_body: route.response_body ?? '',
    response_is_json: route.response_is_json ? 1 : 0,
    response_delay_ms: Number.isFinite(route.response_delay_ms) ? Number(route.response_delay_ms) : 0,
    template_enabled: route.template_enabled ? 1 : 0,
    created_at: route.created_at || now,
    updated_at: now
  };

  db.prepare(`
    INSERT INTO endpoints (
      id, name, description, method, path, enabled, match_headers,
      response_status, response_headers, response_body, response_is_json,
      response_delay_ms, template_enabled, created_at, updated_at
    ) VALUES (
      @id, @name, @description, @method, @path, @enabled, @match_headers,
      @response_status, @response_headers, @response_body, @response_is_json,
      @response_delay_ms, @template_enabled, @created_at, @updated_at
    )
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      method = excluded.method,
      path = excluded.path,
      enabled = excluded.enabled,
      match_headers = excluded.match_headers,
      response_status = excluded.response_status,
      response_headers = excluded.response_headers,
      response_body = excluded.response_body,
      response_is_json = excluded.response_is_json,
      response_delay_ms = excluded.response_delay_ms,
      template_enabled = excluded.template_enabled,
      updated_at = excluded.updated_at
  `).run(record);

  return normalizeEndpoint(record);
}

export function deleteEndpoint(id) {
  db.prepare('DELETE FROM endpoints WHERE id = ?').run(id);
}

export function listVars(endpointId) {
  return db.prepare('SELECT * FROM endpoint_vars WHERE endpoint_id = ? ORDER BY k ASC').all(endpointId);
}

export function getVarByKey(endpointId, k) {
  return db.prepare('SELECT * FROM endpoint_vars WHERE endpoint_id = ? AND k = ?').get(endpointId, k);
}

export function upsertVar(row) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO endpoint_vars (id, endpoint_id, k, v, created_at, updated_at)
    VALUES (@id, @endpoint_id, @k, @v, @created_at, @updated_at)
    ON CONFLICT(endpoint_id, k) DO UPDATE SET v=excluded.v, updated_at='${now}'
  `).run({ ...row, created_at: row.created_at || now, updated_at: now });
}

export function deleteVar(endpointId, k) {
  db.prepare('DELETE FROM endpoint_vars WHERE endpoint_id = ? AND k = ?').run(endpointId, k);
}

export function insertLog(log) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO api_logs (id, endpoint_id, method, path, matched_params, query, headers, body, status, response_ms, created_at)
    VALUES (@id, @endpoint_id, @method, @path, @matched_params, @query, @headers, @body, @status, @response_ms, @created_at)
  `).run({ ...log, created_at: now });
}

export function listLogs(endpointId, limit = 100, offset = 0) {
  if (endpointId) {
    return db.prepare('SELECT * FROM api_logs WHERE endpoint_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?')
      .all(endpointId, limit, offset);
  }
  return db.prepare('SELECT * FROM api_logs ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset);
}

export function getLog(id) {
  return db.prepare('SELECT * FROM api_logs WHERE id = ?').get(id);
}

export default {
  db,
  allEndpoints,
  getEndpoint,
  upsertEndpoint,
  deleteEndpoint,
  listVars,
  getVarByKey,
  upsertVar,
  deleteVar,
  insertLog,
  listLogs,
  getLog
};
