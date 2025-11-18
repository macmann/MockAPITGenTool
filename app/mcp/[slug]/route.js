import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '../../../lib/auth.js';
import prisma from '../../../lib/prisma.js';
import { ensureDefaultProjectForUser, findProjectForUser } from '../../../lib/user-context.js';
import { executeMcpHttpTool } from '../../../mcp-http-client.js';

export const dynamic = 'force-dynamic';

const DEFAULT_PROTOCOL_VERSION = '2025-06-18';

function jsonRpcResponse(payload, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { 'cache-control': 'no-store' },
  });
}

function jsonRpcError(id, code, message, data) {
  const error = { code, message };
  if (data !== undefined) {
    error.data = data;
  }
  return { jsonrpc: '2.0', id: id ?? null, error };
}

function slugify(value) {
  if (!value) return '';
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

async function requireUser() {
  const session = await getServerSession(authOptions);
  const userId = Number(session?.user?.id);
  if (!userId) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  return { userId };
}

async function resolveProject(userId, url) {
  const { searchParams } = new URL(url);
  const requestedProjectId = Number(searchParams.get('projectId'));
  if (requestedProjectId) {
    const project = await findProjectForUser(userId, requestedProjectId);
    if (project) {
      return project;
    }
  }
  const { project } = await ensureDefaultProjectForUser(userId);
  return project;
}

async function loadServer(userId, projectId, slugParam) {
  const normalizedSlug = slugify(slugParam);
  if (!normalizedSlug) {
    return null;
  }
  return prisma.mcpServer.findFirst({
    where: { userId, projectId, slug: normalizedSlug, isEnabled: true },
    include: { authConfig: true },
  });
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

export async function POST(request, context) {
  const { slug } = context.params || {};
  const { userId, error } = await requireUser();
  if (!userId) {
    return error;
  }

  let project;
  try {
    project = await resolveProject(userId, request.url);
  } catch (err) {
    return jsonRpcResponse(jsonRpcError(null, -32603, 'Failed to resolve project', { message: err?.message }), 500);
  }

  if (!project) {
    return jsonRpcResponse(jsonRpcError(null, -32004, 'Active project not found'), 404);
  }

  const server = await loadServer(userId, project.id, slug);
  if (!server) {
    return jsonRpcResponse(
      jsonRpcError(null, -32004, `MCP server not found or disabled for slug: ${slugify(slug) || slug}`),
      404,
    );
  }

  const contentType = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (contentType !== 'application/json') {
    return jsonRpcResponse(jsonRpcError(null, -32700, 'Content-Type must be application/json'), 415);
  }

  let rawBody = '';
  try {
    rawBody = await request.text();
  } catch (err) {
    return jsonRpcResponse(jsonRpcError(null, -32700, 'Parse error: Invalid JSON body'), 400);
  }

  let rpcPayload;
  try {
    rpcPayload = rawBody ? JSON.parse(rawBody) : {};
  } catch (err) {
    return jsonRpcResponse(jsonRpcError(null, -32700, 'Parse error: Invalid JSON body'), 400);
  }

  const rpc = rpcPayload && typeof rpcPayload === 'object' ? rpcPayload : {};
  const hasId = Object.prototype.hasOwnProperty.call(rpc, 'id');
  const responseId = hasId ? rpc.id ?? null : null;
  const rpcMethod = rpc.method;
  const params = rpc.params || {};

  if (rpc.jsonrpc !== '2.0' || typeof rpcMethod !== 'string') {
    return jsonRpcResponse(jsonRpcError(responseId, -32600, 'Invalid JSON-RPC 2.0 request'), 400);
  }

  const protocolVersion = typeof params.protocolVersion === 'string' ? params.protocolVersion : DEFAULT_PROTOCOL_VERSION;

  if (!hasId) {
    return new Response(null, { status: 204 });
  }

  try {
    if (rpcMethod === 'initialize') {
      return jsonRpcResponse(
        {
          jsonrpc: '2.0',
          id: responseId,
          result: {
            protocolVersion,
            serverInfo: {
              name: server.name,
              version: server.updatedAt.toISOString(),
            },
            capabilities: {
              tools: {
                list: true,
                call: true,
              },
            },
          },
        },
        200,
      );
    }

    if (rpcMethod === 'tools/list') {
      const tools = await prisma.mcpTool.findMany({
        where: { serverId: server.id, enabled: true },
        orderBy: { createdAt: 'asc' },
      });
      return jsonRpcResponse(
        {
          jsonrpc: '2.0',
          id: responseId,
          result: {
            tools: tools.map((tool) => ({
              name: tool.name,
              description: tool.description || '',
              inputSchema: normalizeSchema(tool.inputSchema),
            })),
          },
        },
        200,
      );
    }

    if (rpcMethod === 'tools/call') {
      const toolName = params?.name;
      const args = params?.arguments || {};

      if (!toolName || typeof toolName !== 'string') {
        return jsonRpcResponse(
          jsonRpcError(responseId, -32602, 'Invalid params: "name" is required and must be a string'),
          400,
        );
      }

      const tool = await prisma.mcpTool.findFirst({
        where: { serverId: server.id, name: toolName },
      });

      if (!tool || tool.enabled === false) {
        return jsonRpcResponse(
          jsonRpcError(responseId, -32002, `Tool not found or disabled: ${toolName}`),
          404,
        );
      }

      const executorTool = adaptToolForExecutor(tool, server);
      const executorAuth = adaptAuthConfig(server.authConfig);

      try {
        const result = await executeMcpHttpTool({ tool: executorTool, authConfig: executorAuth, args });
        const content = [];
        if (result.json !== null) {
          content.push({ type: 'json', data: result.json });
        } else {
          content.push({ type: 'text', text: result.rawBody || '' });
        }
        content.push({ type: 'text', text: `HTTP ${result.status}` });

        return jsonRpcResponse(
          {
            jsonrpc: '2.0',
            id: responseId,
            result: { content },
          },
          200,
        );
      } catch (err) {
        return jsonRpcResponse(
          jsonRpcError(responseId, -32603, 'Failed to execute HTTP tool', { message: err?.message }),
          500,
        );
      }
    }

    return jsonRpcResponse(
      jsonRpcError(responseId, -32601, `Method not found: ${rpcMethod}`),
      200,
    );
  } catch (err) {
    return jsonRpcResponse(
      jsonRpcError(responseId, -32603, 'Internal MCP server error', { message: err?.message || String(err) }),
      500,
    );
  }
}
