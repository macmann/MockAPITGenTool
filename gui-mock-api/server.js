import path from 'path';
import express from 'express';
import morgan from 'morgan';
import helmet from 'helmet';
import compression from 'compression';
import bodyParser from 'body-parser';
import createError from 'http-errors';
import { fileURLToPath } from 'url';
import { nanoid } from 'nanoid';

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
  getLog
} from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || process.env.ADMIN_TOKEN || process.env.ADMIN_SECRET || '';

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(helmet());
app.use(compression());
app.use(morgan('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
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

function extractPathParams(pathPattern) {
  if (typeof pathPattern !== 'string') return [];
  const matches = pathPattern.match(/:[A-Za-z0-9_]+/g) || [];
  return matches.map((token) => token.slice(1));
}

app.get('/', (req, res) => {
  res.redirect('/admin');
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

  for (const row of vars) {
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

  if (groupParam && groupValue && typeof fieldNames !== 'undefined') {
    const names = Array.isArray(fieldNames) ? fieldNames : [fieldNames];
    const values = Array.isArray(fieldValues) ? fieldValues : [fieldValues];
    names.forEach((rawName, index) => {
      const fieldName = String(rawName || '').trim();
      if (!fieldName) return;
      const value = typeof values[index] !== 'undefined' ? values[index] : '';
      entries.push({ k: `${groupParam}.${groupValue}.${fieldName}`, v: value });
    });
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`GUI Mock API server listening on port ${PORT}`);
  });
}

export default app;
