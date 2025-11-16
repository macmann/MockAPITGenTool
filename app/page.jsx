import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '../lib/auth.js';

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  return (
    <section className="panel">
      <h1>Welcome to MindBridge X</h1>
      <p className="muted">
        Sign in to build mock endpoints, wire them into MCP tools, and manage them securely. Each user keeps their own
        data, projects, and mappings.
      </p>
      {session ? (
        <>
          <p>You are signed in as {session.user?.email}. Head to your dashboard to continue.</p>
          <Link className="btn" href="/dashboard">
            Open dashboard
          </Link>
        </>
      ) : (
        <>
          <p>Authenticate to access the dashboard and persist your work.</p>
          <div className="actions">
            <Link className="btn" href="/login">
              Log in
            </Link>
            <span className="muted small">Use admin@example.com / password for the default admin bypass.</span>
          </div>
        </>
      )}
    </section>
  );
}
