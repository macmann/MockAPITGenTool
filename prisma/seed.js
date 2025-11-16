import { PrismaClient } from '@prisma/client'
import { DEFAULT_PROJECT_NAME, DEMO_USER_EMAIL, DEMO_USER_NAME } from '../lib/demo-constants.js'

const prisma = new PrismaClient()

async function main() {
  const demoEmail = DEMO_USER_EMAIL
  const demoName = DEMO_USER_NAME
  const defaultProjectName = DEFAULT_PROJECT_NAME

  const user = await prisma.user.upsert({
    where: { email: demoEmail },
    update: { name: demoName },
    create: {
      email: demoEmail,
      name: demoName,
      projects: {
        create: {
          name: defaultProjectName,
          description: 'Starter project for development',
        },
      },
    },
  })

  const existingProject = await prisma.project.findFirst({
    where: { userId: user.id, name: defaultProjectName },
  })

  if (!existingProject) {
    await prisma.project.create({
      data: {
        name: defaultProjectName,
        description: 'Starter project for development',
        userId: user.id,
      },
    })
  }
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error('Seed failed:', e)
    await prisma.$disconnect()
    process.exit(1)
  })
