// @ts-nocheck
import { getServerSession } from 'next-auth';

import { authOptions } from './auth.js';
import prisma from './prisma.js';
import { ensureDefaultProjectForUser, findProjectForUser } from './user-context.js';

export function readApiKeyHeader(request) {
  if (!request?.headers) return null;
  const headerValue = request.headers.get('x-api-key') ?? request.headers.get('X-API-Key');
  if (!headerValue) return null;
  const trimmed = headerValue.trim();
  return trimmed.length ? trimmed : null;
}

function missingApiKeyError() {
  return Object.assign(new Error('Missing API key'), { status: 401 });
}

function invalidApiKeyError() {
  return Object.assign(new Error('Invalid API key'), { status: 401 });
}

export async function requireUserSession() {
  const session = await getServerSession(authOptions);
  const userId = Number(session?.user?.id);
  if (!userId) {
    throw Object.assign(new Error('Unauthorized'), { status: 401 });
  }
  return { session, userId };
}

export async function resolveActiveProject(userId, request) {
  const url = new URL(request.url);
  const requestedProjectId = Number(url.searchParams.get('projectId'));

  if (requestedProjectId) {
    const project = await findProjectForUser(userId, requestedProjectId);
    if (project) {
      return project;
    }
  }

  const { project } = await ensureDefaultProjectForUser(userId);
  if (!project) {
    throw Object.assign(new Error('Active project not found'), { status: 404 });
  }
  return project;
}

async function resolveProjectFromApiKey(request) {
  const apiKey = readApiKeyHeader(request);
  if (!apiKey) {
    throw missingApiKeyError();
  }

  const project = await prisma.project.findUnique({ where: { apiKey } });
  if (!project) {
    throw invalidApiKeyError();
  }

  return { project, apiKey };
}

export async function getRuntimeContext(request) {
  const session = await getServerSession(authOptions);
  const userId = Number(session?.user?.id);

  if (userId) {
    const project = await resolveActiveProject(userId, request);
    return {
      session,
      userId,
      project,
      projectId: project?.id,
      authStrategy: 'session',
    };
  }

  const { project, apiKey } = await resolveProjectFromApiKey(request);
  return {
    session: null,
    userId: project.userId,
    project,
    projectId: project?.id,
    apiKey,
    authStrategy: 'apiKey',
  };
}
