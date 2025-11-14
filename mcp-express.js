import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import {
  getMcpServer,
  listMcpToolsWithEndpoints
} from './gui-mock-api/db.js';

function buildPath(pathTemplate, args) {
  let path = pathTemplate;
  const usedKeys = new Set();
  if (!args) return { path, usedKeys };
  for (const [k, v] of Object.entries(args)) {
    const token = `:${k}`;
    if (typeof path === 'string' && path.includes(token)) {
      path = path.replace(token, encodeURIComponent(String(v)));
      usedKeys.add(k);
    }
  }
  return { path, usedKeys };
}

function createMcpServer({ serverId, mockBaseUrl }) {
  const mcpServerConfig = getMcpServer(serverId);
  if (!mcpServerConfig || !mcpServerConfig.is_enabled) {
    throw new Error(`MCP server not found or not enabled: ${serverId}`);
  }

  const toolsConfig = listMcpToolsWithEndpoints(serverId);
  const resolvedMockBaseUrl =
    mockBaseUrl ||
    process.env.MOCK_BASE_URL ||
    mcpServerConfig.base_url ||
    'http://localhost:3000';

  const server = new McpServer(
    {
      name: mcpServerConfig.name || 'mock-api-mcp',
      version: '0.1.0'
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  for (const t of toolsConfig) {
    let inputJsonSchema;
    try {
      inputJsonSchema = JSON.parse(
        t.arg_schema || '{"type":"object","properties":{},"required":[]}'
      );
    } catch {
      inputJsonSchema = { type: 'object', properties: {}, required: [] };
    }

    const zodSchema = z.any();

    server.registerTool(
      t.name,
      {
        description: t.description || `Proxy for ${t.method} ${t.path}`,
        inputSchema: zodSchema,
        _meta: { inputJsonSchema }
      },
      async (inputArgs = {}) => {
        const args =
          inputArgs && typeof inputArgs === 'object' && !Array.isArray(inputArgs)
            ? inputArgs
            : {};
        const { path, usedKeys } = buildPath(t.path, args);

        const queryParams = new URLSearchParams();
        for (const [k, v] of Object.entries(args)) {
          if (usedKeys.has(k)) continue;
          if (v === undefined || v === null) continue;
          queryParams.append(k, String(v));
        }

        const url = new URL(path, resolvedMockBaseUrl);
        if ([...queryParams.keys()].length > 0) {
          url.search = queryParams.toString();
        }

        const method = (t.method || 'GET').toUpperCase();
        const headers = { 'Content-Type': 'application/json' };
        if (mcpServerConfig.api_key_header && mcpServerConfig.api_key_value) {
          headers[mcpServerConfig.api_key_header] =
            mcpServerConfig.api_key_value;
        }

        let body;
        if (['POST', 'PUT', 'PATCH'].includes(method)) {
          body = JSON.stringify(args);
        }

        const res = await fetch(url.toString(), {
          method,
          headers,
          body
        });

        const text = await res.text();
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = text;
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  status: res.status,
                  url: url.toString(),
                  data: parsed
                },
                null,
                2
              )
            }
          ]
        };
      }
    );
  }

  return { server, resolvedMockBaseUrl };
}

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

export function createMcpRouter(options = {}) {
  const serverId = options.serverId || process.env.MCP_SERVER_ID;
  if (!serverId) {
    throw new Error('MCP server ID is required to mount MCP routes');
  }

  const { server, resolvedMockBaseUrl } = createMcpServer({
    serverId,
    mockBaseUrl: options.mockBaseUrl
  });

  const router = express.Router();

  router.use(
    express.raw({ type: '*/*', limit: '5mb' }),
    (req, res, next) => {
      req.rawBody = req.body;
      next();
    }
  );

  router.use((req, res, next) => {
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

  async function handleRequest(req, res, bodyOverride) {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true
    });

    res.on('close', () => {
      try {
        transport.close();
      } catch (err) {
        console.error('[MCP] Failed to close transport', err);
      }
    });

    await server.connect(transport);
    await transport.handleRequest(
      req,
      res,
      bodyOverride ?? req.rawBody ?? req.body
    );
  }

  router.use(async (req, res, next) => {
    const rawBodyBuffer = req.rawBody;
    const rawBodyAsString =
      rawBodyBuffer && rawBodyBuffer.length > 0
        ? rawBodyBuffer.toString('utf8')
        : '[empty body]';

    console.log('[MCP] Incoming request', {
      time: new Date().toISOString(),
      method: req.method,
      url: req.originalUrl,
      headers: truncateHeaders(req.headers),
      body: rawBodyAsString
    });

    try {
      const result = await handleRequest(req, res);
      console.log('[MCP] Response sent', {
        time: new Date().toISOString(),
        status: res.statusCode,
        resultPreview: previewPayload(result)
      });
    } catch (err) {
      console.error('[MCP] Handler error', {
        time: new Date().toISOString(),
        error: err?.stack || String(err)
      });
      next(err);
    }
  });

  console.log(
    `[MCP] Router initialized for server "${serverId}" (mockBaseUrl=${resolvedMockBaseUrl})`
  );

  return router;
}
