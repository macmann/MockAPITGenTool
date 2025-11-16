import path from 'path';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { nanoid } from 'nanoid';

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
  slug TEXT NOT NULL UNIQUE,
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
  name TEXT NOT NULL,
  description TEXT,
  input_schema_json TEXT DEFAULT '{}',
  http_method TEXT NOT NULL DEFAULT 'GET',
  base_url TEXT DEFAULT '',
  path_template TEXT DEFAULT '',
  query_mapping_json TEXT DEFAULT '{}',
  body_mapping_json TEXT DEFAULT '{}',
  headers_mapping_json TEXT DEFAULT '{}',
  enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(mcp_server_id, name),
  FOREIGN KEY(mcp_server_id) REFERENCES mcp_servers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS mcp_auth_configs (
  id TEXT PRIMARY KEY,
  mcp_server_id TEXT NOT NULL UNIQUE,
  auth_type TEXT NOT NULL DEFAULT 'none',
  api_key_header_name TEXT,
  api_key_value TEXT,
  bearer_token TEXT,
  basic_username TEXT,
  basic_password TEXT,
  extra_headers_json TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(mcp_server_id) REFERENCES mcp_servers(id) ON DELETE CASCADE
);
`);

function ensureMcpToolsSchema() {
  const columns = db.prepare('PRAGMA table_info(mcp_tools)').all();
  if (!Array.isArray(columns)) {
    return;
  }

  const columnNames = new Set(columns.map((column) => column.name));
  const addedColumns = [];

  if (!columnNames.has('input_schema_json')) {
    db.exec("ALTER TABLE mcp_tools ADD COLUMN input_schema_json TEXT DEFAULT '{}'");
    addedColumns.push('input_schema_json');
  }

  if (!columnNames.has('http_method')) {
    db.exec("ALTER TABLE mcp_tools ADD COLUMN http_method TEXT NOT NULL DEFAULT 'GET'");
  }

  if (!columnNames.has('base_url')) {
    db.exec("ALTER TABLE mcp_tools ADD COLUMN base_url TEXT DEFAULT ''");
  }

  if (!columnNames.has('path_template')) {
    db.exec("ALTER TABLE mcp_tools ADD COLUMN path_template TEXT DEFAULT ''");
  }

  if (!columnNames.has('query_mapping_json')) {
    db.exec("ALTER TABLE mcp_tools ADD COLUMN query_mapping_json TEXT DEFAULT '{}'");
  }

  if (!columnNames.has('body_mapping_json')) {
    db.exec("ALTER TABLE mcp_tools ADD COLUMN body_mapping_json TEXT DEFAULT '{}'");
  }

  if (!columnNames.has('headers_mapping_json')) {
    db.exec("ALTER TABLE mcp_tools ADD COLUMN headers_mapping_json TEXT DEFAULT '{}'");
  }

  if (!columnNames.has('enabled')) {
    db.exec('ALTER TABLE mcp_tools ADD COLUMN enabled INTEGER DEFAULT 1');
  }

  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_mcp_tools_server_name ON mcp_tools(mcp_server_id, name)');

  if (addedColumns.includes('input_schema_json') && columnNames.has('arg_schema')) {
    db.exec("UPDATE mcp_tools SET input_schema_json = COALESCE(NULLIF(arg_schema, ''), '{}') WHERE input_schema_json IS NULL OR input_schema_json = ''");
  }

  db.exec("UPDATE mcp_tools SET input_schema_json = COALESCE(NULLIF(input_schema_json, ''), '{}')");
  db.exec("UPDATE mcp_tools SET query_mapping_json = COALESCE(NULLIF(query_mapping_json, ''), '{}')");
  db.exec("UPDATE mcp_tools SET body_mapping_json = COALESCE(NULLIF(body_mapping_json, ''), '{}')");
  db.exec("UPDATE mcp_tools SET headers_mapping_json = COALESCE(NULLIF(headers_mapping_json, ''), '{}')");
  db.exec('UPDATE mcp_tools SET enabled = 1 WHERE enabled IS NULL');
}

function ensureMcpAuthSchema() {
  const columns = db.prepare('PRAGMA table_info(mcp_auth_configs)').all();
  if (!Array.isArray(columns) || columns.length === 0) {
    return;
  }

  const columnNames = new Set(columns.map((column) => column.name));
  if (!columnNames.has('extra_headers_json')) {
    db.exec("ALTER TABLE mcp_auth_configs ADD COLUMN extra_headers_json TEXT DEFAULT '{}'");
  }

  db.exec("UPDATE mcp_auth_configs SET extra_headers_json = COALESCE(NULLIF(extra_headers_json, ''), '{}')");
}

ensureMcpToolsSchema();
ensureMcpAuthSchema();

const MCP_SLUG_PATTERN = /^[a-z0-9-]+$/;

export function slugifyMcpSlug(value) {
  if (value === undefined || value === null) {
    return '';
  }

  const normalized = String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized;
}

function fallbackSlugSeed(row) {
  const rawId = typeof row?.id === 'string' ? row.id : nanoid(6);
  const sanitizedId = String(rawId)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');

  return sanitizedId ? `mcp-${sanitizedId}` : `mcp-${nanoid(6).toLowerCase()}`;
}

function ensureUniqueSlugFromSet(baseSlug, usedSet) {
  let slug = baseSlug || 'mcp-server';
  if (!slug) {
    slug = 'mcp-server';
  }

  let attempt = slug;
  let counter = 1;
  while (usedSet.has(attempt)) {
    attempt = `${slug}-${counter++}`;
  }

  usedSet.add(attempt);
  return attempt;
}

let getMcpServerBySlugStmt = null;
let getMcpServerIdBySlugStmt = null;

function ensureMcpSlugSetup() {
  const columns = db.prepare('PRAGMA table_info(mcp_servers)').all();
  const hasSlugColumn = columns.some((column) => column.name === 'slug');

  if (!hasSlugColumn) {
    db.exec('ALTER TABLE mcp_servers ADD COLUMN slug TEXT');
  }

  const serverRows = db.prepare('SELECT id, name, slug FROM mcp_servers ORDER BY created_at ASC').all();
  const usedSlugs = new Set();
  const updateStmt = db.prepare('UPDATE mcp_servers SET slug = ? WHERE id = ?');

  for (const row of serverRows) {
    const existingSlug = slugifyMcpSlug(row.slug);
    let candidate = existingSlug || slugifyMcpSlug(row.name);

    if (!candidate) {
      candidate = slugifyMcpSlug(fallbackSlugSeed(row));
    }

    if (!candidate || !MCP_SLUG_PATTERN.test(candidate)) {
      candidate = 'mcp-server';
    }

    const resolvedSlug = ensureUniqueSlugFromSet(candidate, usedSlugs);

    if (resolvedSlug !== existingSlug || row.slug !== resolvedSlug) {
      updateStmt.run(resolvedSlug, row.id);
    }
  }

  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_mcp_servers_slug ON mcp_servers(slug)');

  getMcpServerBySlugStmt = db.prepare('SELECT * FROM mcp_servers WHERE slug = ?');
  getMcpServerIdBySlugStmt = db.prepare('SELECT id FROM mcp_servers WHERE slug = ?');
}

ensureMcpSlugSetup();

function getSlugRecord(slug) {
  if (!slug || typeof slug !== 'string') return null;
  if (!getMcpServerBySlugStmt) return null;
  return getMcpServerBySlugStmt.get(slug);
}

function getSlugOwnerId(slug) {
  if (!slug || typeof slug !== 'string') return null;
  if (!getMcpServerIdBySlugStmt) return null;
  const row = getMcpServerIdBySlugStmt.get(slug);
  return row ? row.id : null;
}

function slugIsTaken(slug, excludeId) {
  const ownerId = getSlugOwnerId(slug);
  if (!ownerId) return false;
  if (!excludeId) return true;
  return ownerId !== excludeId;
}

function generateUniqueMcpSlug(baseSlug, excludeId) {
  let slug = baseSlug && MCP_SLUG_PATTERN.test(baseSlug) ? baseSlug : slugifyMcpSlug(baseSlug);
  if (!slug) {
    slug = 'mcp-server';
  }

  let attempt = slug;
  let counter = 1;
  while (slugIsTaken(attempt, excludeId)) {
    attempt = `${slug}-${counter++}`;
  }
  return attempt;
}

export function findMcpServerBySlug(slug) {
  const normalized = slugifyMcpSlug(slug);
  if (!normalized) return null;
  const row = getSlugRecord(normalized);
  return normalizeMcpServer(row);
}

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

function normalizeMcpServer(row) {
  if (!row) return null;
  return {
    ...row,
    slug: slugifyMcpSlug(row.slug),
    is_enabled: row.is_enabled ? 1 : 0
  };
}

const DEFAULT_JSON_TEXT = '{}';
const VALID_HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']);
const MCP_TOOL_NAME_PATTERN = /^[A-Za-z0-9_-]+$/;
const VALID_AUTH_TYPES = new Set(['none', 'api_key_header', 'bearer_token', 'basic']);

function coerceOptionalString(value, fallback = '') {
  if (value === undefined || value === null) {
    return fallback;
  }
  return String(value);
}

function normalizeHttpMethod(method) {
  const upper = String(method || '')
    .trim()
    .toUpperCase();

  if (VALID_HTTP_METHODS.has(upper)) {
    return upper;
  }

  return 'GET';
}

function assertValidMcpHttpMethod(method) {
  const normalized = normalizeHttpMethod(method);
  if (!VALID_HTTP_METHODS.has(normalized)) {
    throw new Error('HTTP method must be one of GET, POST, PUT, DELETE, or PATCH.');
  }
  return normalized;
}

function validateOptionalBaseUrl(value) {
  const text = coerceOptionalString(value).trim();
  if (!text) return '';
  if (!/^https?:\/\//i.test(text)) {
    throw new Error('Base URL must start with http:// or https://');
  }
  return text;
}

function coerceJsonText(value, fallback = DEFAULT_JSON_TEXT) {
  if (value === undefined || value === null) {
    return fallback;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : fallback;
  }

  try {
    return JSON.stringify(value);
  } catch (err) {
    console.warn('[DB] Failed to stringify JSON text payload', err);
    return fallback;
  }
}

function coerceAuthType(value) {
  if (!value || typeof value !== 'string') {
    return 'none';
  }
  const normalized = value.trim().toLowerCase();
  return VALID_AUTH_TYPES.has(normalized) ? normalized : 'none';
}

function normalizeMcpTool(row) {
  if (!row) return null;
  return {
    ...row,
    http_method: normalizeHttpMethod(row.http_method),
    input_schema_json: row.input_schema_json ? String(row.input_schema_json) : DEFAULT_JSON_TEXT,
    query_mapping_json: row.query_mapping_json ? String(row.query_mapping_json) : DEFAULT_JSON_TEXT,
    body_mapping_json: row.body_mapping_json ? String(row.body_mapping_json) : DEFAULT_JSON_TEXT,
    headers_mapping_json: row.headers_mapping_json ? String(row.headers_mapping_json) : DEFAULT_JSON_TEXT,
    enabled: row.enabled === undefined ? true : Boolean(row.enabled)
  };
}

function normalizeMcpAuthConfig(row) {
  if (!row) return null;
  return {
    ...row,
    auth_type: coerceAuthType(row.auth_type),
    extra_headers_json: row.extra_headers_json ? String(row.extra_headers_json) : DEFAULT_JSON_TEXT
  };
}

export function allEndpoints() {
  const rows = db.prepare(`
    SELECT * FROM endpoints
    ORDER BY path ASC, method ASC
  `).all();
  return rows.map(normalizeEndpoint);
}

function mapEndpointToApiDefinition(endpoint) {
  if (!endpoint) return null;
  return {
    id: endpoint.id,
    name: endpoint.name || endpoint.path || endpoint.method,
    method: endpoint.method,
    path: endpoint.path,
    description: endpoint.description || '',
    baseUrl: ''
  };
}

export function listExistingApiDefinitions() {
  return allEndpoints().map(mapEndpointToApiDefinition).filter(Boolean);
}

export function getExistingApiById(apiId) {
  const endpoint = getEndpoint(apiId);
  return mapEndpointToApiDefinition(endpoint);
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

export function listMcpServers() {
  const rows = db.prepare('SELECT * FROM mcp_servers ORDER BY created_at DESC').all();
  return rows.map(normalizeMcpServer);
}

export function getMcpServer(id) {
  const row = db.prepare('SELECT * FROM mcp_servers WHERE id = ?').get(id);
  return normalizeMcpServer(row);
}

export function upsertMcpServer(row) {
  const now = new Date().toISOString();
  const recordId = row.id && String(row.id).trim() ? row.id : nanoid(12);
  const baseRecord = {
    id: recordId,
    name: row.name || '',
    description: row.description || '',
    base_url: validateOptionalBaseUrl(row.base_url || ''),
    api_key_header: row.api_key_header || '',
    api_key_value: row.api_key_value || '',
    is_enabled: row.is_enabled ? 1 : 0
  };

  const rawSlugInput = typeof row.slug === 'string' ? row.slug.trim() : '';
  let slug;

  if (rawSlugInput) {
    const normalized = slugifyMcpSlug(rawSlugInput);
    if (!normalized || !MCP_SLUG_PATTERN.test(normalized)) {
      throw new Error('Slug may only include lowercase letters, digits, or hyphens.');
    }
    if (slugIsTaken(normalized, recordId)) {
      throw new Error('Slug is already in use. Choose a different slug.');
    }
    slug = normalized;
  } else {
    const nameBasedSlug = slugifyMcpSlug(baseRecord.name) || slugifyMcpSlug(fallbackSlugSeed(baseRecord));
    slug = generateUniqueMcpSlug(nameBasedSlug, recordId);
  }

  const payload = { ...baseRecord, slug };

  if (!row.id) {
    db.prepare(`
      INSERT INTO mcp_servers (id, name, slug, description, base_url, api_key_header, api_key_value, is_enabled, created_at, updated_at)
      VALUES (@id, @name, @slug, @description, @base_url, @api_key_header, @api_key_value, @is_enabled, @created_at, @updated_at)
    `).run({ ...payload, created_at: now, updated_at: now });
  } else {
    db.prepare(`
      UPDATE mcp_servers
      SET name=@name,
          slug=@slug,
          description=@description,
          base_url=@base_url,
          api_key_header=@api_key_header,
          api_key_value=@api_key_value,
          is_enabled=@is_enabled,
          updated_at=@updated_at
      WHERE id=@id
    `).run({ ...payload, updated_at: now });
  }

  return getMcpServer(payload.id);
}

export function deleteMcpServer(id) {
  db.prepare('DELETE FROM mcp_servers WHERE id = ?').run(id);
}

export function setMcpServerEnabled(id, enabled) {
  if (!id) {
    throw new Error('MCP server id is required');
  }

  const now = new Date().toISOString();
  db.prepare(
    'UPDATE mcp_servers SET is_enabled = ?, updated_at = ? WHERE id = ?'
  ).run(enabled ? 1 : 0, now, id);

  return getMcpServer(id);
}

export function findDefaultEnabledMcpServer() {
  const row = db
    .prepare(
      'SELECT * FROM mcp_servers WHERE is_enabled = 1 ORDER BY created_at ASC LIMIT 1'
    )
    .get();
  return normalizeMcpServer(row);
}

function getMcpToolRow(id) {
  if (!id) return null;
  return db.prepare('SELECT * FROM mcp_tools WHERE id = ?').get(id);
}

export function getMcpTool(id) {
  const row = getMcpToolRow(id);
  return normalizeMcpTool(row);
}

export function getMcpToolByName(mcpServerId, name) {
  if (!mcpServerId || !name) return null;
  const row = db
    .prepare('SELECT * FROM mcp_tools WHERE mcp_server_id = ? AND name = ? LIMIT 1')
    .get(mcpServerId, name);
  return normalizeMcpTool(row);
}

export function listMcpToolsByServerId(mcpServerId, options = {}) {
  if (!mcpServerId) return [];
  const { includeDisabled = false } = options;
  const query = includeDisabled
    ? 'SELECT * FROM mcp_tools WHERE mcp_server_id = ? ORDER BY created_at DESC'
    : 'SELECT * FROM mcp_tools WHERE mcp_server_id = ? AND enabled = 1 ORDER BY created_at DESC';
  const rows = db.prepare(query).all(mcpServerId);
  return rows.map(normalizeMcpTool);
}

export function createMcpTool(toolData) {
  const payload = toolData || {};
  const serverId = payload.mcp_server_id ? String(payload.mcp_server_id).trim() : '';
  if (!serverId) {
    throw new Error('mcp_server_id is required to create an MCP tool');
  }

  const serverRecord = getMcpServer(serverId);
  if (!serverRecord) {
    throw new Error('MCP server not found for tool creation');
  }

  const name = payload.name ? String(payload.name).trim() : '';
  if (!name) {
    throw new Error('Tool name is required');
  }
  if (/\s/.test(name)) {
    throw new Error('Tool name cannot include spaces. Use dashes or underscores.');
  }
  if (!MCP_TOOL_NAME_PATTERN.test(name)) {
    throw new Error('Tool name may only include letters, numbers, hyphens, or underscores.');
  }

  const conflict = db
    .prepare('SELECT id FROM mcp_tools WHERE mcp_server_id = ? AND name = ? LIMIT 1')
    .get(serverRecord.id, name);
  if (conflict) {
    throw new Error('A tool with this name already exists for the specified MCP server.');
  }

  const now = new Date().toISOString();
  let httpMethod = payload.http_method ?? payload.method ?? 'GET';
  let pathTemplate = payload.path_template ?? payload.path ?? '';
  const baseUrlInput =
    payload.base_url !== undefined ? payload.base_url : serverRecord.base_url || '';

  if (payload.endpoint_id) {
    const endpoint = getEndpoint(payload.endpoint_id);
    if (!endpoint) {
      throw new Error('Endpoint not found for provided endpoint_id');
    }
    httpMethod = endpoint.method;
    pathTemplate = endpoint.path;
  }

  const resolvedHttpMethod = assertValidMcpHttpMethod(httpMethod);
  const resolvedBaseUrl = validateOptionalBaseUrl(baseUrlInput);

  const record = {
    id: payload.id && String(payload.id).trim() ? String(payload.id).trim() : nanoid(12),
    mcp_server_id: serverRecord.id,
    name,
    description: coerceOptionalString(payload.description),
    input_schema_json: coerceJsonText(
      payload.input_schema_json ?? payload.arg_schema ?? DEFAULT_JSON_TEXT,
      DEFAULT_JSON_TEXT
    ),
    http_method: resolvedHttpMethod,
    base_url: resolvedBaseUrl,
    path_template: coerceOptionalString(pathTemplate),
    query_mapping_json: coerceJsonText(payload.query_mapping_json, DEFAULT_JSON_TEXT),
    body_mapping_json: coerceJsonText(payload.body_mapping_json, DEFAULT_JSON_TEXT),
    headers_mapping_json: coerceJsonText(payload.headers_mapping_json, DEFAULT_JSON_TEXT),
    enabled: payload.enabled === undefined || payload.enabled === null ? 1 : payload.enabled ? 1 : 0,
    created_at: payload.created_at || now,
    updated_at: now
  };

  db.prepare(`
    INSERT INTO mcp_tools (
      id, mcp_server_id, name, description, input_schema_json, http_method, base_url,
      path_template, query_mapping_json, body_mapping_json, headers_mapping_json,
      enabled, created_at, updated_at
    ) VALUES (
      @id, @mcp_server_id, @name, @description, @input_schema_json, @http_method, @base_url,
      @path_template, @query_mapping_json, @body_mapping_json, @headers_mapping_json,
      @enabled, @created_at, @updated_at
    )
  `).run(record);

  return getMcpTool(record.id);
}

export function updateMcpTool(id, updates = {}) {
  if (!id) {
    throw new Error('Tool id is required');
  }

  const existing = getMcpToolRow(id);
  if (!existing) {
    throw new Error('MCP tool not found');
  }

  const changes = {};
  const updatedName = updates.name !== undefined ? String(updates.name).trim() : undefined;
  if (updatedName !== undefined) {
    if (!updatedName) {
      throw new Error('Tool name cannot be empty');
    }
    if (/\s/.test(updatedName)) {
      throw new Error('Tool name cannot include spaces. Use dashes or underscores.');
    }
    if (!MCP_TOOL_NAME_PATTERN.test(updatedName)) {
      throw new Error('Tool name may only include letters, numbers, hyphens, or underscores.');
    }
    const conflict = db
      .prepare('SELECT id FROM mcp_tools WHERE mcp_server_id = ? AND name = ? AND id != ? LIMIT 1')
      .get(existing.mcp_server_id, updatedName, id);
    if (conflict) {
      throw new Error('A tool with this name already exists for the specified MCP server.');
    }
    changes.name = updatedName;
  }

  if (updates.description !== undefined) {
    changes.description = coerceOptionalString(updates.description);
  }

  if (updates.input_schema_json !== undefined || updates.arg_schema !== undefined) {
    changes.input_schema_json = coerceJsonText(
      updates.input_schema_json ?? updates.arg_schema,
      DEFAULT_JSON_TEXT
    );
  }

  if (updates.http_method !== undefined || updates.method !== undefined) {
    changes.http_method = assertValidMcpHttpMethod(updates.http_method ?? updates.method);
  }

  if (updates.base_url !== undefined) {
    changes.base_url = validateOptionalBaseUrl(updates.base_url);
  }

  if (updates.path_template !== undefined || updates.path !== undefined) {
    changes.path_template = coerceOptionalString(updates.path_template ?? updates.path);
  }

  if (updates.query_mapping_json !== undefined) {
    changes.query_mapping_json = coerceJsonText(updates.query_mapping_json, DEFAULT_JSON_TEXT);
  }

  if (updates.body_mapping_json !== undefined) {
    changes.body_mapping_json = coerceJsonText(updates.body_mapping_json, DEFAULT_JSON_TEXT);
  }

  if (updates.headers_mapping_json !== undefined) {
    changes.headers_mapping_json = coerceJsonText(updates.headers_mapping_json, DEFAULT_JSON_TEXT);
  }

  if (updates.enabled !== undefined) {
    changes.enabled = updates.enabled ? 1 : 0;
  }

  if (Object.keys(changes).length === 0) {
    return normalizeMcpTool(existing);
  }

  const now = new Date().toISOString();
  changes.updated_at = now;
  changes.id = id;

  const assignments = Object.keys(changes)
    .filter((key) => key !== 'id')
    .map((key) => `${key}=@${key}`)
    .join(', ');

  db.prepare(`UPDATE mcp_tools SET ${assignments} WHERE id=@id`).run(changes);

  return getMcpTool(id);
}

export function deleteMcpTool(id) {
  if (!id) return;
  db.prepare('DELETE FROM mcp_tools WHERE id = ?').run(id);
}

export function listMcpTools(mcpServerId) {
  return listMcpToolsByServerId(mcpServerId, { includeDisabled: true }).map((tool) => ({
    ...tool,
    arg_schema: tool.input_schema_json
  }));
}

export function listMcpToolsWithEndpoints(mcpServerId) {
  return listMcpToolsByServerId(mcpServerId, { includeDisabled: true }).map((tool) => ({
    ...tool,
    method: tool.http_method,
    path: tool.path_template,
    arg_schema: tool.input_schema_json
  }));
}

export function upsertMcpTool(row) {
  if (!row) {
    throw new Error('Tool payload is required');
  }

  const hasId = row.id && String(row.id).trim();
  if (!hasId) {
    const payload = { ...row };
    if (row.endpoint_id) {
      const endpoint = getEndpoint(row.endpoint_id);
      if (!endpoint) {
        throw new Error('Endpoint not found for provided endpoint_id');
      }
      payload.method = endpoint.method;
      payload.path = endpoint.path;
    }

    if (row.arg_schema !== undefined && payload.input_schema_json === undefined) {
      payload.input_schema_json = row.arg_schema;
    }

    delete payload.endpoint_id;

    return createMcpTool(payload);
  }

  const updates = { ...row };
  delete updates.id;
  delete updates.endpoint_id;

  if (row.endpoint_id) {
    const endpoint = getEndpoint(row.endpoint_id);
    if (!endpoint) {
      throw new Error('Endpoint not found for provided endpoint_id');
    }
    updates.method = endpoint.method;
    updates.path = endpoint.path;
    if (!updates.base_url) {
      updates.base_url = row.base_url;
    }
  }

  if (row.arg_schema !== undefined && updates.input_schema_json === undefined) {
    updates.input_schema_json = row.arg_schema;
  }

  return updateMcpTool(row.id, updates);
}

export function getMcpAuthConfigByServerId(mcpServerId) {
  if (!mcpServerId) return null;
  const row = db.prepare('SELECT * FROM mcp_auth_configs WHERE mcp_server_id = ?').get(mcpServerId);
  return normalizeMcpAuthConfig(row);
}

export function upsertMcpAuthConfig(mcpServerId, authData = {}) {
  if (!mcpServerId) {
    throw new Error('mcpServerId is required to upsert auth config');
  }

  const server = getMcpServer(mcpServerId);
  if (!server) {
    throw new Error('MCP server not found for auth configuration');
  }

  const existing = getMcpAuthConfigByServerId(mcpServerId);
  const now = new Date().toISOString();
  const authType = coerceAuthType(authData.auth_type);

  const resolved = {
    auth_type: authType,
    api_key_header_name: '',
    api_key_value: '',
    bearer_token: '',
    basic_username: '',
    basic_password: ''
  };

  if (authType === 'api_key_header') {
    resolved.api_key_header_name = coerceOptionalString(
      authData.api_key_header_name,
      existing?.api_key_header_name || ''
    );
    resolved.api_key_value = coerceOptionalString(
      authData.api_key_value,
      existing?.api_key_value || ''
    );
  } else if (authType === 'bearer_token') {
    resolved.bearer_token = coerceOptionalString(authData.bearer_token, existing?.bearer_token || '');
  } else if (authType === 'basic') {
    resolved.basic_username = coerceOptionalString(
      authData.basic_username,
      existing?.basic_username || ''
    );
    resolved.basic_password = coerceOptionalString(
      authData.basic_password,
      existing?.basic_password || ''
    );
  }

  const payload = {
    id:
      (existing && existing.id) ||
      (authData.id && String(authData.id).trim()) ||
      nanoid(12),
    mcp_server_id: server.id,
    auth_type: resolved.auth_type,
    api_key_header_name: resolved.api_key_header_name,
    api_key_value: resolved.api_key_value,
    bearer_token: resolved.bearer_token,
    basic_username: resolved.basic_username,
    basic_password: resolved.basic_password,
    extra_headers_json: coerceJsonText(
      authData.extra_headers_json ?? existing?.extra_headers_json,
      DEFAULT_JSON_TEXT
    ),
    created_at: existing?.created_at || now,
    updated_at: now
  };

  db.prepare(`
    INSERT INTO mcp_auth_configs (
      id, mcp_server_id, auth_type, api_key_header_name, api_key_value,
      bearer_token, basic_username, basic_password, extra_headers_json,
      created_at, updated_at
    ) VALUES (
      @id, @mcp_server_id, @auth_type, @api_key_header_name, @api_key_value,
      @bearer_token, @basic_username, @basic_password, @extra_headers_json,
      @created_at, @updated_at
    )
    ON CONFLICT(mcp_server_id) DO UPDATE SET
      auth_type=excluded.auth_type,
      api_key_header_name=excluded.api_key_header_name,
      api_key_value=excluded.api_key_value,
      bearer_token=excluded.bearer_token,
      basic_username=excluded.basic_username,
      basic_password=excluded.basic_password,
      extra_headers_json=excluded.extra_headers_json,
      updated_at=excluded.updated_at
  `).run(payload);

  return getMcpAuthConfigByServerId(mcpServerId);
}

export function getMcpServerWithTools(mcpServerId, options = {}) {
  const server = getMcpServer(mcpServerId);
  if (!server) return null;
  const tools = listMcpToolsByServerId(mcpServerId, options);
  const authConfig = getMcpAuthConfigByServerId(mcpServerId);
  return { ...server, tools, authConfig };
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
  getLog,
  listMcpServers,
  getMcpServer,
  findMcpServerBySlug,
  findDefaultEnabledMcpServer,
  upsertMcpServer,
  deleteMcpServer,
  listExistingApiDefinitions,
  getExistingApiById,
  createMcpTool,
  listMcpToolsByServerId,
  listMcpTools,
  getMcpTool,
  getMcpToolByName,
  updateMcpTool,
  upsertMcpTool,
  deleteMcpTool,
  listMcpToolsWithEndpoints,
  getMcpAuthConfigByServerId,
  upsertMcpAuthConfig,
  getMcpServerWithTools,
  slugifyMcpSlug
};
