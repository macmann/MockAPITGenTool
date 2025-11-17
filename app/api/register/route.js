import { NextResponse } from 'next/server';

import prisma from '../../../lib/prisma.js';
import { hashPassword } from '../../../lib/passwords.js';

function validatePayload({ email, password, confirmPassword }) {
  const normalizedEmail = email?.toLowerCase().trim();
  const trimmedPassword = password?.trim();
  const trimmedConfirm = confirmPassword?.trim();

  if (!normalizedEmail || !trimmedPassword || !trimmedConfirm) {
    return { error: 'All fields are required.' };
  }

  if (trimmedPassword.length < 8) {
    return { error: 'Password must be at least 8 characters long.' };
  }

  if (trimmedPassword !== trimmedConfirm) {
    return { error: 'Passwords do not match.' };
  }

  return { email: normalizedEmail, password: trimmedPassword };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const validation = validatePayload(body || {});

    if (validation.error) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const { email, password } = validation;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return NextResponse.json({ error: 'An account with that email already exists.' }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);
    await prisma.user.create({
      data: {
        email,
        passwordHash,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to register user', error);
    return NextResponse.json({ error: 'Unable to register. Please try again.' }, { status: 500 });
  }
}
