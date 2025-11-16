'use client';

import Link from 'next/link';
import { signIn, signOut, useSession } from 'next-auth/react';

export default function AuthButtons() {
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return <span className="muted">Checking session…</span>;
  }

  if (!session) {
    return (
      <button className="btn" onClick={() => signIn(undefined, { callbackUrl: '/dashboard' })}>
        Log in
      </button>
    );
  }

  return (
    <div className="auth-buttons">
      <span className="muted">Signed in as {session.user?.email}</span>
      <Link className="btn ghost" href="/dashboard">Dashboard</Link>
      <button className="btn danger" onClick={() => signOut({ callbackUrl: '/login' })}>
        Log out
      </button>
    </div>
  );
}
