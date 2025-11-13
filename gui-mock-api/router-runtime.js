import express from 'express';
import createError from 'http-errors';
import { allEndpoints, listVars, insertLog } from './db.js';
import { renderTemplate } from './templates.js';
import { nanoid } from 'nanoid';

// simple path-to-regex converter supporting :params
function pathToRegex(path) {
  const keys = [];
  const rx = path
    .replace(/\//g, '\\/')
    .replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; });
  return { regex: new RegExp(`^${rx}$`), keys };
}

export function buildRuntimeRouter() {
  const r = express.Router();

  r.all('*', async (req, res, next) => {
    const list = allEndpoints().filter(e => e.enabled);

    const match = list.find(e => {
      if (e.method.toUpperCase() !== req.method) return false;
      const { regex, keys } = pathToRegex(e.path);
      const m = req.path.match(regex);
      if (!m) return false;
      const hdr = JSON.parse(e.match_headers || '{}');
      for (const [k, v] of Object.entries(hdr)) {
        if ((req.headers[k.toLowerCase()] || '').toString() !== v.toString()) return false;
      }
      req.matchedParams = keys.reduce((acc, k, i) => (acc[k] = m[i+1], acc), {});
      req._matchedEndpoint = e;
      return true;
    });

    if (!match) return next(createError(404, 'No mock matched'));

    // Load per-endpoint variables
    const varRows = listVars(match.id);
    const vars = Object.fromEntries(varRows.map(r => [r.k, r.v]));

    // Param-based multi-response vars:
    // For any route param (e.g. :userid), vars with keys like
    // "userid.101.name" will be mapped into ctx.userid = { name: "..." }
    // when the current request has params.userid === "101".
    // This lets templates use {{userid.name}}, {{userid.age}}, etc.
    const derivedFromParams = {};
    if (req.matchedParams && vars) {
      for (const [paramName, paramValue] of Object.entries(req.matchedParams)) {
        const prefix = `${paramName}.${paramValue}.`;
        for (const [key, value] of Object.entries(vars)) {
          if (key.startsWith(prefix)) {
            const field = key.slice(prefix.length);
            if (!derivedFromParams[paramName]) derivedFromParams[paramName] = {};
            derivedFromParams[paramName][field] = value;
          }
        }
      }
    }

    const ctx = {
      params: req.matchedParams || {},
      query: req.query || {},
      headers: req.headers || {},
      body: req.body || {},
      vars,
      ...derivedFromParams,
      now: new Date().toISOString()
    };

    const start = Date.now();
    const delay = Number(match.response_delay_ms || 0);
    const status = Number(match.response_status || 200);
    const hdrs = JSON.parse(match.response_headers || '{}');
    for (const [k, v] of Object.entries(hdrs)) res.setHeader(k, String(v));

    const payloadRaw = match.response_body || '';
    const payload = match.template_enabled ? renderTemplate(payloadRaw, ctx) : payloadRaw;

    const send = () => {
      let out, code = status;
      try {
        if (match.response_is_json) {
          try {
            out = JSON.parse(payload);
            res.status(status).json(out);
          } catch {
            res.status(status).type('application/json').send(payload);
          }
        } else {
          res.status(status).send(payload);
        }
      } finally {
        // log the call
        insertLog({
          id: nanoid(12),
          endpoint_id: match.id,
          method: req.method,
          path: req.originalUrl || req.path,
          matched_params: JSON.stringify(ctx.params || {}),
          query: JSON.stringify(ctx.query || {}),
          headers: JSON.stringify(ctx.headers || {}),
          body: JSON.stringify(ctx.body || {}),
          status: code,
          response_ms: Date.now() - start,
        });
      }
    };

    if (delay > 0) setTimeout(send, delay); else send();
  });

  return r;
}
