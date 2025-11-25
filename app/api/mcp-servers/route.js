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

function cleanString(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
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

function slugify(value) {
  if (!value) return '';
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function ensureSlug(name, provided) {
  const base = provided ? slugify(provided) : slugify(name);
  if (!base) {
    throw new Error('Slug or name is required');
  }
  return base;
}

function serializeServer(server) {
  return {
    id: server.id,
    userId: server.userId,
    projectId: server.projectId,
    name: server.name,
    slug: server.slug,
    description: server.description,
    baseUrl: server.baseUrl,
    isEnabled: server.isEnabled,
    requireApiKey: server.requireApiKey,
    apiKey: server.apiKey,
    createdAt: server.createdAt,
    updatedAt: server.updatedAt,
    mcpPath: `/mcp/${server.slug}`
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

  const servers = await prisma.mcpServer.findMany({
    where: { userId, projectId: project.id },
    orderBy: { updatedAt: 'desc' }
  });

  return NextResponse.json({ servers: servers.map(serializeServer) });
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

  const name = cleanString(body?.name);
  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  let slug;
  try {
    slug = ensureSlug(name, body?.slug);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  const existingSlug = await prisma.mcpServer.findFirst({ where: { userId, projectId: project.id, slug } });
  if (existingSlug) {
    return NextResponse.json({ error: 'Slug already in use for this project' }, { status: 409 });
  }

  const server = await prisma.mcpServer.create({
    data: {
      userId,
      projectId: project.id,
      name,
      slug,
      description: cleanString(body?.description),
      baseUrl: cleanString(body?.baseUrl),
      isEnabled: toBoolean(body?.isEnabled),
      requireApiKey: toBoolean(body?.requireApiKey ?? false)
    }
  });

  return NextResponse.json({ server: serializeServer(server) }, { status: 201 });
}

export async function PATCH(req) {
  const { userId, error } = await requireUser();
  if (!userId) return error;

  const body = await req.json().catch(() => ({}));
  const serverId = Number(body?.id || body?.serverId);
  if (!serverId) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const server = await prisma.mcpServer.findFirst({ where: { id: serverId, userId } });
  if (!server) {
    return NextResponse.json({ error: 'Server not found' }, { status: 404 });
  }

  const updates = {};
  if (body?.name !== undefined) {
    const name = cleanString(body.name);
    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    updates.name = name;
  }
  if (body?.description !== undefined) updates.description = cleanString(body.description);
  if (body?.baseUrl !== undefined) updates.baseUrl = cleanString(body.baseUrl);
  if (body?.isEnabled !== undefined) updates.isEnabled = toBoolean(body.isEnabled);
  if (body?.requireApiKey !== undefined) updates.requireApiKey = toBoolean(body.requireApiKey);
  if (body?.slug !== undefined) {
    let slug;
    try {
      slug = ensureSlug(body?.name || server.name, body.slug);
    } catch (err) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }

    const existingSlug = await prisma.mcpServer.findFirst({
      where: {
        userId,
        projectId: server.projectId,
        slug,
        NOT: { id: server.id }
      }
    });
    if (existingSlug) {
      return NextResponse.json({ error: 'Slug already in use for this project' }, { status: 409 });
    }
    updates.slug = slug;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const updated = await prisma.mcpServer.update({ where: { id: server.id }, data: updates });

  return NextResponse.json({ server: serializeServer(updated) });
}

export async function DELETE(req) {
  const { userId, error } = await requireUser();
  if (!userId) return error;

  const { searchParams } = new URL(req.url);
  const serverId = Number(searchParams.get('id') || searchParams.get('serverId'));
  if (!serverId) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const server = await prisma.mcpServer.findFirst({ where: { id: serverId, userId } });
  if (!server) {
    return NextResponse.json({ error: 'Server not found' }, { status: 404 });
  }

  await prisma.mcpServer.delete({ where: { id: server.id } });

  return NextResponse.json({ ok: true });
}
