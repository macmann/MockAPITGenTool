import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';

import LoginForm from '../../../components/LoginForm';
import AuthButtons from '../../../components/AuthButtons';
import { authOptions } from '../../../lib/auth.js';

export default async function LoginPage() {
  const session = await getServerSession(authOptions);

  if (session) {
    redirect('/dashboard');
  }

  return (
    <div className="shell">
      <header className="header">
        <Link className="brand" href="/">
          MindBridge X
        </Link>
        <AuthButtons />
      </header>
      <div className="main">
        <div className="split">
          <LoginForm />
          <aside className="panel info">
            <h3>Why credentials?</h3>
            <p>
              This demo uses a simple email + password provider backed by Prisma so that each user has isolated data. The
              default admin bypass (<code>admin@example.com</code> / <code>password</code>) seeds a privileged account without
              extra setup.
            </p>
            <p>
              Sessions include the user id and email, making it easy to authorize requests server-side or in API routes with
              <code>getServerSession</code>.
            </p>
            <Link className="btn ghost" href="/">
              Return home
            </Link>
          </aside>
        </div>
      </div>
    </div>
  );
}
