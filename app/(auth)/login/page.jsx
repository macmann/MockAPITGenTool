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
    <div className="auth-shell">
      <header className="auth-header">
        <div className="brand-mark">
          <div className="brand-icon">MB</div>
          <div>
            <Link className="brand" href="/">
              MindBridgeX
            </Link>
          </div>
        </div>
        <AuthButtons />
      </header>

      <div className="auth-hero">
        <div className="auth-hero__glow" />
        <div className="auth-grid">
          <section className="auth-copy">
            <p className="eyebrow">Secure access to the MindBridgeX control center</p>
            <h1>Sign in with confidence</h1>
            <p className="lead">
              Keep your work flowing with a refined sign-in experience built for security-focused teams. Encryption in transit
              and role-aware sessions keep your workspace safe.
            </p>

            <div className="stats">
              <div className="stat-card">
                <div className="stat-value">99.99%</div>
                <div className="stat-label">Uptime safeguarded</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">S/SO</div>
                <div className="stat-label">SOC2-ready controls</div>
              </div>
            </div>

            <div className="logo-row" aria-label="Trusted partners">
              <span className="logo-chip">Aurora Labs</span>
              <span className="logo-chip">Northwind</span>
              <span className="logo-chip">Acme Robotics</span>
              <span className="logo-chip">MindBridgeX</span>
            </div>
          </section>

          <LoginForm />
        </div>
      </div>
    </div>
  );
}
