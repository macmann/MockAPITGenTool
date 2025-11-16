import path from 'path';
import express from 'express';
import morgan from 'morgan';
import helmet from 'helmet';
import compression from 'compression';
import createError from 'http-errors';
import { fileURLToPath } from 'url';
import { nanoid } from 'nanoid';
import YAML from 'yaml';

import { buildRuntimeRouter } from './router-runtime.js';
import {
  allEndpoints,
  getEndpoint,
  upsertEndpoint,
  deleteEndpoint,
  listVars,
  upsertVar,
  deleteVar,
  listLogs,
  getLog,
  listMcpServers,
  getMcpServer,
  getMcpServerWithTools,
  findMcpServerBySlug,
  findDefaultEnabledMcpServer,
  upsertMcpServer,
  deleteMcpServer,
  setMcpServerEnabled,
  listExistingApiDefinitions,
  getExistingApiById,
  createMcpTool,
  listMcpTools,
  listMcpToolsWithEndpoints,
  upsertMcpTool,
  deleteMcpTool,
  slugifyMcpSlug
} from './db.js';
import { createMcpRouter } from '../mcp-express.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const ADMIN_KEY = process.env.ADMIN_KEY || process.env.ADMIN_TOKEN || process.env.ADMIN_SECRET || '';
const SUPPORTED_HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']);

function truncateHeadersForLog(headers = {}) {
  const out = {};
  for (const key in headers) {
    if (!Object.prototype.hasOwnProperty.call(headers, key)) continue;
    let value = String(headers[key]);
    if (value.length > 200) {
      value = `${value.slice(0, 200)}...[truncated]`;
    }
    out[key] = value;
  }
  return out;
}

function previewPayloadForLog(payload) {
  if (payload === undefined) return '[undefined]';
  if (payload === null) return 'null';
  if (typeof payload === 'string') {
    return payload.length > 300 ? `${payload.slice(0, 300)}...[truncated]` : payload;
  }
  try {
    const serialized = JSON.stringify(payload);
    return serialized.length > 300 ? `${serialized.slice(0, 300)}...[truncated]` : serialized;
  } catch (err) {
    return `[unserializable payload: ${err?.message || err}]`;
  }
}

const mcpRouter = createMcpRouter();

app.use('/mcp', (req, res, next) => {
  const origEnd = res.end;
  res.end = function (...args) {
    console.log('[MCP] Response end', {
      time: new Date().toISOString(),
      status: res.statusCode
    });
    return origEnd.apply(this, args);
  };
  next();
});

app.use(
  express.json({
    limit: '1mb',
    verify: (req, res, buf) => {
      if (req.originalUrl?.startsWith('/mcp')) {
        req.rawBody = buf && buf.length > 0 ? buf.toString('utf8') : '[empty body]';
      }
    }
  })
);

app.use('/mcp', (err, req, res, next) => {
  if (!err) {
    return next();
  }

  const logTime = new Date().toISOString();
  console.error('[MCP] Handler error', {
    time: logTime,
    error: err?.stack || String(err)
  });

  if (!req.__mcpLogged) {
    const bodyForLog =
      typeof req.rawBody === 'string'
        ? req.rawBody
        : previewPayloadForLog(req.body ?? '[empty body]');
    console.log('[MCP] Incoming request', {
      time: logTime,
      method: req.method,
      url: req.originalUrl,
      headers: truncateHeadersForLog(req.headers || {}),
      body: bodyForLog
    });
    req.__mcpLogged = true;
  }

  if (res.headersSent) {
    return next(err);
  }

  const errorResponse = {
    jsonrpc: '2.0',
    id: null,
    error: {
      code: -32700,
      message: 'Parse error: Invalid JSON body'
    }
  };

  const preview = previewPayloadForLog(errorResponse);
  res.status(400).json(errorResponse);
  console.log('[MCP] Response sent', {
    time: new Date().toISOString(),
    status: 400,
    resultPreview: preview
  });
});

app.use(express.urlencoded({ extended: false }));

function sendMcpJsonRpcError(res, status, code, message) {
  return res.status(status).json({
    jsonrpc: '2.0',
    id: null,
    error: {
      code,
      message
    }
  });
}

function resolveMcpServerForSlug(slug) {
  const normalized = slugifyMcpSlug(slug);
  if (!normalized) {
    return null;
  }
  const server = findMcpServerBySlug(normalized);
  if (!server || !server.is_enabled) {
    return null;
  }
  return server;
}

function resolveDefaultMcpServer() {
  const configuredSlug = slugifyMcpSlug(process.env.MCP_DEFAULT_SLUG || '');
  if (configuredSlug) {
    const configuredServer = resolveMcpServerForSlug(configuredSlug);
    if (configuredServer) {
      return configuredServer;
    }
  }
  return findDefaultEnabledMcpServer();
}

function delegateToMcpRouter(req, res, next, server) {
  req.mcpServer = server;
  return mcpRouter(req, res, next);
}

function handleMcpNotFound(res, slug) {
  console.log('[MCP] No server for slug', { slug: slugifyMcpSlug(slug) || slug });
  return sendMcpJsonRpcError(
    res,
    404,
    -32004,
    `MCP server not found or disabled for slug: ${slugifyMcpSlug(slug) || slug}`
  );
}

app.use('/mcp/:slug', (req, res, next) => {
  try {
    const server = resolveMcpServerForSlug(req.params.slug);
    if (!server) {
      return handleMcpNotFound(res, req.params.slug);
    }
    return delegateToMcpRouter(req, res, next, server);
  } catch (err) {
    console.error('[MCP] Error resolving slug', err);
    return sendMcpJsonRpcError(res, 500, -32603, 'Internal MCP server error');
  }
});

