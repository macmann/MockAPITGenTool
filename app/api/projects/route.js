import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '../../../lib/auth.js';
import prisma from '../../../lib/prisma.js';
import { DEFAULT_PROJECT_NAME, ensureDefaultProjectForUser } from '../../../lib/user-context.js';

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = Number(session?.user?.id);

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await ensureDefaultProjectForUser(userId);

  const projects = await prisma.project.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' }
  });

  return NextResponse.json({ projects });
}

export async function POST(req) {
  const session = await getServerSession(authOptions);
  const userId = Number(session?.user?.id);

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const name = body?.name?.trim();
  const description = body?.description?.trim() || null;

  if (!name) {
    return NextResponse.json({ error: 'Project name is required' }, { status: 400 });
  }

  try {
    const project = await prisma.project.create({
      data: {
        userId,
        name,
        description
      }
    });

    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    if (error?.code === 'P2002') {
      return NextResponse.json(
        { error: 'A project with this name already exists for your account' },
        { status: 409 }
      );
    }
    console.error('Failed to create project', error);
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
  }
}

export async function DELETE(req) {
  const session = await getServerSession(authOptions);
  const userId = Number(session?.user?.id);

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const projectId = Number(searchParams.get('id') || searchParams.get('projectId'));

  if (!projectId) {
    return NextResponse.json({ error: 'Project id is required' }, { status: 400 });
  }

  const existing = await prisma.project.findFirst({ where: { id: projectId, userId } });
  if (!existing) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  try {
    const nextProject = await prisma.$transaction(async (client) => {
      await client.toolMapping.deleteMany({ where: { userId, projectId } });
      await client.openApiSpec.deleteMany({ where: { userId, projectId } });
      await client.apiConnection.deleteMany({ where: { userId, projectId } });
      await client.project.delete({ where: { id: projectId } });

      const fallback = await client.project.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' } });
      if (fallback) return fallback;

      return client.project.create({
        data: {
          userId,
          name: DEFAULT_PROJECT_NAME,
          description: 'Starter project for your MCP tools'
        }
      });
    });

    const projects = await prisma.project.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json({ project: nextProject, projects });
  } catch (error) {
    console.error('Failed to delete project', error);
    return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 });
  }
}
