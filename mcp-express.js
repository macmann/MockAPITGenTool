import express from 'express';
import {
  listMcpToolsByServerId,
  getMcpToolByName,
  getMcpAuthConfigByServerId
} from './gui-mock-api/db.js';
import { executeMcpHttpTool } from './mcp-http-client.js';

const DEFAULT_PROTOCOL_VERSION = '2025-06-18';

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

export function createMcpRouter() {
  const router = express.Router();

  router.use((req, res, next) => {
    if (!req.mcpServer) {
      console.error('[MCP] Missing req.mcpServer context');
      const errorResponse = {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32603,
          message: 'Internal MCP server error'
        }
      };
      return sendJson(res, 500, errorResponse);
    }

    if (typeof req.rawBody !== 'string') {
      req.rawBody = '[empty body]';
    }
    return next();
  });

  router.get('/', (req, res) => {
    const slug = req.mcpServer?.slug || 'unknown';
    console.log(`[MCP] Health check GET /mcp/${slug}`);
    return sendJson(res, 200, {
      ok: true,
      message: 'MCP endpoint is running (use POST with JSON-RPC 2.0)'
    });
  });

  router.post('/', async (req, res, next) => {
    const serverConfig = req.mcpServer;
    const serverId = serverConfig?.id || null;
    const slug = serverConfig?.slug || 'unknown';

    if (!serverConfig || !serverId) {
      console.error('[MCP] Missing MCP server configuration for request', { slug });
      const errorResponse = {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32603,
          message: 'Internal MCP server error'
        }
      };
      return sendJson(res, 500, errorResponse);
    }
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
      body: bodyForLog,
      serverId,
      slug
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
                name: serverConfig?.name || 'MindBridge X MCP',
                version: serverConfig?.version || '0.1.0'
              },
              capabilities: {
                tools: {
                  list: true,
                  call: true
                }
              }
            }
          };
          return sendJson(res, 200, response);
        }
        case 'tools/list': {
          const mcpServer = req.mcpServer || null;
          const serverId = mcpServer?.id;

          if (!serverId) {
            const errorResponse = {
              jsonrpc: '2.0',
              id: responseId,
              error: {
                code: -32001,
                message: 'MCP server context is missing'
              }
            };
            console.log('[MCP] tools/list without mcpServer', { rpcId: responseId });
            return sendJson(res, 500, errorResponse);
          }

          const dbTools = await listMcpToolsByServerId(serverId);

          const tools = dbTools.map((t) => ({
            name: t.name,
            description: t.description || '',
            inputSchema: t.input_schema_json
              ? JSON.parse(t.input_schema_json)
              : { type: 'object', additionalProperties: true }
          }));

          const response = {
            jsonrpc: '2.0',
            id: responseId,
            result: {
              tools
            }
          };

          console.log('[MCP] tools/list result', {
            time: new Date().toISOString(),
            serverId,
            toolCount: tools.length
          });

          return sendJson(res, 200, response);
        }
        case 'tools/call': {
          const mcpServer = req.mcpServer || null;
          const serverId = mcpServer?.id;

          if (!serverId) {
            const errorResponse = {
              jsonrpc: '2.0',
              id: responseId,
              error: {
                code: -32001,
                message: 'MCP server context is missing'
              }
            };
            console.log('[MCP] tools/call without mcpServer', { rpcId: responseId });
            return sendJson(res, 500, errorResponse);
          }

          const callParams = params || {};
          const toolName = callParams.name;
          const args = callParams.arguments || {};

          if (!toolName || typeof toolName !== 'string') {
            const errorResponse = {
              jsonrpc: '2.0',
              id: responseId,
              error: {
                code: -32602,
                message: 'Invalid params: "name" is required and must be a string'
              }
            };
            return sendJson(res, 400, errorResponse);
          }

          const tool = await getMcpToolByName(serverId, toolName);
          if (!tool || tool.enabled === false) {
            const errorResponse = {
              jsonrpc: '2.0',
              id: responseId,
              error: {
                code: -32002,
                message: `Tool not found or disabled: ${toolName}`
              }
            };
            return sendJson(res, 404, errorResponse);
          }
          const authConfig = await getMcpAuthConfigByServerId(serverId);

          console.log('[MCP] tools/call start', {
            time: new Date().toISOString(),
            serverId,
            toolName,
            argsPreview: JSON.stringify(args).slice(0, 200)
          });

          try {
            const result = await executeMcpHttpTool({ tool, authConfig, args });

            const content = [];
            if (result.json !== null) {
              const prettyJson = typeof result.json === 'string'
                ? result.json
                : JSON.stringify(result.json, null, 2);
              content.push({
                type: 'text',
                text: prettyJson
              });
            } else {
              content.push({
                type: 'text',
                text: result.rawBody || ''
              });
            }

            content.push({
              type: 'text',
              text: `HTTP ${result.status}`
            });

            const response = {
              jsonrpc: '2.0',
              id: responseId,
              result: { content }
            };

            console.log('[MCP] tools/call success', {
              time: new Date().toISOString(),
              serverId,
              toolName,
              status: result.status
            });

            return sendJson(res, 200, response);
          } catch (err) {
            console.error('[MCP] tools/call error', {
              time: new Date().toISOString(),
              serverId,
              toolName,
              error: err?.message
            });

            const errorResponse = {
              jsonrpc: '2.0',
              id: responseId,
              error: {
                code: -32603,
                message: 'Failed to execute HTTP tool',
                data: { message: err.message }
              }
            };
            return sendJson(res, 500, errorResponse);
          }
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

  return router;
}
