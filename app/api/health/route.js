import { NextResponse } from 'next/server';

import prisma from '../../../lib/prisma.js';

export const dynamic = 'force-dynamic';

export async function GET() {
  let database = 'ok';

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    console.error('Health check database ping failed', error);
    database = 'unavailable';
  }

  return NextResponse.json({ status: 'ok', database });
}
