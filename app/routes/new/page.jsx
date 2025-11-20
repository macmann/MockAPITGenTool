import AppShell from '../../../components/dashboard/AppShell.jsx';
import { getDashboardContext } from '../../../lib/dashboard-context.js';
import RouteForm from '../../../components/routes/RouteForm.jsx';

export default async function NewRoutePage({ searchParams }) {
  const { session, projects, activeProjectId } = await getDashboardContext(searchParams);

  return (
    <AppShell session={session} projects={projects} activeProjectId={activeProjectId}>
      <section className="section-card">
        <header>
          <h2>Create route</h2>
          <p>Build a predictable mock endpoint for the active project.</p>
        </header>
        <RouteForm projectId={activeProjectId} />
      </section>
    </AppShell>
  );
}
