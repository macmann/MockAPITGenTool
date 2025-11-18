import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '../../../lib/auth.js';
import prisma from '../../../lib/prisma.js';
import { findProjectForUser } from '../../../lib/user-context.js';

const METHOD_SET = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

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

async function ensureSpec(userId, projectId, specId) {
  if (!specId) return null;
  const spec = await prisma.openApiSpec.findFirst({ where: { id: Number(specId), userId, projectId } });
  if (!spec) {
    throw new Error('OpenAPI spec not found');
  }
  return spec;
}

async function ensureConnection(userId, projectId, connectionId) {
  if (!connectionId) return null;
  const connection = await prisma.apiConnection.findFirst({ where: { id: Number(connectionId), userId, projectId } });
  if (!connection) {
    throw new Error('API connection not found');
  }
  return connection;
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

  const mappings = await prisma.toolMapping.findMany({
    where: { userId, projectId: project.id },
    orderBy: { updatedAt: 'desc' }
  });

  return NextResponse.json({ mappings });
}

export async function POST(req) {
  const { userId, error } = await requireUser();
  if (!userId) return error;

  const body = await req.json().catch(() => ({}));
  const projectId = body?.projectId;
  const toolName = body?.toolName?.trim();
  const operationId = body?.operationId?.trim();
  const path = body?.path?.trim();
  const method = String(body?.method || 'GET').toUpperCase();

  if (!projectId) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
  }
  if (!toolName || !operationId || !path) {
    return NextResponse.json({ error: 'toolName, operationId, and path are required' }, { status: 400 });
  }
  if (!METHOD_SET.has(method)) {
    return NextResponse.json({ error: 'Unsupported HTTP method' }, { status: 400 });
  }

  let project;
  try {
    project = await ensureProject(userId, projectId);
    await ensureSpec(userId, project.id, body?.openApiSpecId);
    await ensureConnection(userId, project.id, body?.apiConnectionId);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  const mapping = await prisma.toolMapping.create({
    data: {
      userId,
      projectId: project.id,
      toolName,
      operationId,
      method,
      path,
      summary: body?.summary?.trim() || null,
      description: body?.description?.trim() || null,
      openApiSpecId: body?.openApiSpecId ? Number(body.openApiSpecId) : null,
      apiConnectionId: body?.apiConnectionId ? Number(body.apiConnectionId) : null
    }
  });

  return NextResponse.json({ mapping }, { status: 201 });
}

export async function PATCH(req) {
  const { userId, error } = await requireUser();
  if (!userId) return error;

  const body = await req.json().catch(() => ({}));
  const mappingId = Number(body?.id || body?.mappingId);
  if (!mappingId) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const mapping = await prisma.toolMapping.findFirst({ where: { id: mappingId, userId } });
  if (!mapping) {
    return NextResponse.json({ error: 'Mapping not found' }, { status: 404 });
  }

  if (body?.openApiSpecId) {
    try {
      await ensureSpec(userId, mapping.projectId, body.openApiSpecId);
    } catch (err) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
  }

  if (body?.apiConnectionId) {
    try {
      await ensureConnection(userId, mapping.projectId, body.apiConnectionId);
    } catch (err) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
  }

  const updates = {
    ...(body?.toolName !== undefined ? { toolName: body.toolName.trim() } : {}),
    ...(body?.operationId !== undefined ? { operationId: body.operationId.trim() } : {}),
    ...(body?.path !== undefined ? { path: body.path.trim() } : {}),
    ...(body?.method !== undefined && METHOD_SET.has(String(body.method).toUpperCase())
      ? { method: String(body.method).toUpperCase() }
      : {}),
    ...(body?.summary !== undefined ? { summary: body.summary?.trim() || null } : {}),
    ...(body?.description !== undefined ? { description: body.description?.trim() || null } : {}),
    ...(body?.openApiSpecId !== undefined ? { openApiSpecId: body.openApiSpecId ? Number(body.openApiSpecId) : null } : {}),
    ...(body?.apiConnectionId !== undefined
      ? { apiConnectionId: body.apiConnectionId ? Number(body.apiConnectionId) : null }
      : {})
  };

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const updated = await prisma.toolMapping.update({ where: { id: mappingId }, data: updates });
  return NextResponse.json({ mapping: updated });
}

export async function DELETE(req) {
  const { userId, error } = await requireUser();
  if (!userId) return error;

  const { searchParams } = new URL(req.url);
  const mappingId = Number(searchParams.get('id') || searchParams.get('mappingId'));
  if (!mappingId) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const mapping = await prisma.toolMapping.findFirst({ where: { id: mappingId, userId } });
  if (!mapping) {
    return NextResponse.json({ error: 'Mapping not found' }, { status: 404 });
  }

  await prisma.toolMapping.delete({ where: { id: mapping.id } });
  return NextResponse.json({ ok: true });
}
