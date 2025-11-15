import express from 'express';
import {
  getMcpServer,
  listMcpToolsWithEndpoints
} from './gui-mock-api/db.js';

const DEFAULT_PROTOCOL_VERSION = '2025-06-18';
const DEFAULT_INPUT_SCHEMA = {
  type: 'object',
  properties: {},
  required: [],
  additionalProperties: true
};

function truncateHeaders(headers) {
  const out = {};
  for (const k in headers) {
    if (!Object.prototype.hasOwnProperty.call(headers, k)) continue;
    let v = String(headers[k]);
    if (v.length > 200) v = v.slice(0, 200) + '...[truncated]';
    out[k] = v;
  }
  return out;
}

function previewPayload(x) {
  if (x === undefined) return '[undefined]';
  if (x === null) return 'null';
  let s;
  if (typeof x === 'string') {
    s = x;
  } else {
    try {
      s = JSON.stringify(x);
    } catch (err) {
      s = `[unserializable payload: ${err?.message || err}]`;
    }
  }
  if (s.length > 300) s = s.slice(0, 300) + '...[truncated]';
  return s;
}

function parseToolInputSchema(rawSchema) {
  if (!rawSchema || typeof rawSchema !== 'string') {
    return { ...DEFAULT_INPUT_SCHEMA };
  }

  try {
    const parsed = JSON.parse(rawSchema);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ...DEFAULT_INPUT_SCHEMA };
    }

    const normalized = { ...DEFAULT_INPUT_SCHEMA, ...parsed };

    if (
      parsed.properties &&
      typeof parsed.properties === 'object' &&
      !Array.isArray(parsed.properties)
    ) {
      normalized.properties = parsed.properties;
    }

    if (Array.isArray(parsed.required)) {
      normalized.required = parsed.required;
    }

    if (normalized.additionalProperties === undefined) {
      normalized.additionalProperties = true;
    }

    return normalized;
  } catch (err) {
    console.warn('[MCP] Failed to parse tool schema', err);
    return { ...DEFAULT_INPUT_SCHEMA };
  }
}

function buildToolsList(serverId) {
  const toolRecords = listMcpToolsWithEndpoints(serverId) || [];
  return toolRecords.map((tool) => ({
    name: tool.name,
    description:
      tool.description || `Proxy for ${(tool.method || 'GET').toUpperCase()} ${tool.path || '/'}`,
    inputSchema: parseToolInputSchema(tool.arg_schema)
  }));
}

function sendJson(res, status, payload) {
  const preview = previewPayload(payload);
  res.status(status);
  const response = res.json(payload);
  console.log('[MCP] Response sent', {
    time: new Date().toISOString(),
    status,
    resultPreview: preview
  });
  return response;
}

