import prisma from './prisma.js';
import { DEFAULT_PROJECT_NAME, DEMO_USER_EMAIL, DEMO_USER_NAME } from './demo-constants.js';

export async function getDemoUserAndProject(client = prisma) {
  const user = await client.user.upsert({
    where: { email: DEMO_USER_EMAIL },
    update: { name: DEMO_USER_NAME },
    create: {
      email: DEMO_USER_EMAIL,
      name: DEMO_USER_NAME,
      projects: {
        create: {
          name: DEFAULT_PROJECT_NAME,
          description: 'Starter project for development'
        }
      }
    }
  });

  let project = await client.project.findFirst({
    where: { userId: user.id, name: DEFAULT_PROJECT_NAME }
  });

  if (!project) {
    project = await client.project.create({
      data: {
        name: DEFAULT_PROJECT_NAME,
        description: 'Starter project for development',
        userId: user.id
      }
    });
  }

  return { user, project };
}

export default getDemoUserAndProject;
