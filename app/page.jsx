import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';

import { authOptions } from '../lib/auth.js';

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  if (session) {
    redirect('/dashboard');
  }

  redirect('/login');
}
