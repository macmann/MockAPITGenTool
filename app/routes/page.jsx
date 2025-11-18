import Link from 'next/link';

import prisma from '../../lib/prisma.js';
import AppShell from '../../components/dashboard/AppShell.jsx';
import { getDashboardContext } from '../../lib/dashboard-context.js';
import RouteActions from '../../components/routes/RouteActions.jsx';

function withProjectHref(base, projectId) {
  if (!projectId) return base;
  const url = new URL(base, 'https://placeholder.local');
  url.searchParams.set('projectId', projectId);
  return `${url.pathname}${url.search ? url.search : ''}`;
}

export default async function RoutesPage({ searchParams }) {
  const { session, userId, projects, activeProjectId } = await getDashboardContext(searchParams);
  const routes = await prisma.mockRoute.findMany({
    where: { userId, projectId: activeProjectId },
    orderBy: { updatedAt: 'desc' },
  });

  return (
    <AppShell session={session} projects={projects} activeProjectId={activeProjectId}>
      <section className="section-card">
        <header>
          <div>
            <h2>Routes</h2>
            <p>Every mock endpoint scoped to the active project.</p>
          </div>
          <Link className="btn" href={withProjectHref('/routes/new', activeProjectId)}>
            Create route
          </Link>
        </header>
        {routes.length === 0 ? (
          <div className="empty-state">
            <p>No routes yet.</p>
            <Link className="btn" href={withProjectHref('/routes/new', activeProjectId)}>
              Create your first route
            </Link>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Method</th>
                  <th>Path</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {routes.map((route) => (
                  <tr key={route.id}>
                    <td>{route.name || 'Untitled route'}</td>
                    <td>
                      <span className="badge">{route.method}</span>
                    </td>
                    <td>{route.path}</td>
                    <td>
                      <span className={`badge ${route.enabled ? 'success' : 'muted'}`}>
                        {route.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </td>
                    <td>
                      <RouteActions routeId={route.id} projectId={activeProjectId} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AppShell>
  );
}
