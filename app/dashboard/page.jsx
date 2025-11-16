import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../lib/auth.js';

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login?callbackUrl=/dashboard');
  }

  return (
    <section className="panel">
      <h1>MindBridge X dashboard</h1>
      <p className="muted">Your workspace is secured to your account.</p>
      <div className="stat">
        <div className="label">Signed in as</div>
        <div className="value">{session.user?.email}</div>
      </div>
      <div className="stat">
        <div className="label">User ID</div>
        <div className="value">{session.user?.id}</div>
      </div>
      <p>
        Use this dashboard to manage projects, OpenAPI specs, and MCP tooling. Additional pages can reuse the same session via
        <code>getServerSession</code>.
      </p>
      <Link className="btn" href="/">
        Back to home
      </Link>
    </section>
  );
}
