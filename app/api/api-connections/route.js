import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '../../../lib/auth.js';
import prisma from '../../../lib/prisma.js';
import { findProjectForUser } from '../../../lib/user-context.js';

const AUTH_TYPES = new Set(['none', 'api_key_header', 'api_key_query', 'bearer', 'basic']);

async function requireUser() {
  const session = await getServerSession(authOptions);
  const userId = Number(session?.user?.id);
  if (!userId) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  return { userId };
}

function parseExtraHeaders(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error('Extra headers must be valid JSON');
  }
}

function normalizeString(value) {
  if (value === undefined || value === null) return undefined;
  const trimmed = String(value).trim();
  return trimmed === '' ? undefined : trimmed;
}

async function ensureProject(userId, projectId) {
  const numericProjectId = Number(projectId);
  if (!numericProjectId) {
    throw new Error('A valid projectId is required');
  }

  const project = await findProjectForUser(userId, numericProjectId);
  if (!project) {
    throw new Error('Project not found');
  }

  return project;
}

export async function GET(req) {
  const { userId, error } = await requireUser();
  if (!userId) return error;

  const { searchParams } = new URL(req.url);
  const projectId = Number(searchParams.get('projectId'));
  if (!projectId) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
  }

  const project = await findProjectForUser(userId, projectId);
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const connections = await prisma.apiConnection.findMany({
    where: { userId, projectId: project.id },
    orderBy: { updatedAt: 'desc' }
  });

  return NextResponse.json({ connections });
}

export async function POST(req) {
  const { userId, error } = await requireUser();
  if (!userId) return error;

  const body = await req.json().catch(() => ({}));
  const projectId = body?.projectId;
  if (!projectId) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
  }

  let project;
  try {
    project = await ensureProject(userId, projectId);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  const baseUrl = normalizeString(body?.baseUrl);
  if (!baseUrl) {
    return NextResponse.json({ error: 'baseUrl is required' }, { status: 400 });
  }

  const authType = AUTH_TYPES.has(body?.authType) ? body.authType : 'none';

  let extraHeaders;
  try {
    extraHeaders = parseExtraHeaders(body?.extraHeaders);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  const connection = await prisma.apiConnection.create({
    data: {
      userId,
      projectId: project.id,
      baseUrl,
      authType,
      apiKeyHeaderName: normalizeString(body?.apiKeyHeaderName) || null,
      apiKeyHeaderValue: normalizeString(body?.apiKeyHeaderValue) || null,
      apiKeyQueryName: normalizeString(body?.apiKeyQueryName) || null,
      apiKeyQueryValue: normalizeString(body?.apiKeyQueryValue) || null,
      bearerToken: normalizeString(body?.bearerToken) || null,
      basicUsername: normalizeString(body?.basicUsername) || null,
      basicPassword: normalizeString(body?.basicPassword) || null,
      extraHeaders: extraHeaders || null
    }
  });

  return NextResponse.json({ connection }, { status: 201 });
}

export async function PATCH(req) {
  const { userId, error } = await requireUser();
  if (!userId) return error;

  const body = await req.json().catch(() => ({}));
  const connectionId = Number(body?.id || body?.connectionId);
  if (!connectionId) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const connection = await prisma.apiConnection.findFirst({ where: { id: connectionId, userId } });
  if (!connection) {
    return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
  }

  let extraHeaders;
  try {
    extraHeaders = parseExtraHeaders(body?.extraHeaders);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  const updates = {
    ...(body?.baseUrl !== undefined ? { baseUrl: normalizeString(body.baseUrl) || connection.baseUrl } : {}),
    ...(body?.authType !== undefined && AUTH_TYPES.has(body.authType) ? { authType: body.authType } : {}),
    ...(body?.apiKeyHeaderName !== undefined ? { apiKeyHeaderName: normalizeString(body.apiKeyHeaderName) || null } : {}),
    ...(body?.apiKeyHeaderValue !== undefined ? { apiKeyHeaderValue: normalizeString(body.apiKeyHeaderValue) || null } : {}),
    ...(body?.apiKeyQueryName !== undefined ? { apiKeyQueryName: normalizeString(body.apiKeyQueryName) || null } : {}),
    ...(body?.apiKeyQueryValue !== undefined ? { apiKeyQueryValue: normalizeString(body.apiKeyQueryValue) || null } : {}),
    ...(body?.bearerToken !== undefined ? { bearerToken: normalizeString(body.bearerToken) || null } : {}),
    ...(body?.basicUsername !== undefined ? { basicUsername: normalizeString(body.basicUsername) || null } : {}),
    ...(body?.basicPassword !== undefined ? { basicPassword: normalizeString(body.basicPassword) || null } : {}),
    ...(body?.extraHeaders !== undefined ? { extraHeaders: extraHeaders || null } : {})
  };

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const updated = await prisma.apiConnection.update({
    where: { id: connectionId },
    data: updates
  });

  return NextResponse.json({ connection: updated });
}

export async function DELETE(req) {
  const { userId, error } = await requireUser();
  if (!userId) return error;

  const { searchParams } = new URL(req.url);
  const connectionId = Number(searchParams.get('id') || searchParams.get('connectionId'));
  if (!connectionId) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const connection = await prisma.apiConnection.findFirst({ where: { id: connectionId, userId } });
  if (!connection) {
    return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
  }

  await prisma.toolMapping.updateMany({
    where: { userId, projectId: connection.projectId, apiConnectionId: connection.id },
    data: { apiConnectionId: null }
  });
  await prisma.apiConnection.delete({ where: { id: connection.id } });

  return NextResponse.json({ ok: true });
}