export function createMcpRouter(options = {}) {
  const { serverId, mockBaseUrl } = options;
  if (!serverId) {
    throw new Error('MCP server ID is required to mount MCP routes');
  }

  const serverConfig = getMcpServer(serverId);
  if (!serverConfig || !serverConfig.is_enabled) {
    throw new Error(`MCP server not found or not enabled: ${serverId}`);
  }

  const resolvedMockBaseUrl =
    mockBaseUrl ||
    process.env.MOCK_BASE_URL ||
    serverConfig.base_url ||
    'http://localhost:3000';

  const router = express.Router();

  router.use((req, res, next) => {
    if (typeof req.rawBody !== 'string') {
      req.rawBody = '[empty body]';
    }
    next();
  });

  router.get('/', (req, res) => {
    console.log('[MCP] Health check GET /mcp');
    return sendJson(res, 200, {
      ok: true,
      message: 'MCP endpoint is running (use POST with JSON-RPC 2.0)'
    });
  });

  router.post('/', async (req, res, next) => {
    const startedAt = new Date().toISOString();
    const bodyForLog =
      typeof req.rawBody === 'string'
        ? req.rawBody
        : previewPayload(req.body ?? '[empty body]');

    req.__mcpLogged = true;

    console.log('[MCP] Incoming request', {
      time: startedAt,
      method: req.method,
      url: req.originalUrl,
      headers: truncateHeaders(req.headers),
      body: bodyForLog
    });

    const contentType = (req.headers['content-type'] || '').split(';')[0].trim();
    if (contentType !== 'application/json') {
      const errorResponse = {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32700,
          message: 'Content-Type must be application/json'
        }
      };
      return sendJson(res, 415, errorResponse);
    }

    const rpc = req.body && typeof req.body === 'object' ? req.body : {};
    const { jsonrpc, id, method: rpcMethod, params } = rpc;
    const hasId = Object.prototype.hasOwnProperty.call(rpc, 'id');
    const responseId = id ?? null;

    if (jsonrpc !== '2.0' || typeof rpcMethod !== 'string') {
      const errorResponse = {
        jsonrpc: '2.0',
        id: responseId,
        error: {
          code: -32600,
          message: 'Invalid JSON-RPC 2.0 request'
        }
      };
      return sendJson(res, 400, errorResponse);
    }

    const protocolVersion =
      typeof params?.protocolVersion === 'string'
        ? params.protocolVersion
        : DEFAULT_PROTOCOL_VERSION;

    if (!hasId) {
      console.log('[MCP] JSON-RPC notification received', {
        time: new Date().toISOString(),
        method: rpcMethod
      });
      return res.status(204).end();
    }

    try {
      switch (rpcMethod) {
        case 'initialize': {
          const response = {
            jsonrpc: '2.0',
            id: responseId,
            result: {
              protocolVersion,
              serverInfo: {
                name: serverConfig.name || 'Brillar Mock API MCP',
                version: serverConfig.version || '0.1.0'
              },
              capabilities: {
                tools: {
                  list: true,
                  call: false
                }
              }
            }
          };
          return sendJson(res, 200, response);
        }
        case 'tools/list': {
          const tools = buildToolsList(serverId);
          const resultTools =
            tools.length > 0
              ? tools
              : [
                  {
                    name: 'example.echo',
                    description:
                      'Example tool that echoes the provided message back to the caller.',
                    inputSchema: {
                      type: 'object',
                      properties: {
                        message: {
                          type: 'string',
                          description: 'Text to echo back in the response.'
                        }
                      },
                      required: ['message'],
                      additionalProperties: false
                    }
                  }
                ];
          const response = {
            jsonrpc: '2.0',
            id: responseId,
            result: {
              tools: resultTools
            }
          };
          return sendJson(res, 200, response);
        }
        default: {
          const response = {
            jsonrpc: '2.0',
            id: responseId,
            error: {
              code: -32601,
              message: `Method not found: ${rpcMethod}`
            }
          };
          return sendJson(res, 200, response);
        }
      }
    } catch (err) {
      console.error('[MCP] Unexpected error', err);
      const errorResponse = {
        jsonrpc: '2.0',
        id: responseId,
        error: {
          code: -32603,
          message: 'Internal MCP server error',
          data: {
            message: err?.message || String(err)
          }
        }
      };
      return sendJson(res, 500, errorResponse);
    }
  });

  router.all('/', (req, res) => {
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    const errorResponse = {
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32601,
        message: `Unsupported method: ${req.method}`
      }
    };
    return sendJson(res, 405, errorResponse);
  });

  router.use((err, req, res, next) => {
    console.error('[MCP] Handler error', {
      time: new Date().toISOString(),
      error: err?.stack || String(err)
    });

    if (!req.__mcpLogged) {
      const bodyForLog =
        typeof req.rawBody === 'string'
          ? req.rawBody
          : previewPayload(req.body ?? '[empty body]');
      console.log('[MCP] Incoming request', {
        time: new Date().toISOString(),
        method: req.method,
        url: req.originalUrl,
        headers: truncateHeaders(req.headers || {}),
        body: bodyForLog
      });
      req.__mcpLogged = true;
    }

    if (res.headersSent) {
      return next(err);
    }

    const isParseError =
      err instanceof SyntaxError && (err.status === 400 || err.statusCode === 400);

    if (isParseError) {
      const errorResponse = {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32700,
          message: 'Parse error: Invalid JSON body'
        }
      };
      return sendJson(res, 400, errorResponse);
    }

    const errorResponse = {
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32603,
        message: 'Internal MCP server error',
        data: {
          message: err?.message || String(err)
        }
      }
    };
    return sendJson(res, 500, errorResponse);
  });

  console.log(
    `[MCP] Router initialized for server "${serverId}" (mockBaseUrl=${resolvedMockBaseUrl})`
  );

  return router;
}
