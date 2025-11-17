import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';

import RegisterForm from '../../../components/RegisterForm.jsx';
import { authOptions } from '../../../lib/auth.js';

export default async function RegisterPage() {
  const session = await getServerSession(authOptions);

  if (session) {
    redirect('/dashboard');
  }

  return (
    <div className="split">
      <RegisterForm />
      <aside className="panel info">
        <h3>New here?</h3>
        <p>Create an account to explore API projects, connections, and tool mappings tailored to your workspace.</p>
        <p>
          Already have credentials? <Link href="/login">Sign in instead</Link> or head back to the home page to learn more about the MCP
          tooling demo.
        </p>
        <Link className="btn ghost" href="/">
          Return home
        </Link>
      </aside>
    </div>
  );
}
