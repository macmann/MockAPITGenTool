import CredentialsProvider from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import bcrypt from 'bcryptjs';
import { getServerSession } from 'next-auth';

import prisma from './prisma.js';
import { ensureDefaultProjectForUser } from './user-context.js';

const ADMIN_DEFAULT_EMAIL = (process.env.ADMIN_DEFAULT_EMAIL || 'admin@example.com').toLowerCase();
const ADMIN_DEFAULT_PASSWORD = process.env.ADMIN_DEFAULT_PASSWORD || 'password';

async function upsertUserWithPassword(email, password, name) {
  const passwordHash = await bcrypt.hash(password, 10);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (!existing.passwordHash) {
      return prisma.user.update({
        where: { id: existing.id },
        data: { passwordHash },
      });
    }
    return existing;
  }

  return prisma.user.create({
    data: {
      email,
      name,
      passwordHash,
    },
  });
}

async function authorizeWithCredentials(credentials) {
  const email = credentials?.email?.toLowerCase().trim();
  const password = credentials?.password?.trim();

  if (!email || !password) {
    return null;
  }

  if (email === ADMIN_DEFAULT_EMAIL) {
    if (password !== ADMIN_DEFAULT_PASSWORD) {
      return null;
    }
    return upsertUserWithPassword(email, password, 'Admin User');
  }

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    return upsertUserWithPassword(email, password, credentials?.name || email.split('@')[0]);
  }

  if (!user.passwordHash) {
    return null;
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    return null;
  }

  return user;
}

export const authOptions = {
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: 'database',
  },
  pages: {
    signIn: '/login',
  },
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      authorize: authorizeWithCredentials,
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id.toString();
        token.email = user.email;
      }
      return token;
    },
    async session({ session, user, token }) {
      if (session?.user) {
        session.user.id = user?.id || token?.sub || session.user.id;
        session.user.email = session.user.email || user?.email || token?.email;
      }
      return session;
    },
  },
  events: {
    async signIn({ user }) {
      if (user?.id) {
        await ensureDefaultProjectForUser(user.id).catch((err) => {
          console.error('Failed to ensure default project for user during sign-in', err);
        });
      }
    }
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export function getServerAuthSession() {
  return getServerSession(authOptions);
}
