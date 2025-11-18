import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '../../../lib/auth.js';
import prisma from '../../../lib/prisma.js';
import { findProjectForUser } from '../../../lib/user-context.js';

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

  const specs = await prisma.openApiSpec.findMany({
    where: { userId, projectId: project.id },
    orderBy: { updatedAt: 'desc' }
  });

  return NextResponse.json({ specs });
}

export async function POST(req) {
  const { userId, error } = await requireUser();
  if (!userId) return error;

  const body = await req.json().catch(() => ({}));
  const projectId = body?.projectId;
  const rawSpec = body?.rawSpec?.trim();
  const format = body?.format === 'yaml' ? 'yaml' : 'json';

  if (!projectId) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
  }

  if (!rawSpec) {
    return NextResponse.json({ error: 'rawSpec is required' }, { status: 400 });
  }

  let project;
  try {
    project = await ensureProject(userId, projectId);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  const spec = await prisma.openApiSpec.create({
    data: {
      userId,
      projectId: project.id,
      rawSpec,
      format
    }
  });

  return NextResponse.json({ spec }, { status: 201 });
}

export async function PATCH(req) {
  const { userId, error } = await requireUser();
  if (!userId) return error;

  const body = await req.json().catch(() => ({}));
  const specId = Number(body?.id || body?.specId);
  if (!specId) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const spec = await prisma.openApiSpec.findFirst({ where: { id: specId, userId } });
  if (!spec) {
    return NextResponse.json({ error: 'Spec not found' }, { status: 404 });
  }

  const updates = {
    ...(body?.rawSpec !== undefined ? { rawSpec: String(body.rawSpec) } : {}),
    ...(body?.format !== undefined ? { format: body.format === 'yaml' ? 'yaml' : 'json' } : {})
  };

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const updated = await prisma.openApiSpec.update({ where: { id: specId }, data: updates });
  return NextResponse.json({ spec: updated });
}

export async function DELETE(req) {
  const { userId, error } = await requireUser();
  if (!userId) return error;

  const { searchParams } = new URL(req.url);
  const specId = Number(searchParams.get('id') || searchParams.get('specId'));
  if (!specId) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const spec = await prisma.openApiSpec.findFirst({ where: { id: specId, userId } });
  if (!spec) {
    return NextResponse.json({ error: 'Spec not found' }, { status: 404 });
  }

  await prisma.toolMapping.updateMany({
    where: { userId, projectId: spec.projectId, openApiSpecId: spec.id },
    data: { openApiSpecId: null }
  });
  await prisma.openApiSpec.delete({ where: { id: spec.id } });

  return NextResponse.json({ ok: true });
}
