'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard';

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
      callbackUrl,
    });

    setLoading(false);

    if (result?.error) {
      setError('Invalid email or password.');
      return;
    }

    router.push(callbackUrl);
  }

  return (
    <form className="panel" onSubmit={handleSubmit}>
      <h2>Sign in</h2>
      <p className="muted">Use email + password or the default admin bypass.</p>
      {error ? <p className="error">{error}</p> : null}
      <label className="field">
        <span>Email</span>
        <input
          required
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
        />
      </label>
      <label className="field">
        <span>Password</span>
        <input
          required
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="••••••••"
          autoComplete="current-password"
        />
      </label>
      <button className="btn" type="submit" disabled={loading}>
        {loading ? 'Signing in…' : 'Continue'}
      </button>
      <p className="muted small">
        Default admin: <code>admin@example.com</code> / <code>password</code>
      </p>
    </form>
  );
}