function handleDefaultMcpRequest(req, res, next) {
  try {
    const server = resolveDefaultMcpServer();
    if (!server) {
      console.log('[MCP] No default MCP server available for /mcp');
      return sendMcpJsonRpcError(res, 404, -32004, 'No default MCP server is enabled.');
    }
    return delegateToMcpRouter(req, res, next, server);
  } catch (err) {
    console.error('[MCP] Error resolving default MCP server', err);
    return sendMcpJsonRpcError(res, 500, -32603, 'Internal MCP server error');
  }
}

app.all('/mcp', handleDefaultMcpRequest);
app.all('/mcp/', handleDefaultMcpRequest);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(helmet());
app.use(compression());
app.use(morgan('dev'));
app.use('/public', express.static(path.join(__dirname, 'public')));


function requireAdmin(req, res, next) {
  if (!ADMIN_KEY) {
    return next();
  }

  const provided = req.query.key || req.get('x-admin-key') || req.body?.key;
  if (provided && provided === ADMIN_KEY) {
    res.locals.adminKey = provided;
    return next();
  }

  if (req.accepts('json') && !req.accepts('html')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const params = new URLSearchParams();
  if (req.originalUrl) {
    params.set('next', req.originalUrl);
  }
  if (provided && provided !== ADMIN_KEY) {
    params.set('error', '1');
  }

  const redirectTarget = `/admin/login${params.toString() ? `?${params.toString()}` : ''}`;
  return res.redirect(redirectTarget);
}

function endpointDefaults() {
  return {
    id: '',
    name: '',
    description: '',
    method: 'GET',
    path: '/',
    enabled: true,
    match_headers: '{}',
    response_status: 200,
    response_headers: '{}',
    response_body: '',
    response_is_json: false,
    response_delay_ms: 0,
    template_enabled: false
  };
}

function persistAdminKey(req, res) {
  const key = req.query.key || req.body?.key || res?.locals?.adminKey;
  return key ? `?key=${encodeURIComponent(key)}` : '';
}

function getAdminKeyValue(req, res) {
  return req.query.key || req.body?.key || res?.locals?.adminKey || '';
}

function buildAdminRedirect(path, req, res, extras = {}) {
  const params = new URLSearchParams();
  const adminKey = getAdminKeyValue(req, res);
  if (adminKey) {
    params.set('key', adminKey);
  }

  for (const [k, v] of Object.entries(extras)) {
    if (v === undefined || v === null) continue;
    params.set(k, String(v));
  }

  const search = params.toString();
  return `${path}${search ? `?${search}` : ''}`;
}

function buildMcpPath(slug) {
  const normalized = slugifyMcpSlug(slug);
  return normalized ? `/mcp/${normalized}` : '/mcp';
}

function appendSlugToBase(base, slug) {
  if (!base) return null;
  const trimmedBase = String(base).trim();
  if (!trimmedBase) return null;
  const normalizedBase = trimmedBase.replace(/[/]+$/, '');
  const normalizedSlug = slugifyMcpSlug(slug);
  if (!normalizedSlug) {
    return normalizedBase || null;
  }
  if (normalizedBase.endsWith(`/mcp/${normalizedSlug}`)) {
    return normalizedBase;
  }
  if (normalizedBase.endsWith('/mcp')) {
    return `${normalizedBase}/${normalizedSlug}`;
  }
  return `${normalizedBase}/mcp/${normalizedSlug}`;
}

function buildMcpUrl(base, slug) {
  return appendSlugToBase(base, slug) || buildMcpPath(slug);
}

function deriveBaseUrl(req, server) {
  const stored = typeof server?.base_url === 'string' ? server.base_url.trim() : '';
  if (stored) return stored;
  const hostHeader = req.get('host');
  return hostHeader ? `${req.protocol}://${hostHeader}` : '';
}

function slugifyToolName(value) {
  if (!value) return 'tool';
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_')
    .slice(0, 120) || 'tool';
}

function deriveToolNameFromApi(api) {
  if (!api) return 'tool';
  const candidates = [api.name, `${api.method || ''} ${api.path || ''}`];
  const chosen = candidates.find((value) => value && String(value).trim());
  return slugifyToolName(chosen);
}

function isTruthyInput(value) {
  return value === true || value === 'true' || value === 'on' || value === '1';
}

function buildMcpToolsRenderData(req, mcpServer, key, extras = {}) {
  const baseUrl = deriveBaseUrl(req, mcpServer);
  const existingApis = listExistingApiDefinitions().map((api) => ({
    ...api,
    baseUrl: api.baseUrl || baseUrl
  }));
  const mcpPath = buildMcpPath(mcpServer.slug);
  const mcpUrl = baseUrl ? buildMcpUrl(baseUrl, mcpServer.slug) : mcpPath;

  return {
    title: extras.title || `MCP Tools – ${mcpServer.name}`,
    mcpServer,
    tools: mcpServer.tools || [],
    existingApis,
    key,
    mcpPath,
    mcpUrl,
    ...extras
  };
}

function extractPathParams(pathPattern) {
  if (typeof pathPattern !== 'string') return [];
  const matches = pathPattern.match(/:[A-Za-z0-9_]+/g) || [];
  return matches.map((token) => token.slice(1));
}

function parseJsonSafe(value, fallback) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }
  if (typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }
  try {
    return JSON.parse(trimmed);
  } catch (err) {
    return fallback;
  }
}

function parseJsonObject(value) {
  const parsed = parseJsonSafe(value, {});
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}

