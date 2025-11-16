import prisma from './prisma.js';

export const DEFAULT_PROJECT_NAME = 'My First Project';

export async function ensureDefaultProjectForUser(userId, client = prisma) {
  const numericUserId = Number(userId);
  if (!numericUserId) {
    throw new Error('A valid userId is required to resolve projects');
  }

  const user = await client.user.findUnique({ where: { id: numericUserId } });
  if (!user) {
    throw new Error('User not found');
  }

  let project = await client.project.findFirst({ where: { userId: numericUserId }, orderBy: { createdAt: 'asc' } });

  if (!project) {
    project = await client.project.create({
      data: {
        userId: numericUserId,
        name: DEFAULT_PROJECT_NAME,
        description: 'Starter project for your MCP tools'
      }
    });
  }

  return { user, project };
}

export async function findProjectForUser(userId, projectId, client = prisma) {
  const numericUserId = Number(userId);
  const numericProjectId = Number(projectId);
  if (!numericUserId || !numericProjectId) return null;

  return client.project.findFirst({ where: { id: numericProjectId, userId: numericUserId } });
}

export default {
  DEFAULT_PROJECT_NAME,
  ensureDefaultProjectForUser,
  findProjectForUser
};
