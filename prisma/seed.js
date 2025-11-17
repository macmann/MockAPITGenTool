import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

import { ensureDefaultProjectForUser } from '../lib/user-context.js'

const prisma = new PrismaClient()

async function main() {
  const adminEmail = (process.env.ADMIN_DEFAULT_EMAIL || 'admin@example.com').toLowerCase()
  const adminPassword = process.env.ADMIN_DEFAULT_PASSWORD || 'password'

  const passwordHash = await bcrypt.hash(adminPassword, 10)

  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { name: 'Admin User', passwordHash },
    create: {
      email: adminEmail,
      name: 'Admin User',
      passwordHash,
    },
  })

  await ensureDefaultProjectForUser(adminUser.id, prisma)
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
