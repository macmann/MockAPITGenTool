import Link from 'next/link';

import prisma from '../../lib/prisma.js';
import AppShell from '../../components/dashboard/AppShell.jsx';
import { getDashboardContext } from '../../lib/dashboard-context.js';
import McpServerActions from '../../components/mcp/McpServerActions.jsx';

function withProjectHref(base, projectId) {
  if (!projectId) return base;
  const url = new URL(base, 'https://placeholder.local');
  url.searchParams.set('projectId', projectId);
  return `${url.pathname}${url.search ? url.search : ''}`;
}

export default async function McpServersPage({ searchParams }) {
  const { session, userId, projects, activeProjectId } = await getDashboardContext(searchParams);
  const servers = await prisma.mcpServer.findMany({
    where: { userId, projectId: activeProjectId },
    orderBy: { updatedAt: 'desc' },
  });

  return (
    <AppShell session={session} projects={projects} activeProjectId={activeProjectId}>
      <section className="section-card">
        <header>
          <div>
            <h2>MCP servers</h2>
            <p>Connections that expose MCP tools for this project.</p>
          </div>
          <Link className="btn" href={withProjectHref('/mcp-servers/new', activeProjectId)}>
            Create MCP server
          </Link>
        </header>
        {servers.length === 0 ? (
          <div className="empty-state">
            <p>No MCP servers yet.</p>
            <Link className="btn" href={withProjectHref('/mcp-servers/new', activeProjectId)}>
              Create your first MCP server
            </Link>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Slug</th>
                  <th>MCP URL</th>
                  <th>Base URL</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {servers.map((server) => (
                  <tr key={server.id}>
                    <td>{server.name}</td>
                    <td>
                      <span className="badge">{server.slug}</span>
                    </td>
                    <td>/mcp/{server.slug}</td>
                    <td>{server.baseUrl || '—'}</td>
                    <td>
                      <span className={`badge ${server.isEnabled ? 'success' : 'muted'}`}>
                        {server.isEnabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </td>
                    <td>
                      <McpServerActions serverId={server.id} />
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