function convertPathToOpenApi(pathPattern) {
  if (typeof pathPattern !== 'string' || !pathPattern.trim()) {
    return '/';
  }
  const normalized = pathPattern.startsWith('/') ? pathPattern : `/${pathPattern}`;
  return normalized.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

function inferSchemaFromExample(example) {
  if (Array.isArray(example)) {
    const firstItem = example.length > 0 ? inferSchemaFromExample(example[0]) : {};
    return {
      type: 'array',
      items: firstItem
    };
  }

  if (example === null) {
    return {
      type: 'string',
      nullable: true
    };
  }

  const valueType = typeof example;
  if (valueType === 'object') {
    const properties = {};
    for (const [key, value] of Object.entries(example)) {
      properties[key] = inferSchemaFromExample(value);
    }
    return {
      type: 'object',
      properties
    };
  }

  if (valueType === 'number') {
    return {
      type: Number.isInteger(example) ? 'integer' : 'number'
    };
  }

  if (valueType === 'boolean') {
    return { type: 'boolean' };
  }

  return { type: 'string' };
}

function buildOpenApiDocument(endpoint, req) {
  const pathParams = extractPathParams(endpoint.path);
  const matchHeaders = parseJsonObject(endpoint.match_headers);
  const responseHeaders = parseJsonObject(endpoint.response_headers);
  let declaredContentType = '';

  for (const [headerName, headerValue] of Object.entries(responseHeaders)) {
    if (headerName.toLowerCase() === 'content-type') {
      declaredContentType = String(headerValue || '').trim();
      break;
    }
  }

  const parameters = [];

  for (const paramName of pathParams) {
    parameters.push({
      name: paramName,
      in: 'path',
      required: true,
      schema: { type: 'string' },
      description: `Path parameter ${paramName}`
    });
  }

  for (const [headerName, headerValue] of Object.entries(matchHeaders)) {
    parameters.push({
      name: headerName,
      in: 'header',
      required: true,
      schema: { type: 'string', example: headerValue },
      description: 'Required request header'
    });
  }

  const baseUrl = `${req.protocol}://${req.get('host') || 'localhost'}`;

  let responseContentType = declaredContentType;
  let responseExample = endpoint.response_body ?? '';
  let responseSchema = { type: 'string' };

  if (endpoint.response_is_json) {
    const parsedBody = parseJsonSafe(endpoint.response_body, null);
    if (parsedBody !== null && typeof parsedBody !== 'undefined') {
      responseExample = parsedBody;
      responseSchema = inferSchemaFromExample(parsedBody);
      if (!responseContentType) {
        responseContentType = 'application/json';
      }
    } else {
      responseContentType = responseContentType || 'text/plain';
      responseSchema = { type: 'string' };
      responseExample = endpoint.response_body ?? '';
    }
  } else {
    responseContentType = responseContentType || 'text/plain';
    responseSchema = { type: 'string' };
    responseExample = endpoint.response_body ?? '';
  }

  if (!responseContentType) {
    responseContentType = 'text/plain';
  }

  const responseContent = {
    [responseContentType]: {
      schema: responseSchema,
      example: responseExample
    }
  };

  const responseHeadersSpec = {};
  for (const [headerName, headerValue] of Object.entries(responseHeaders)) {
    responseHeadersSpec[headerName] = {
      schema: { type: 'string' },
      example: headerValue
    };
  }

  const response = {
    description: endpoint.description || `Mock response for ${endpoint.path}`,
    content: responseContent
  };

  if (Object.keys(responseHeadersSpec).length > 0) {
    response.headers = responseHeadersSpec;
  }

  const method = String(endpoint.method || 'get').toLowerCase();
  const operation = {
    summary: endpoint.name || endpoint.path,
    operationId: endpoint.id,
    responses: {
      [String(endpoint.response_status || 200)]: response
    }
  };

  if (endpoint.description) {
    operation.description = endpoint.description;
  }

  if (parameters.length > 0) {
    operation.parameters = parameters;
  }

  operation['x-mock-api-enabled'] = Boolean(endpoint.enabled);

  const openApiPath = convertPathToOpenApi(endpoint.path);

  const info = {
    title: endpoint.name || endpoint.id || 'Mock Endpoint',
    version: '1.0.0'
  };

  if (endpoint.description) {
    info.description = endpoint.description;
  }

  return {
    openapi: '3.0.3',
    info,
    servers: [{ url: baseUrl }],
    paths: {
      [openApiPath]: {
        [method]: operation
      }
    }
  };
}

app.get('/', (req, res) => {
  const endpoints = allEndpoints();
  const mcpServers = listMcpServers();
  const adminKeyValue = getAdminKeyValue(req, res);

  res.render('home', {
    title: 'Brillar API Tool',
    adminKey: adminKeyValue,
    stats: {
      endpoints: endpoints.length,
      mcpServers: mcpServers.length
    },
    featuredEndpoints: endpoints.slice(0, 3),
    featuredServers: mcpServers.slice(0, 3)
  });
});

function resolveNextPath(rawNext = '/admin') {
  if (typeof rawNext !== 'string' || !rawNext.startsWith('/')) {
    return '/admin';
  }
  try {
    const url = new URL(rawNext, 'http://example.com');
    url.searchParams.delete('key');
    return `${url.pathname}${url.search}${url.hash}` || '/admin';
  } catch (err) {
    return '/admin';
  }
}

function appendKeyToPath(pathname, key) {
  if (!pathname) return `/admin?key=${encodeURIComponent(key)}`;
  const url = new URL(pathname, 'http://example.com');
  url.searchParams.set('key', key);
  const search = url.search ? url.search : '?key=' + encodeURIComponent(key);
  return `${url.pathname}${search}${url.hash}`;
}

app.get('/admin/login', (req, res) => {
  if (!ADMIN_KEY) {
    return res.redirect('/admin');
  }

  const nextPath = resolveNextPath(req.query.next);
  const hasError = req.query.error === '1';
  res.status(hasError ? 401 : 200).render('admin_login', {
    title: 'Admin Login',
    errorMessage: hasError ? 'Invalid admin key provided.' : '',
    nextPath,
    query: req.query
  });
});

app.post('/admin/login', (req, res) => {
  if (!ADMIN_KEY) {
    return res.redirect('/admin');
  }

  const key = String(req.body?.key || '').trim();
  const nextPath = resolveNextPath(req.body?.next);

  if (!key) {
    return res.status(401).render('admin_login', {
      title: 'Admin Login',
      errorMessage: 'Admin key is required.',
      nextPath,
      query: req.query
    });
  }

  if (key !== ADMIN_KEY) {
    return res.status(401).render('admin_login', {
      title: 'Admin Login',
      errorMessage: 'Invalid admin key provided.',
      nextPath,
      query: req.query
    });
  }

  const redirectPath = appendKeyToPath(nextPath || '/admin', key);
  return res.redirect(redirectPath);
});

app.get('/admin', requireAdmin, (req, res) => {
  const list = allEndpoints();
  res.render('admin_list', { list, query: req.query });
});

app.get('/admin/new', requireAdmin, (req, res) => {
  const endpoint = { ...endpointDefaults(), id: nanoid(12) };
  res.render('admin_edit', {
    title: 'Create Endpoint',
    endpoint,
    route: endpoint,
    query: req.query
  });
});

app.get('/admin/:id/edit', requireAdmin, (req, res) => {
  const endpoint = getEndpoint(req.params.id);
  if (!endpoint) {
    return res.status(404).send('Not found');
  }

  res.render('admin_edit', {
    title: 'Edit Endpoint',
    endpoint,
    route: endpoint,
    query: req.query
  });
});

app.post('/admin/save', requireAdmin, (req, res) => {
  const keyQuery = persistAdminKey(req, res);
  const payload = {
    id: req.body.id || nanoid(12),
    name: (req.body.name || '').trim(),
    description: (req.body.description || '').trim(),
    method: (req.body.method || 'GET').toUpperCase(),
    path: req.body.path || '/',
    enabled: ['true', 'on', '1', 'yes'].includes(String(req.body.enabled).toLowerCase()),
    match_headers: String(req.body.match_headers || '{}'),
    response_status: Number(req.body.response_status || 200),
    response_headers: String(req.body.response_headers || '{}'),
    response_body: String(req.body.response_body ?? ''),
    response_is_json: ['true', 'on', '1', 'yes'].includes(String(req.body.response_is_json).toLowerCase()),
    response_delay_ms: Number(req.body.response_delay_ms || 0),
    template_enabled: ['true', 'on', '1', 'yes'].includes(String(req.body.template_enabled).toLowerCase())
  };

  upsertEndpoint(payload);
  res.redirect(`/admin${keyQuery}`);
});

app.post('/admin/:id/delete', requireAdmin, (req, res) => {
  const endpoint = getEndpoint(req.params.id);
  if (endpoint) {
    deleteEndpoint(endpoint.id);
  }
  const keyQuery = persistAdminKey(req, res);
  res.redirect(`/admin${keyQuery}`);
});

// Variables CRUD
app.get('/admin/:id/vars', requireAdmin, (req, res) => {
  const e = getEndpoint(req.params.id);
  if (!e) return res.status(404).send('Not found');
  const vars = listVars(e.id);
  const pathParams = extractPathParams(e.path);
  const paramGroups = Object.fromEntries(pathParams.map((name) => [name, {}]));
  const stubPrefix = '__group__.';
  const stubGroups = {};

  for (const row of vars) {
    if (row.k.startsWith(stubPrefix)) {
      const stubRemainder = row.k.slice(stubPrefix.length);
      const [paramName, ...valueParts] = stubRemainder.split('.');
      if (!paramName || !pathParams.includes(paramName)) continue;
      const paramValue = valueParts.join('.');
      if (!paramValue) continue;
      if (!stubGroups[paramName]) stubGroups[paramName] = new Set();
      stubGroups[paramName].add(paramValue);
      if (!paramGroups[paramName][paramValue]) {
        paramGroups[paramName][paramValue] = {};
      }
      continue;
    }

    for (const paramName of pathParams) {
      const prefix = `${paramName}.`;
      if (!row.k.startsWith(prefix)) continue;
      const remainder = row.k.slice(prefix.length);
      const [paramValue, ...fieldParts] = remainder.split('.');
      if (!paramValue || fieldParts.length === 0) continue;
      const fieldName = fieldParts.join('.');
      if (!fieldName) continue;
      if (!paramGroups[paramName][paramValue]) {
        paramGroups[paramName][paramValue] = {};
      }
      paramGroups[paramName][paramValue][fieldName] = row.v;
    }
  }

  for (const [paramName, values] of Object.entries(stubGroups)) {
    for (const value of values) {
      if (!paramGroups[paramName][value]) {
        paramGroups[paramName][value] = {};
      }
    }
  }

  const rawParam = String(req.query.groupParam || '');
  const activeParam = pathParams.includes(rawParam) ? rawParam : '';
  const activeValue = activeParam ? String(req.query.groupValue || '') : '';

  res.render('admin_vars', {
    e,
    vars,
    query: req.query,
    pathParams,
    paramGroups,
    activeParam,
    activeValue
  });
});

app.post('/admin/:id/vars/save', requireAdmin, (req, res) => {
  const e = getEndpoint(req.params.id);
  if (!e) return res.status(404).send('Not found');
  const entries = [];

  if (Array.isArray(req.body.k)) {
    const values = Array.isArray(req.body.v) ? req.body.v : [];
    req.body.k.forEach((k, i) => {
      if (!k) return;
      entries.push({ k, v: values[i] });
    });
  } else if (typeof req.body.k !== 'undefined') {
    entries.push({ k: req.body.k, v: req.body.v });
  }

  const groupParam = String(req.body.groupParam || '').trim();
  const groupValue = String(req.body.groupValue || '').trim();
  const fieldNames = req.body.fieldName;
  const fieldValues = req.body.fieldValue;

  const createGroupOnly = String(req.body.createGroup || '').trim();

  if (groupParam && groupValue && createGroupOnly) {
    entries.push({ k: `__group__.${groupParam}.${groupValue}`, v: '' });
  }

  if (groupParam && groupValue && typeof fieldNames !== 'undefined') {
    const names = Array.isArray(fieldNames) ? fieldNames : [fieldNames];
    const values = Array.isArray(fieldValues) ? fieldValues : [fieldValues];
    names.forEach((rawName, index) => {
      const fieldName = String(rawName || '').trim();
      if (!fieldName) return;
      const value = typeof values[index] !== 'undefined' ? values[index] : '';
      entries.push({ k: `${groupParam}.${groupValue}.${fieldName}`, v: value });
    });
    entries.push({ k: `__group__.${groupParam}.${groupValue}`, v: '' });
  }

  for (const {k, v} of entries) {
    if (!k) continue;
    upsertVar({ id: nanoid(12), endpoint_id: e.id, k: String(k), v: String(v ?? '') });
  }

  const params = new URLSearchParams();
  const adminKey = res.locals.adminKey || req.query.key || req.body?.key;
  if (adminKey) params.set('key', adminKey);
  if (groupParam && groupValue) {
    params.set('groupParam', groupParam);
    params.set('groupValue', groupValue);
  }

  const search = params.toString();
  res.redirect(`/admin/${e.id}/vars${search ? `?${search}` : ''}`);
});

app.post('/admin/:id/vars/delete', requireAdmin, (req, res) => {
  const e = getEndpoint(req.params.id);
  if (!e) return res.status(404).send('Not found');
  const k = String(req.body.k || '');
  if (k) deleteVar(e.id, k);
  const params = new URLSearchParams();
  const adminKey = res.locals.adminKey || req.query.key || req.body?.key;
  if (adminKey) params.set('key', adminKey);
  const groupParam = String(req.body.groupParam || '').trim();
  const groupValue = String(req.body.groupValue || '').trim();
  if (groupParam && groupValue) {
    params.set('groupParam', groupParam);
    params.set('groupValue', groupValue);
  }
  const search = params.toString();
  res.redirect(`/admin/${e.id}/vars${search ? `?${search}` : ''}`);
});

app.get('/admin/:id/openapi', requireAdmin, (req, res) => {
  const endpoint = getEndpoint(req.params.id);
  if (!endpoint) {
    return res.status(404).send('Not found');
  }

  const document = buildOpenApiDocument(endpoint, req);
  res.type('application/json').send(`${JSON.stringify(document, null, 2)}\n`);
});

// Logs
app.get('/admin/:id/logs', requireAdmin, (req, res) => {
  const e = getEndpoint(req.params.id);
  if (!e) return res.status(404).send('Not found');
  const page = Number(req.query.page || 1);
  const limit = 50, offset = (page - 1) * limit;
  const logs = listLogs(e.id, limit, offset);
  res.render('admin_logs', { e, logs, page, query: req.query });
});

app.get('/admin/logs/:logId', requireAdmin, (req, res) => {
  const log = getLog(req.params.logId);
  if (!log) return res.status(404).send('Not found');
  res.render('admin_log_detail', { log, query: req.query });
});

function buildMcpListFlash(query, servers) {
  const status = query?.status;
  if (!status) {
    return { message: null, type: null };
  }

  const serverId = query.server;
  const serverRecord = servers.find((s) => s.id === serverId);
  const serverName = serverRecord?.name || serverId || 'MCP server';
  const serverPath = serverRecord ? buildMcpPath(serverRecord.slug) : '/mcp';

  switch (status) {
    case 'enabled':
      return {
        message: `Enabled MCP server "${serverName}" at ${serverPath}.`,
        type: 'success'
      };
    case 'disabled':
      return {
        message: `Disabled MCP server "${serverName}".`,
        type: 'success'
      };
    case 'error': {
      const detail = query.message ? String(query.message) : 'An unexpected error occurred.';
      return {
        message: `Unable to manage MCP server "${serverName}": ${detail}`,
        type: 'error'
      };
    }
    default:
      return { message: null, type: null };
  }
}

// MCP servers list
app.get('/admin/mcp', requireAdmin, (req, res) => {
  const hostHeader = req.get('host');
  const derivedBase = hostHeader ? `${req.protocol}://${hostHeader}` : '';
  const publicBase = (process.env.MCP_PUBLIC_URL || '').trim();

  const servers = listMcpServers().map((server) => {
    const serverBase = typeof server.base_url === 'string' ? server.base_url.trim() : '';
    const baseCandidate = publicBase || serverBase || derivedBase;
    const mcpPath = buildMcpPath(server.slug);
    const mcpUrl = baseCandidate ? buildMcpUrl(baseCandidate, server.slug) : mcpPath;
    return {
      ...server,
      tool_count: listMcpTools(server.id).length,
      mcpPath,
      mcpUrl
    };
  });

  const { message: statusMessage, type: statusType } = buildMcpListFlash(req.query, servers);

  res.render('admin_mcp_list', {
    servers,
    query: req.query,
    statusMessage,
    statusType,
    adminKey: getAdminKeyValue(req, res)
  });
});

// New MCP server form
app.get('/admin/mcp/new', requireAdmin, (req, res) => {
  res.render('admin_mcp_edit', {
    s: {
      id: '',
      name: '',
      slug: '',
      description: '',
      base_url: 'http://localhost:3000',
      api_key_header: '',
      api_key_value: '',
      is_enabled: 1
    },
    query: req.query,
    errorMessage: null
  });
});

// Edit MCP server
app.get('/admin/mcp/:id', requireAdmin, (req, res) => {
  const s = getMcpServer(req.params.id);
  if (!s) return res.status(404).send('MCP server not found');
  res.render('admin_mcp_edit', { s, query: req.query, errorMessage: null });
});

app.get('/admin/mcp/:id/info', requireAdmin, (req, res) => {
  const s = getMcpServer(req.params.id);
  if (!s) return res.status(404).send('MCP server not found');

  const tools = listMcpToolsWithEndpoints(s.id);

  const storedBaseUrl = typeof s.base_url === 'string' ? s.base_url.trim() : '';
  const sanitizedBaseUrl = storedBaseUrl ? storedBaseUrl.replace(/[/]+$/, '') : '';
  const hostHeader = req.get('host');
  let derivedBaseUrl = '';
  if (hostHeader) {
    derivedBaseUrl = `${req.protocol}://${hostHeader}`;
  }
  const baseUrl = sanitizedBaseUrl || derivedBaseUrl;
  const baseUrlSource = sanitizedBaseUrl ? 'configured' : derivedBaseUrl ? 'derived' : 'none';

  const rawPublicBase = (process.env.MCP_PUBLIC_URL || '').trim();
  const mcpPublicUrl = rawPublicBase ? appendSlugToBase(rawPublicBase, s.slug) : null;
  const mcpPath = buildMcpPath(s.slug);
  const mcpUrl = mcpPublicUrl || (baseUrl ? buildMcpUrl(baseUrl, s.slug) : mcpPath);

  const authHeader = (s.api_key_header || '').trim();
  const authValue = (s.api_key_value || '').trim();
  const hasAuth = Boolean(authHeader && authValue);

  let curlExample = null;
  if (tools.length > 0 && mcpUrl) {
    const curlLines = [`curl -X POST '${mcpUrl}'`];
    if (hasAuth) {
      curlLines.push(`  -H '${authHeader}: ${authValue}'`);
    }
    curlLines.push("  -H 'Content-Type: application/json'");
    curlLines.push(
      "  -d '{\"jsonrpc\":\"2.0\",\"id\":\"1\",\"method\":\"tools/list\",\"params\":{}}'"
    );
    curlExample = curlLines.join(' \\\n');
  }

  const infoPayload = {
    id: s.id,
    name: s.name,
    slug: s.slug,
    path: mcpPath,
    baseUrl: mcpUrl,
    tools: tools.map((t) => ({
      name: t.name,
      method: String(t.method || '').toUpperCase(),
      path: t.path
    }))
  };
  if (hasAuth) {
    infoPayload.authentication = { header: authHeader, value: authValue };
  }

  const clientConfig = {
    type: 'http',
    url: mcpUrl,
    timeoutMs: 3000,
    sseReadTimeoutMs: 1000,
    headers: hasAuth
      ? [
          {
            header: authHeader,
            value: authValue
          }
        ]
      : []
  };

  const connectionCommandParts = [];
  if (baseUrl) {
    connectionCommandParts.push(`MOCK_BASE_URL=${baseUrl}`);
  }
  if (mcpPublicUrl) {
    connectionCommandParts.push(`MCP_PUBLIC_URL=${mcpPublicUrl}`);
  }
  connectionCommandParts.push('npm start');
  const connectionCommand = connectionCommandParts.join(' ');

  res.render('admin_mcp_info', {
    s,
    tools,
    query: req.query,
    baseUrl,
    baseUrlSource,
    hasAuth,
    authHeader,
    authValue,
    curlExample,
    connectionCommand,
    infoPayload,
    mcpPublicUrl,
    mcpUrl,
    mcpPath,
    clientConfig
  });
});

// Save MCP server
app.post('/admin/mcp/save', requireAdmin, (req, res) => {
  const body = req.body || {};
  const payload = {
    id: body.id || '',
    name: body.name || '',
    slug: typeof body.slug === 'string' ? body.slug.trim() : '',
    description: body.description || '',
    base_url: body.base_url || '',
    api_key_header: body.api_key_header || '',
    api_key_value: body.api_key_value || '',
    is_enabled: body.is_enabled === 'true' || body.is_enabled === 'on' ? 1 : 0
  };

  try {
    const saved = upsertMcpServer(payload);
    const keyQuery = persistAdminKey(req, res);
    return res.redirect(`/admin/mcp/${encodeURIComponent(saved.id)}${keyQuery}`);
  } catch (err) {
    console.error('Failed to save MCP server', err);
    const attempted = {
      ...payload,
      is_enabled: payload.is_enabled ? 1 : 0
    };
    const errorMessage = err?.message || 'Failed to save MCP server.';
    return res.status(400).render('admin_mcp_edit', {
      s: attempted,
      query: req.query,
      errorMessage
    });
  }
});

// Delete MCP server
app.post('/admin/mcp/:id/delete', requireAdmin, (req, res) => {
  deleteMcpServer(req.params.id);
  const keyQuery = persistAdminKey(req, res);
  res.redirect(`/admin/mcp${keyQuery}`);
});

app.post('/admin/mcp/:id/enable', requireAdmin, (req, res) => {
  const serverRecord = getMcpServer(req.params.id);
  if (!serverRecord) {
    return res.redirect(
      buildAdminRedirect('/admin/mcp', req, res, {
        status: 'error',
        server: req.params.id,
        message: 'Server not found.'
      })
    );
  }

  try {
    setMcpServerEnabled(serverRecord.id, true);
    return res.redirect(
      buildAdminRedirect('/admin/mcp', req, res, {
        status: 'enabled',
        server: serverRecord.id
      })
    );
  } catch (err) {
    console.error('Failed to enable MCP server', err);
    return res.redirect(
      buildAdminRedirect('/admin/mcp', req, res, {
        status: 'error',
        server: serverRecord.id,
        message: err?.message || 'Failed to enable MCP server.'
      })
    );
  }
});

app.post('/admin/mcp/:id/disable', requireAdmin, (req, res) => {
  const serverRecord = getMcpServer(req.params.id);
  if (!serverRecord) {
    return res.redirect(
      buildAdminRedirect('/admin/mcp', req, res, {
        status: 'error',
        server: req.params.id,
        message: 'Server not found.'
      })
    );
  }

  try {
    setMcpServerEnabled(serverRecord.id, false);
    return res.redirect(
      buildAdminRedirect('/admin/mcp', req, res, {
        status: 'disabled',
        server: serverRecord.id
      })
    );
  } catch (err) {
    console.error('Failed to disable MCP server', err);
    return res.redirect(
      buildAdminRedirect('/admin/mcp', req, res, {
        status: 'error',
        server: serverRecord.id,
        message: err?.message || 'Failed to disable MCP server.'
      })
    );
  }
});

// Manage tools for an MCP server
app.get('/admin/mcp/:id/tools', requireAdmin, (req, res) => {
  const mcpServer = getMcpServerWithTools(req.params.id, { includeDisabled: true });
  if (!mcpServer) return res.status(404).send('MCP server not found');

  const key = getAdminKeyValue(req, res);
  const viewModel = buildMcpToolsRenderData(req, mcpServer, key);

  res.render('admin_mcp_tools', viewModel);
});

app.post('/admin/mcp/:id/tools/from-existing', requireAdmin, (req, res) => {
  const serverId = req.params.id;
  const key = req.body.key || '';
  const apiIdsRaw = req.body.apiIds;
  const apiIds = Array.isArray(apiIdsRaw) ? apiIdsRaw : [apiIdsRaw].filter(Boolean);

  let errorMessage = '';
  for (const apiId of apiIds) {
    const api = getExistingApiById(apiId);
    if (!api) continue;

    const toolName = deriveToolNameFromApi(api);
    try {
      createMcpTool({
        mcp_server_id: serverId,
        name: toolName,
        description: api.description || '',
        input_schema_json: JSON.stringify({
          type: 'object',
          properties: {},
          additionalProperties: true
        }),
        http_method: api.method,
        base_url: api.baseUrl || '',
        path_template: api.path,
        query_mapping_json: JSON.stringify({}),
        body_mapping_json: JSON.stringify({}),
        headers_mapping_json: JSON.stringify({}),
        enabled: true
      });
    } catch (err) {
      console.error('Failed to create MCP tool from existing API', { apiId, error: err?.message || err });
      errorMessage = err?.message || 'Failed to create MCP tool from the selected API.';
      break;
    }
  }

  if (errorMessage) {
    const mcpServer = getMcpServerWithTools(serverId, { includeDisabled: true });
    if (!mcpServer) return res.status(404).send('MCP server not found');
    const viewModel = buildMcpToolsRenderData(req, mcpServer, key, { error: errorMessage });
    return res.status(400).render('admin_mcp_tools', viewModel);
  }

  res.redirect(`/admin/mcp/${encodeURIComponent(serverId)}/tools?key=${encodeURIComponent(key)}`);
});

app.post('/admin/mcp/:id/tools/openapi/preview', requireAdmin, (req, res) => {
  const serverId = req.params.id;
  const key = req.body.key || '';
  const rawSpec = req.body.openapi_spec || '';

  let parsed;
  try {
    try {
      parsed = JSON.parse(rawSpec);
    } catch (jsonErr) {
      parsed = YAML.parse(rawSpec);
    }
  } catch (err) {
    const mcpServer = getMcpServerWithTools(serverId, { includeDisabled: true });
    if (!mcpServer) return res.status(404).send('MCP server not found');
    const viewModel = buildMcpToolsRenderData(req, mcpServer, key, {
      error: `Failed to parse OpenAPI spec: ${err.message}`,
      rawOpenapiSpec: rawSpec
    });
    return res.render('admin_mcp_tools', viewModel);
  }

  const operations = [];
  const paths = parsed?.paths || {};
  for (const [pathKey, methods] of Object.entries(paths)) {
    if (!methods || typeof methods !== 'object') continue;
    for (const [methodKey, op] of Object.entries(methods)) {
      const upperMethod = String(methodKey || '').toUpperCase();
      if (!SUPPORTED_HTTP_METHODS.has(upperMethod)) continue;
      const opData = op || {};
      const summary = opData.summary || '';
      const description = opData.description || '';
      const operationId = opData.operationId || `${upperMethod}_${pathKey}`;

      operations.push({
        operationId,
        method: upperMethod,
        path: pathKey,
        summary,
        description,
        parameters: Array.isArray(opData.parameters) ? opData.parameters : [],
        requestBody: opData.requestBody || null,
        suggestedName: deriveToolNameFromApi({
          name: operationId || summary,
          method: upperMethod,
          path: pathKey
        }),
        raw: opData
      });
    }
  }

  const mcpServer = getMcpServerWithTools(serverId, { includeDisabled: true });
  if (!mcpServer) return res.status(404).send('MCP server not found');
  const viewModel = buildMcpToolsRenderData(req, mcpServer, key, {
    openapiPreview: operations,
    rawOpenapiSpec: rawSpec
  });
  return res.render('admin_mcp_tools', viewModel);
});

app.post('/admin/mcp/:id/tools/openapi/save', requireAdmin, (req, res) => {
  const serverId = req.params.id;
  const key = req.body.key || '';
  const baseUrl = req.body.base_url || '';

  const opsInput = req.body.ops || [];
  const opsArray = Array.isArray(opsInput) ? opsInput : Object.values(opsInput);

  let errorMessage = '';
  for (const op of opsArray) {
    if (!op) continue;
    if (!isTruthyInput(op.selected)) continue;

    const name = op.tool_name
      ? slugifyToolName(op.tool_name)
      : deriveToolNameFromApi({
          name: op.operationId || `${op.method}_${op.path}`,
          method: op.method,
          path: op.path
        });

    const description = op.description || '';
    const method = String(op.method || '').toUpperCase();
    const path = op.path || '';

    let parameters = [];
    try {
      const parsed = op.parametersJson ? JSON.parse(op.parametersJson) : [];
      parameters = Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.error('Failed to parse OpenAPI parameters JSON', err);
    }

    let requestBody = null;
    try {
      requestBody = op.requestBodyJson ? JSON.parse(op.requestBodyJson) : null;
    } catch (err) {
      console.error('Failed to parse OpenAPI requestBody JSON', err);
    }

    const inputSchema = {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: true
    };

    const queryMapping = {};
    const bodyMapping = {};

    for (const parameter of parameters) {
      if (!parameter || !parameter.name) continue;
      const paramName = parameter.name;
      const paramSchema = parameter.schema || {};
      const type = paramSchema.type || 'string';

      inputSchema.properties[paramName] = {
        type,
        description: parameter.description || ''
      };

      if (parameter.required) {
        inputSchema.required.push(paramName);
      }

      if (parameter.in === 'query') {
        queryMapping[paramName] = paramName;
      }
    }

    const jsonBodySchema = requestBody?.content?.['application/json']?.schema;
    if (jsonBodySchema && jsonBodySchema.properties && typeof jsonBodySchema.properties === 'object') {
      const bodyProps = jsonBodySchema.properties;
      for (const [propName, propSchema] of Object.entries(bodyProps)) {
        if (!propName) continue;
        const propType = (propSchema && propSchema.type) || 'string';
        const propDescription = (propSchema && propSchema.description) || '';

        inputSchema.properties[propName] = {
          type: propType,
          description: propDescription
        };

        if (Array.isArray(jsonBodySchema.required) && jsonBodySchema.required.includes(propName)) {
          inputSchema.required.push(propName);
        }

        bodyMapping[propName] = propName;
      }
    }

    inputSchema.required = Array.from(new Set(inputSchema.required));

    try {
      createMcpTool({
        mcp_server_id: serverId,
        name,
        description,
        input_schema_json: JSON.stringify(inputSchema),
        http_method: method,
        base_url: baseUrl,
        path_template: path,
        query_mapping_json: JSON.stringify(queryMapping),
        body_mapping_json: JSON.stringify(bodyMapping),
        headers_mapping_json: JSON.stringify({}),
        enabled: true
      });
    } catch (err) {
      console.error('Failed to create MCP tool from OpenAPI operation', {
        operationId: op.operationId,
        error: err?.message || err
      });
      errorMessage = err?.message || 'Failed to save one of the OpenAPI operations as a tool.';
      break;
    }
  }

  if (errorMessage) {
    const mcpServer = getMcpServerWithTools(serverId, { includeDisabled: true });
    if (!mcpServer) return res.status(404).send('MCP server not found');
    const viewModel = buildMcpToolsRenderData(req, mcpServer, key, { error: errorMessage });
    return res.status(400).render('admin_mcp_tools', viewModel);
  }

  res.redirect(`/admin/mcp/${encodeURIComponent(serverId)}/tools?key=${encodeURIComponent(key)}`);
});

// Add / update a single tool
app.post('/admin/mcp/:id/tools/save', requireAdmin, (req, res) => {
  const mcpServer = getMcpServerWithTools(req.params.id, { includeDisabled: true });
  if (!mcpServer) return res.status(404).send('MCP server not found');

  const body = req.body;
  const argSchema = body.arg_schema || '{"type":"object","properties":{},"required":[]}';
  const adminKey = getAdminKeyValue(req, res);

  try {
    upsertMcpTool({
      id: body.id || '',
      mcp_server_id: mcpServer.id,
      endpoint_id: body.endpoint_id,
      name: body.name,
      description: body.description || '',
      arg_schema: argSchema
    });
  } catch (err) {
    const viewModel = buildMcpToolsRenderData(req, mcpServer, adminKey, {
      error: err?.message || 'Failed to save MCP tool.'
    });
    return res.status(400).render('admin_mcp_tools', viewModel);
  }

  const keyQuery = persistAdminKey(req, res);
  res.redirect(`/admin/mcp/${encodeURIComponent(mcpServer.id)}/tools${keyQuery}`);
});

// Delete tool
app.post('/admin/mcp/:id/tools/:toolId/delete', requireAdmin, (req, res) => {
  const s = getMcpServer(req.params.id);
  if (!s) return res.status(404).send('MCP server not found');
  deleteMcpTool(req.params.toolId);
  const keyQuery = persistAdminKey(req, res);
  res.redirect(`/admin/mcp/${encodeURIComponent(s.id)}/tools${keyQuery}`);
});

app.use(buildRuntimeRouter());

app.use((req, res, next) => {
  next(createError(404));
});

app.use((err, req, res, next) => {
  const status = err.status || 500;
  res.status(status);
  if (req.accepts('json')) {
    res.json({ error: err.message || 'Unknown error' });
    return;
  }

  res.render('admin_edit', {
    title: `Error ${status}`,
    route: null,
    error: err,
    query: req.query
  });
});

export { app };
export default app;
