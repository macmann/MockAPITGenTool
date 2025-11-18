'use client';

import { useTransition } from 'react';
import { signOut } from 'next-auth/react';

export default function LogoutButton() {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className="btn ghost"
      disabled={isPending}
      onClick={() =>
        startTransition(() => {
          signOut({ callbackUrl: '/login' });
        })
      }
    >
      {isPending ? 'Signing out…' : 'Log out'}
    </button>
  );
}
