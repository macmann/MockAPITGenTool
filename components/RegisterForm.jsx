'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';

export default function RegisterForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, confirmPassword }),
      });

      const payload = await response.json();
      if (!response.ok) {
        setError(payload?.error || 'Unable to register.');
        setLoading(false);
        return;
      }

      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
        callbackUrl: '/dashboard',
      });

      if (result?.error) {
        setError('Account created, but automatic sign-in failed. Please log in manually.');
        setLoading(false);
        return;
      }

      router.push('/dashboard');
    } catch (err) {
      console.error('Failed to register', err);
      setError('Unexpected error while registering.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="panel" onSubmit={handleSubmit}>
      <h2>Create account</h2>
      <p className="muted">Register with your email address to start managing MCP connections.</p>
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
          minLength={8}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="••••••••"
          autoComplete="new-password"
        />
      </label>
      <label className="field">
        <span>Confirm password</span>
        <input
          required
          type="password"
          value={confirmPassword}
          minLength={8}
          onChange={(event) => setConfirmPassword(event.target.value)}
          placeholder="••••••••"
          autoComplete="new-password"
        />
      </label>
      <button className="btn" type="submit" disabled={loading}>
        {loading ? 'Creating account…' : 'Register'}
      </button>
      <p className="muted small">
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </form>
  );
}
