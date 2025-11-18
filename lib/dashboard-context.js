import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';

import { authOptions } from './auth.js';
import prisma from './prisma.js';
import { ensureDefaultProjectForUser } from './user-context.js';

export async function getDashboardContext(searchParams = {}) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  const userId = Number(session.user?.id);
  if (!userId) {
    redirect('/login');
  }

  const { project: defaultProject } = await ensureDefaultProjectForUser(userId);
  const projects = await prisma.project.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });

  const requestedProjectId = Number(searchParams?.projectId);
  const activeProject =
    projects.find((project) => project.id === requestedProjectId) || defaultProject;

  return {
    session,
    userId,
    projects,
    activeProject,
    activeProjectId: activeProject?.id,
  };
}

export default { getDashboardContext };
