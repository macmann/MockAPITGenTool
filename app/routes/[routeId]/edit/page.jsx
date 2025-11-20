import Link from 'next/link';
import { notFound } from 'next/navigation';

import AppShell from '../../../../components/dashboard/AppShell.jsx';
import RouteForm from '../../../../components/routes/RouteForm.jsx';
import { getDashboardContext } from '../../../../lib/dashboard-context.js';
import prisma from '../../../../lib/prisma.js';

function withProjectHref(base, projectId) {
  if (!projectId) return base;
  const url = new URL(base, 'https://placeholder.local');
  url.searchParams.set('projectId', projectId);
  return `${url.pathname}${url.search ? url.search : ''}`;
}

export default async function EditRoutePage({ params, searchParams }) {
  const routeId = Number(params?.routeId);
  if (!routeId) {
    notFound();
  }

  const { session, userId, projects, activeProjectId } = await getDashboardContext(searchParams);
  const route = await prisma.mockRoute.findFirst({ where: { id: routeId, userId } });
  if (!route) {
    notFound();
  }

  const projectId = route.projectId || activeProjectId;
  const backHref = withProjectHref(`/routes/${route.id}`, projectId);
  const routeData = JSON.parse(JSON.stringify(route));

  return (
    <AppShell session={session} projects={projects} activeProjectId={projectId}>
      <section className="section-card">
        <header>
          <div>
            <h2>Edit route</h2>
            <p>Update the mock response for {route.name || route.path}.</p>
          </div>
          <Link className="btn secondary" href={backHref}>
            Cancel
          </Link>
        </header>
        <RouteForm projectId={projectId} initialRoute={routeData} />
      </section>
    </AppShell>
  );
}
