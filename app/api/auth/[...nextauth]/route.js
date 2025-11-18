import NextAuth from 'next-auth';
import { authOptions } from '../../../../lib/auth.js';

const nextAuthHandler = NextAuth?.default ?? NextAuth;
const handler = nextAuthHandler(authOptions);

export const dynamic = 'force-dynamic';
export { handler as GET, handler as POST };
