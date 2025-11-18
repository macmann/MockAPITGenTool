import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';

import { authOptions } from '../../lib/auth.js';
import prisma from '../../lib/prisma.js';
import { ensureDefaultProjectForUser } from '../../lib/user-context.js';
import LegacyDashboardShell from '../../components/legacy/LegacyDashboardShell.jsx';
import './legacy-dashboard.css';

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
    <LegacyDashboardShell
      session={session}
      projects={projects}
      activeProjectId={activeProjectId}
      apiConnections={apiConnections}
      specs={specs}
      toolMappings={toolMappings}
    />
  );
}
