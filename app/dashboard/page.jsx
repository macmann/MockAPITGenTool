import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../lib/auth.js';
import prisma from '../../lib/prisma.js';
import { ensureDefaultProjectForUser } from '../../lib/user-context.js';

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login?callbackUrl=/dashboard');
  }

  const userId = Number(session.user?.id);
  if (!userId) {
    redirect('/login?callbackUrl=/dashboard');
  }

  const { project: defaultProject } = await ensureDefaultProjectForUser(userId);

  const [projects, apiConnections, specs, toolMappings] = await Promise.all([
    prisma.project.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.apiConnection.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' }
    }),
    prisma.openApiSpec.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' }
    }),
    prisma.toolMapping.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' }
    })
  ]);

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
      <div className="stat">
        <div className="label">Default project</div>
        <div className="value">{defaultProject.name}</div>
      </div>
      <div className="grid">
        <div className="panel muted">
          <h2>Projects ({projects.length})</h2>
          <p className="small muted">Only projects you own are shown.</p>
          <ul>
            {projects.map((project) => (
              <li key={project.id}>
                <strong>{project.name}</strong>
                {project.description ? <span className="muted"> — {project.description}</span> : null}
              </li>
            ))}
          </ul>
        </div>
        <div className="panel muted">
          <h2>API connections ({apiConnections.length})</h2>
          <p className="small muted">Scoped to your user account.</p>
          <ul>
            {apiConnections.map((conn) => (
              <li key={conn.id}>
                <strong>{conn.baseUrl || 'No base URL'}</strong> — auth type: {conn.authType}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="grid">
        <div className="panel muted">
          <h2>OpenAPI specs ({specs.length})</h2>
          <ul>
            {specs.map((spec) => (
              <li key={spec.id}>
                Spec #{spec.id} — format: {spec.format}
              </li>
            ))}
          </ul>
        </div>
        <div className="panel muted">
          <h2>Tool mappings ({toolMappings.length})</h2>
          <ul>
            {toolMappings.map((mapping) => (
              <li key={mapping.id}>
                {mapping.toolName} → {mapping.method} {mapping.path}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <Link className="btn" href="/">
        Back to home
      </Link>
    </section>
  );
}
