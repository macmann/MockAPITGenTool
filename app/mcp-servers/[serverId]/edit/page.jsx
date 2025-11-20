import Link from 'next/link';
import { notFound } from 'next/navigation';

import AppShell from '../../../../components/dashboard/AppShell.jsx';
import McpServerForm from '../../../../components/mcp/McpServerForm.jsx';
import { getDashboardContext } from '../../../../lib/dashboard-context.js';
import prisma from '../../../../lib/prisma.js';

function withProjectHref(base, projectId) {
  if (!projectId) return base;
  const url = new URL(base, 'https://placeholder.local');
  url.searchParams.set('projectId', projectId);
  return `${url.pathname}${url.search ? url.search : ''}`;
}

export default async function EditMcpServerPage({ params, searchParams }) {
  const serverId = Number(params?.serverId);
  if (!serverId) {
    notFound();
  }

  const { session, userId, projects, activeProjectId } = await getDashboardContext(searchParams);
  const server = await prisma.mcpServer.findFirst({ where: { id: serverId, userId } });
  if (!server) {
    notFound();
  }

  const projectId = server.projectId || activeProjectId;
  const backHref = withProjectHref(`/mcp-servers/${server.id}`, projectId);
  const serverData = JSON.parse(JSON.stringify(server));

  return (
    <AppShell session={session} projects={projects} activeProjectId={projectId}>
      <section className="section-card">
        <header>
          <div>
            <h2>Edit MCP server</h2>
            <p>Adjust metadata and connectivity for {server.name}.</p>
          </div>
          <Link className="btn secondary" href={backHref}>
            Cancel
          </Link>
        </header>
        <McpServerForm projectId={projectId} initialServer={serverData} />
      </section>
    </AppShell>
  );
}
