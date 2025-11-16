import prisma from './prisma.js';
import { ensureDefaultProjectForUser, findProjectForUser } from './user-context.js';

export function detectSpecFormat(rawSpec = '') {
  const trimmed = String(rawSpec || '').trim();
  if (!trimmed) return 'unknown';
  const firstChar = trimmed[0];
  if (firstChar === '{' || firstChar === '[') return 'json';
  return 'yaml';
}

export async function persistOpenApiSpecForUser({
  userId,
  projectId,
  rawSpec,
  format,
  existingSpecId
} = {}, client = prisma) {
  const { project, user } =
    (projectId && (await findProjectForUser(userId, projectId, client))) ||
    (await ensureDefaultProjectForUser(userId, client));
  const specFormat = format || detectSpecFormat(rawSpec);

  if (existingSpecId) {
    const spec = await client.openApiSpec.findFirst({ where: { id: Number(existingSpecId), userId: user.id } });
    if (spec && spec.projectId === project.id && spec.userId === user.id) {
      if (rawSpec) {
        return client.openApiSpec.update({
          where: { id: spec.id },
          data: { rawSpec, format: specFormat }
        });
      }
      return spec;
    }
  }

  if (!rawSpec) return null;

  return client.openApiSpec.create({
    data: {
      rawSpec,
      format: specFormat,
      projectId: project.id,
      userId: user.id
    }
  });
}

function normalizeExtraHeaders(extraHeaders) {
  if (!extraHeaders) return null;
  if (typeof extraHeaders === 'object') return extraHeaders;
  try {
    return JSON.parse(extraHeaders);
  } catch {
    return null;
  }
}

export async function upsertApiConnectionForUser({ userId, projectId, baseUrl = '', auth } = {}, client = prisma) {
  const { user, project } =
    (projectId && (await findProjectForUser(userId, projectId, client))) ||
    (await ensureDefaultProjectForUser(userId, client));
  const authType = auth?.auth_type || 'none';
  const payload = {
    baseUrl: baseUrl || '',
    authType,
    apiKeyHeaderName: authType === 'api_key_header' ? auth?.api_key_header_name || null : null,
    apiKeyHeaderValue: auth?.api_key_value ?? null,
    apiKeyQueryName: authType === 'api_key_query' ? auth?.api_key_query_name || null : null,
    apiKeyQueryValue: auth?.api_key_query_value ?? null,
    bearerToken: authType === 'bearer_token' ? auth?.bearer_token || null : null,
    basicUsername: authType === 'basic' ? auth?.basic_username || null : null,
    basicPassword: authType === 'basic' ? auth?.basic_password || null : null,
    extraHeaders: normalizeExtraHeaders(auth?.extra_headers_json)
  };

  const existing = await client.apiConnection.findFirst({ where: { projectId: project.id, userId: user.id } });
  if (existing) {
    return client.apiConnection.update({
      where: { id: existing.id },
      data: payload
    });
  }

  return client.apiConnection.create({
    data: {
      ...payload,
      userId: user.id,
      projectId: project.id
    }
  });
}

export async function replaceToolMappingsForUser({
  userId,
  projectId,
  operations = [],
  openApiSpecId = null,
  apiConnectionId = null
} = {}, client = prisma) {
  const { user, project } =
    (projectId && (await findProjectForUser(userId, projectId, client))) ||
    (await ensureDefaultProjectForUser(userId, client));

  const mappings = operations
    .filter(Boolean)
    .map((op) => ({
      userId: user.id,
      projectId: project.id,
      openApiSpecId: openApiSpecId || null,
      apiConnectionId: apiConnectionId || null,
      operationId: op.operationId || `${op.method || 'GET'}_${op.path || '/'}`,
      method: op.method || 'GET',
      path: op.path || '/',
      toolName:
        op.resolvedName || op.tool_name || op.suggestedName || op.operationId || `${op.method || 'GET'}_${op.path || '/'}`,
      summary: op.summary || '',
      description: op.description || ''
    }));

  if (openApiSpecId) {
    await client.toolMapping.deleteMany({ where: { projectId: project.id, userId: user.id, openApiSpecId } });
  } else {
    await client.toolMapping.deleteMany({ where: { projectId: project.id, userId: user.id } });
  }

  if (mappings.length === 0) {
    return [];
  }

  await client.toolMapping.createMany({ data: mappings, skipDuplicates: true });
  return client.toolMapping.findMany({
    where: {
      projectId: project.id,
      userId: user.id,
      ...(openApiSpecId ? { openApiSpecId } : {})
    }
  });
}

export default {
  detectSpecFormat,
  persistOpenApiSpecForUser,
  upsertApiConnectionForUser,
  replaceToolMappingsForUser
};
