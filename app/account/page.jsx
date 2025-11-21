import AppShell from '../../components/dashboard/AppShell.jsx';
import ChangePasswordForm from '../../components/account/ChangePasswordForm.jsx';
import { getDashboardContext } from '../../lib/dashboard-context.js';

export default async function AccountPage({ searchParams }) {
  const { session, projects, activeProjectId } = await getDashboardContext(searchParams);

  return (
    <AppShell session={session} projects={projects} activeProjectId={activeProjectId}>
      <section className="section-card">
        <header>
          <h2>Account security</h2>
          <p>Manage your login credentials and keep your workspace secure.</p>
        </header>
        <ChangePasswordForm />
      </section>
    </AppShell>
  );
}
