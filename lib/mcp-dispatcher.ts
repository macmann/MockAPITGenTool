// @ts-nocheck
import prisma from './prisma.js';
import { executeMcpHttpTool } from '../mcp-http-client.js';

export const DEFAULT_PROTOCOL_VERSION = '2025-06-18';

const METHOD_ALIASES = new Map([
  ['tools/list', 'tools.list'],
  ['tools.call', 'tools.call'],
  ['tools/call', 'tools.call'],
]);

function normalizeMethodName(method) {
  if (!method) return '';
  const raw = String(method).trim();
  return METHOD_ALIASES.get(raw) || raw;
}

function normalizeSchema(schema) {
  if (schema && typeof schema === 'object') {
    return schema;
  }
  return { type: 'object', additionalProperties: true };
}

function adaptToolForExecutor(tool, server) {
  const baseUrl = (tool.baseUrl || server.baseUrl || '').trim();
  return {
    http_method: (tool.httpMethod || 'GET').toUpperCase(),
    base_url: baseUrl,
    path_template: tool.pathTemplate || '/',
    query_mapping_json: JSON.stringify(tool.queryMapping || {}),
    body_mapping_json: JSON.stringify(tool.bodyMapping || {}),
    headers_mapping_json: JSON.stringify(tool.headersMapping || {}),
  };
}

function adaptAuthConfig(authConfig) {
  if (!authConfig) return null;
  return {
    auth_type: authConfig.authType || 'none',
    api_key_header_name: authConfig.apiKeyHeaderName || null,
    api_key_value: authConfig.apiKeyHeaderValue || null,
    api_key_query_name: authConfig.apiKeyQueryName || null,
    api_key_query_value: authConfig.apiKeyQueryValue || null,
    bearer_token: authConfig.bearerToken || null,
    basic_username: authConfig.basicUsername || null,
    basic_password: authConfig.basicPassword || null,
    extra_headers_json: authConfig.extraHeaders ? JSON.stringify(authConfig.extraHeaders) : undefined,
  };
}

async function listTools(server) {
  const tools = await prisma.mcpTool.findMany({
    where: { serverId: server.id, enabled: true },
    orderBy: { createdAt: 'asc' },
  });
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description || '',
    inputSchema: normalizeSchema(tool.inputSchema),
  }));
}

async function callTool(server, params = {}) {
  const toolName = params?.name;
  const args = params?.arguments || {};

  if (!toolName || typeof toolName !== 'string') {
    throw Object.assign(new Error('Invalid params: "name" is required and must be a string'), {
      code: -32602,
      status: 400,
    });
  }

  const tool = await prisma.mcpTool.findFirst({
    where: { serverId: server.id, name: toolName },
  });

  if (!tool || tool.enabled === false) {
    throw Object.assign(new Error(`Tool not found or disabled: ${toolName}`), {
      code: -32002,
      status: 404,
    });
  }

  const executorTool = adaptToolForExecutor(tool, server);
  const executorAuth = adaptAuthConfig(server.authConfig);

  try {
    const result = await executeMcpHttpTool({ tool: executorTool, authConfig: executorAuth, args });
    const content = [];
    if (result.json !== null) {
      const prettyJson = typeof result.json === 'string'
        ? result.json
        : JSON.stringify(result.json, null, 2);
      content.push({ type: 'text', text: prettyJson });
    } else {
      content.push({ type: 'text', text: result.rawBody || '' });
    }
    content.push({ type: 'text', text: `HTTP ${result.status}` });
    return { content };
  } catch (err) {
    throw Object.assign(new Error('Failed to execute HTTP tool'), {
      code: -32603,
      status: 500,
      data: { message: err?.message },
    });
  }
}

export async function dispatchMcpRpc({ method, params, server, protocolVersion = DEFAULT_PROTOCOL_VERSION }) {
  const normalized = normalizeMethodName(method);

  switch (normalized) {
    case 'initialize':
      return {
        kind: 'result',
        status: 200,
        result: {
          protocolVersion,
          serverInfo: {
            name: server?.name || 'Mindbridge X MCP',
            version: server?.updatedAt?.toISOString?.() || new Date().toISOString(),
          },
          capabilities: {
            tools: {
              list: true,
              call: true,
            },
          },
        },
      };
    case 'tools.list':
      return {
        kind: 'result',
        status: 200,
        result: { tools: await listTools(server) },
      };
    case 'tools.call':
      return {
        kind: 'result',
        status: 200,
        result: await callTool(server, params),
      };
    default:
      return {
        kind: 'error',
        status: 200,
        error: {
          code: -32601,
          message: `Method not found: ${method}`,
        },
      };
  }
}
