import AppShell from '../../../components/dashboard/AppShell.jsx';
import { getDashboardContext } from '../../../lib/dashboard-context.js';
import CreateMcpServerForm from '../../../components/mcp/CreateMcpServerForm.jsx';

export default async function NewMcpServerPage({ searchParams }) {
  const { session, projects, activeProjectId } = await getDashboardContext(searchParams);

  return (
    <AppShell session={session} projects={projects} activeProjectId={activeProjectId}>
      <section className="section-card">
        <header>
          <h2>Create MCP server</h2>
          <p>Register a server so MCP tools know where to connect.</p>
        </header>
        <CreateMcpServerForm projectId={activeProjectId} />
      </section>
    </AppShell>
  );
}
