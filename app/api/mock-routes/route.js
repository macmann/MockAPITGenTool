import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '../../../lib/auth.js';
import prisma from '../../../lib/prisma.js';
import { findProjectForUser } from '../../../lib/user-context.js';

const SUPPORTED_HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']);

async function requireUser() {
  const session = await getServerSession(authOptions);
  const userId = Number(session?.user?.id);
  if (!userId) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  return { userId };
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

function normalizeMethod(method) {
  if (!method) return 'GET';
  const upper = String(method).trim().toUpperCase();
  if (!SUPPORTED_HTTP_METHODS.has(upper)) {
    throw new Error('Unsupported HTTP method');
  }
  return upper;
}

function normalizePath(pathValue) {
  if (!pathValue) {
    throw new Error('Path is required');
  }
  let normalized = String(pathValue).trim();
  if (!normalized.startsWith('/')) {
    normalized = `/${normalized}`;
  }
  return normalized;
}

function parseJsonField(value, fallback = {}) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
      throw new Error('JSON field must be an object');
    } catch (error) {
      throw new Error('JSON field must contain valid JSON');
    }
  }

  throw new Error('JSON field must be an object');
}

function toBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return value === 'true' || value === '1' || value.toLowerCase() === 'on';
  }
  if (typeof value === 'number') {
    return value === 1;
  }
  return false;
}

function toNumber(value, fallback = 0) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const numeric = Number(value);
  if (Number.isNaN(numeric)) {
    throw new Error('Numeric field is invalid');
  }
  return numeric;
}

function cleanString(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

function serializeRoute(route) {
  return {
    id: route.id,
    userId: route.userId,
    projectId: route.projectId,
    name: route.name,
    description: route.description,
    method: route.method,
    path: route.path,
    enabled: route.enabled,
    matchHeaders: route.matchHeaders || {},
    responseStatus: route.responseStatus,
    responseHeaders: route.responseHeaders || {},
    responseBody: route.responseBody,
    responseIsJson: route.responseIsJson,
    responseDelayMs: route.responseDelayMs,
    templateEnabled: route.templateEnabled,
    createdAt: route.createdAt,
    updatedAt: route.updatedAt,
    vars: (route.vars || []).map((variable) => ({
      id: variable.id,
      key: variable.key,
      value: variable.value,
      createdAt: variable.createdAt,
      updatedAt: variable.updatedAt
    }))
  };
}

export async function GET(req) {
  const { userId, error } = await requireUser();
  if (!userId) return error;

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  if (!projectId) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
  }

  let project;
  try {
    project = await ensureProject(userId, projectId);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  const routes = await prisma.mockRoute.findMany({
    where: { userId, projectId: project.id },
    include: { vars: true },
    orderBy: { updatedAt: 'desc' }
  });

  return NextResponse.json({ routes: routes.map(serializeRoute) });
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

  let method;
  let path;
  let matchHeaders;
  let responseHeaders;
  try {
    method = normalizeMethod(body?.method);
    path = normalizePath(body?.path);
    matchHeaders = parseJsonField(body?.matchHeaders);
    responseHeaders = parseJsonField(body?.responseHeaders);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  let responseStatus;
  let responseDelayMs;
  try {
    responseStatus = toNumber(body?.responseStatus ?? 200, 200);
    responseDelayMs = toNumber(body?.responseDelayMs ?? 0, 0);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  const route = await prisma.mockRoute.create({
    data: {
      userId,
      projectId: project.id,
      name: cleanString(body?.name),
      description: cleanString(body?.description),
      method,
      path,
      enabled: toBoolean(body?.enabled),
      matchHeaders,
      responseStatus,
      responseHeaders,
      responseBody: body?.responseBody ?? '',
      responseIsJson: toBoolean(body?.responseIsJson),
      responseDelayMs,
      templateEnabled: toBoolean(body?.templateEnabled)
    },
    include: { vars: true }
  });

  return NextResponse.json({ route: serializeRoute(route) }, { status: 201 });
}

export async function PATCH(req) {
  const { userId, error } = await requireUser();
  if (!userId) return error;

  const body = await req.json().catch(() => ({}));
  const routeId = Number(body?.id || body?.routeId);
  if (!routeId) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const existing = await prisma.mockRoute.findFirst({ where: { id: routeId, userId } });
  if (!existing) {
    return NextResponse.json({ error: 'Route not found' }, { status: 404 });
  }

  const updates = {};

  if (body?.name !== undefined) updates.name = cleanString(body.name);
  if (body?.description !== undefined) updates.description = cleanString(body.description);
  if (body?.method !== undefined) {
    try {
      updates.method = normalizeMethod(body.method);
    } catch (err) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
  }
  if (body?.path !== undefined) {
    try {
      updates.path = normalizePath(body.path);
    } catch (err) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
  }
  if (body?.matchHeaders !== undefined) {
    try {
      updates.matchHeaders = parseJsonField(body.matchHeaders);
    } catch (err) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
  }
  if (body?.responseHeaders !== undefined) {
    try {
      updates.responseHeaders = parseJsonField(body.responseHeaders);
    } catch (err) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
  }
  if (body?.responseBody !== undefined) updates.responseBody = body.responseBody ?? '';
  if (body?.responseStatus !== undefined) {
    try {
      updates.responseStatus = toNumber(body.responseStatus, existing.responseStatus);
    } catch (err) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
  }
  if (body?.responseDelayMs !== undefined) {
    try {
      updates.responseDelayMs = toNumber(body.responseDelayMs, existing.responseDelayMs);
    } catch (err) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
  }
  if (body?.enabled !== undefined) updates.enabled = toBoolean(body.enabled);
  if (body?.responseIsJson !== undefined) updates.responseIsJson = toBoolean(body.responseIsJson);
  if (body?.templateEnabled !== undefined) updates.templateEnabled = toBoolean(body.templateEnabled);

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const updated = await prisma.mockRoute.update({
    where: { id: routeId },
    data: updates,
    include: { vars: true }
  });

  return NextResponse.json({ route: serializeRoute(updated) });
}

export async function DELETE(req) {
  const { userId, error } = await requireUser();
  if (!userId) return error;

  const { searchParams } = new URL(req.url);
  const routeId = Number(searchParams.get('id') || searchParams.get('routeId'));
  if (!routeId) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const existing = await prisma.mockRoute.findFirst({ where: { id: routeId, userId } });
  if (!existing) {
    return NextResponse.json({ error: 'Route not found' }, { status: 404 });
  }

  await prisma.mockRoute.delete({ where: { id: existing.id } });

  return NextResponse.json({ ok: true });
}
