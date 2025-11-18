import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';

import { authOptions } from '../../lib/auth.js';
import prisma from '../../lib/prisma.js';
import { ensureDefaultProjectForUser } from '../../lib/user-context.js';
import LegacyDashboardShell from '../../components/legacy/LegacyDashboardShell.jsx';
import './legacy-dashboard.css';

function serializeRoute(route) {
  return {
    id: route.id,
    userId: route.userId,
    projectId: route.projectId,
    name: route.name,
    description: route.description,
    method: route.method,
    path: route.path,
    enabled: route.enabled,
    matchHeaders: route.matchHeaders || {},
    responseStatus: route.responseStatus,
    responseHeaders: route.responseHeaders || {},
    responseBody: route.responseBody,
    responseIsJson: route.responseIsJson,
    responseDelayMs: route.responseDelayMs,
    templateEnabled: route.templateEnabled,
    createdAt: route.createdAt,
    updatedAt: route.updatedAt,
    vars: (route.vars || []).map((variable) => ({
      id: variable.id,
      key: variable.key,
      value: variable.value,
      createdAt: variable.createdAt,
      updatedAt: variable.updatedAt
    }))
  };
}

function serializeServer(server) {
  return {
    id: server.id,
    userId: server.userId,
    projectId: server.projectId,
    name: server.name,
    slug: server.slug,
    description: server.description,
    baseUrl: server.baseUrl,
    isEnabled: server.isEnabled,
    createdAt: server.createdAt,
    updatedAt: server.updatedAt,
    mcpPath: `/mcp/${server.slug}`
  };
}

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

  const [routes, mcpServers] = await Promise.all([
    prisma.mockRoute.findMany({
      where: { userId, projectId: activeProjectId },
      include: { vars: true },
      orderBy: { updatedAt: 'desc' }
    }),
    prisma.mcpServer.findMany({
      where: { userId, projectId: activeProjectId },
      orderBy: { updatedAt: 'desc' }
    })
  ]);

  return (
    <LegacyDashboardShell
      session={session}
      projects={projects}
      activeProjectId={activeProjectId}
      routes={routes.map(serializeRoute)}
      mcpServers={mcpServers.map(serializeServer)}
    />
  );
}
