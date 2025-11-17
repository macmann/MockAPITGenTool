import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../lib/auth.js';
import prisma from '../../lib/prisma.js';
import { ensureDefaultProjectForUser } from '../../lib/user-context.js';
import ProjectSelector from './ProjectSelector.jsx';

export default async function DashboardPage({ searchParams }) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login?callbackUrl=/dashboard');
  }

  const userId = Number(session.user?.id);
  if (!userId) {
    redirect('/login?callbackUrl=/dashboard');
  }

  const { project: defaultProject } = await ensureDefaultProjectForUser(userId);
  const projects = await prisma.project.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' }
  });

  const requestedProjectId = Number(searchParams?.projectId);
  const activeProject = projects.find((project) => project.id === requestedProjectId) || defaultProject;
  const activeProjectId = activeProject.id;

  const [apiConnections, specs, toolMappings] = await Promise.all([
    prisma.apiConnection.findMany({
      where: { userId, projectId: activeProjectId },
      orderBy: { updatedAt: 'desc' }
    }),
    prisma.openApiSpec.findMany({
      where: { userId, projectId: activeProjectId },
      orderBy: { updatedAt: 'desc' }
    }),
    prisma.toolMapping.findMany({
      where: { userId, projectId: activeProjectId },
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

      <div className="grid">
        <div className="panel muted">
          <h2>My Projects ({projects.length})</h2>
          <p className="small muted">
            Projects are unique to your account. Switching projects will scope every API call, spec, and mapping to the selected
            ID.
          </p>
          <ProjectSelector projects={projects} activeProjectId={activeProjectId} />
        </div>
        <div className="panel muted">
          <h2>API connections ({apiConnections.length})</h2>
          <p className="small muted">Scoped to user #{userId} and project #{activeProjectId}.</p>
          <ul>
            {apiConnections.map((conn) => (
              <li key={conn.id}>
                <strong>{conn.baseUrl || 'No base URL'}</strong> — auth type: {conn.authType}
              </li>
            ))}
            {apiConnections.length === 0 ? <li className="muted small">No API connections for this project.</li> : null}
          </ul>
        </div>
      </div>
      <div className="grid">
        <div className="panel muted">
          <h2>OpenAPI specs ({specs.length})</h2>
          <p className="small muted">Only specs for project #{activeProjectId} are shown.</p>
          <ul>
            {specs.map((spec) => (
              <li key={spec.id}>
                Spec #{spec.id} — format: {spec.format}
              </li>
            ))}
            {specs.length === 0 ? <li className="muted small">Upload or import a spec for this project.</li> : null}
          </ul>
        </div>
        <div className="panel muted">
          <h2>Tool mappings ({toolMappings.length})</h2>
          <p className="small muted">Every mapping is filtered by user #{userId} and project #{activeProjectId}.</p>
          <ul>
            {toolMappings.map((mapping) => (
              <li key={mapping.id}>
                {mapping.toolName} → {mapping.method} {mapping.path}
              </li>
            ))}
            {toolMappings.length === 0 ? <li className="muted small">No mappings defined yet.</li> : null}
          </ul>
        </div>
      </div>
      <Link className="btn" href="/">
        Back to home
      </Link>
    </section>
  );
}
