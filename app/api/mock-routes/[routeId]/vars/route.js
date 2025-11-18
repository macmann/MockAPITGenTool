import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '../../../../../lib/auth.js';
import prisma from '../../../../../lib/prisma.js';

async function requireUser() {
  const session = await getServerSession(authOptions);
  const userId = Number(session?.user?.id);
  if (!userId) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  return { userId };
}

async function findRoute(routeId, userId) {
  const numericRouteId = Number(routeId);
  if (!numericRouteId) return null;
  return prisma.mockRoute.findFirst({ where: { id: numericRouteId, userId } });
}

function serializeVars(vars = []) {
  return vars.map((variable) => ({
    id: variable.id,
    key: variable.key,
    value: variable.value,
    createdAt: variable.createdAt,
    updatedAt: variable.updatedAt
  }));
}

export async function POST(req, { params }) {
  const { userId, error } = await requireUser();
  if (!userId) return error;

  const route = await findRoute(params?.routeId, userId);
  if (!route) {
    return NextResponse.json({ error: 'Route not found' }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const key = String(body?.key || '').trim();
  const value = String(body?.value ?? '').trim();
  if (!key) {
    return NextResponse.json({ error: 'key is required' }, { status: 400 });
  }

  const variable = await prisma.mockRouteVar.upsert({
    where: { routeId_key: { routeId: route.id, key } },
    update: { value },
    create: { routeId: route.id, key, value }
  });

  const vars = await prisma.mockRouteVar.findMany({
    where: { routeId: route.id },
    orderBy: { updatedAt: 'desc' }
  });

  return NextResponse.json({ variable, vars: serializeVars(vars) }, { status: variable.createdAt === variable.updatedAt ? 201 : 200 });
}

export async function DELETE(req, { params }) {
  const { userId, error } = await requireUser();
  if (!userId) return error;

  const route = await findRoute(params?.routeId, userId);
  if (!route) {
    return NextResponse.json({ error: 'Route not found' }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const varId = Number(searchParams.get('varId'));
  const key = searchParams.get('key');

  if (!varId && !key) {
    return NextResponse.json({ error: 'varId or key is required' }, { status: 400 });
  }

  if (varId) {
    await prisma.mockRouteVar.deleteMany({ where: { id: varId, routeId: route.id } });
  } else if (key) {
    await prisma.mockRouteVar.deleteMany({ where: { routeId: route.id, key } });
  }

  const vars = await prisma.mockRouteVar.findMany({
    where: { routeId: route.id },
    orderBy: { updatedAt: 'desc' }
  });

  return NextResponse.json({ vars: serializeVars(vars) });
}
