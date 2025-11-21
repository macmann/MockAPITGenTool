import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '../../../../lib/auth.js';
import prisma from '../../../../lib/prisma.js';
import { hashPassword, verifyPassword } from '../../../../lib/passwords.js';

function validatePayload(body = {}) {
  const currentPassword = body?.currentPassword?.trim();
  const newPassword = body?.newPassword?.trim();
  const confirmPassword = body?.confirmPassword?.trim();

  if (!currentPassword || !newPassword || !confirmPassword) {
    return { error: 'All fields are required.' };
  }

  if (newPassword.length < 8) {
    return { error: 'New password must be at least 8 characters long.' };
  }

  if (newPassword !== confirmPassword) {
    return { error: 'New password and confirmation must match.' };
  }

  return { currentPassword, newPassword };
}

export async function POST(request) {
  const session = await getServerSession(authOptions);
  const userId = Number(session?.user?.id);

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const validation = validatePayload(body);

  if (validation.error) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user?.passwordHash) {
      return NextResponse.json(
        { error: 'Password changes are not available for this account.' },
        { status: 400 }
      );
    }

    const isCurrentValid = await verifyPassword(validation.currentPassword, user.passwordHash);
    if (!isCurrentValid) {
      return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 401 });
    }

    const passwordHash = await hashPassword(validation.newPassword);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to change password', error);
    return NextResponse.json({ error: 'Unable to change password right now.' }, { status: 500 });
  }
}
