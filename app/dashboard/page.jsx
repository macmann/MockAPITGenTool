import Link from 'next/link';

import prisma from '../../lib/prisma.js';
import { getDashboardContext } from '../../lib/dashboard-context.js';
import AppShell from '../../components/dashboard/AppShell.jsx';
import ProjectApiKeyCard from '../../components/dashboard/ProjectApiKeyCard.jsx';

function withProjectHref(base, projectId) {
  if (!projectId) return base;
  const url = new URL(base, 'https://placeholder.local');
  url.searchParams.set('projectId', projectId);
  return `${url.pathname}${url.search ? url.search : ''}`;
}

export default async function DashboardPage({ searchParams }) {
  const { session, userId, projects, activeProject, activeProjectId } = await getDashboardContext(searchParams);
  const projectId = activeProjectId;

  const [routesCount, mcpCount, recentRoutes, recentServers] = await Promise.all([
    prisma.mockRoute.count({ where: { userId, projectId } }),
    prisma.mcpServer.count({ where: { userId, projectId } }),
    prisma.mockRoute.findMany({
      where: { userId, projectId },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    }),
    prisma.mcpServer.findMany({
      where: { userId, projectId },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    }),
  ]);

  return (
    <AppShell session={session} projects={projects} activeProjectId={projectId}>
      <section className="section-card">
        <header>
          <p className="label">Current project</p>
          <h2>{activeProject?.name}</h2>
          <p>{activeProject?.description || 'A dedicated workspace for your MCP-ready mock APIs.'}</p>
          <ProjectApiKeyCard apiKey={activeProject?.apiKey} />
        </header>
        <div className="card-grid">
          <div className="stat-card">
            <span className="label">Routes</span>
            <span className="value">{routesCount}</span>
            <p className="helper-text">Number of mock API routes scoped to this project.</p>
            <div className="actions">
              <Link className="btn" href={withProjectHref('/routes', projectId)}>
                View all routes
              </Link>
              <Link className="btn ghost" href={withProjectHref('/routes/new', projectId)}>
                Create a route
              </Link>
            </div>
          </div>
          <div className="stat-card">
            <span className="label">MCP Servers</span>
            <span className="value">{mcpCount}</span>
            <p className="helper-text">Ready-to-share MCP HTTP servers for the project.</p>
            <div className="actions">
              <Link className="btn" href={withProjectHref('/mcp-servers', projectId)}>
                View all MCP servers
              </Link>
              <Link className="btn ghost" href={withProjectHref('/mcp-servers/new', projectId)}>
                Create MCP server
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="section-card">
        <header>
          <h3>Recent routes</h3>
          <p>The five most recently updated mock routes.</p>
        </header>
        {recentRoutes.length === 0 ? (
          <div className="empty-state">No routes yet. Use “Create a route” to add your first endpoint.</div>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Method</th>
                  <th>Path</th>
                  <th>Status</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {recentRoutes.map((route) => (
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
                    <td>{new Date(route.updatedAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="section-card">
        <header>
          <h3>Recent MCP servers</h3>
          <p>Quick view of the endpoints your MCP tools can call.</p>
        </header>
        {recentServers.length === 0 ? (
          <div className="empty-state">No MCP servers yet. Create one to expose MCP tools.</div>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Slug</th>
                  <th>Base URL</th>
                  <th>Status</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {recentServers.map((server) => (
                  <tr key={server.id}>
                    <td>{server.name}</td>
                    <td>
                      <span className="badge">{server.slug}</span>
                    </td>
                    <td>{server.baseUrl || '—'}</td>
                    <td>
                      <span className={`badge ${server.isEnabled ? 'success' : 'muted'}`}>
                        {server.isEnabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </td>
                    <td>{new Date(server.updatedAt).toLocaleString()}</td>
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
