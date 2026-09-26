import { type FormEvent, useState } from 'react';
import { Link, Navigate } from 'react-router';
import { toApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '../auth/demoAccounts';
import { homePathFor } from '../auth/homePath';
import { Button, Card } from '../components/Button';
import { InlineError } from '../components/StateViews';

const inputClass = 'mt-1 block w-full rounded-md border border-stone-300 px-3 py-2';

export function LoginPage() {
  const { status, me, notice, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === 'authenticated' && me) return <Navigate to={homePathFor(me.role)} replace />;

  async function signIn(emailToUse: string, passwordToUse: string) {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await login(emailToUse, passwordToUse); // once signed in, the <Navigate> above takes over
    } catch (err) {
      setError(toApiError(err).message);
      setPending(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void signIn(email, password);
  }

  return (
    <div className="mx-auto max-w-md space-y-4 px-4 py-10">
      <p className="text-center text-lg font-semibold">🛺 Dhaka Tesla Pool</p>
      <p className="text-center text-sm text-stone-500">Share a seat. Split the fare. Survive Dhaka traffic.</p>
      {notice && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">{notice}</p>}

      <Card>
        <h1 className="text-xl font-semibold">Sign in</h1>
        <form className="mt-4 space-y-3" onSubmit={onSubmit}>
          <div>
            <label htmlFor="login-email" className="block text-sm font-medium">Email</label>
            <input id="login-email" type="email" autoComplete="email" required className={inputClass}
              value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label htmlFor="login-password" className="block text-sm font-medium">Password</label>
            <input id="login-password" type="password" autoComplete="current-password" required className={inputClass}
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
        <InlineError message={error} />
        <p className="mt-4 text-sm text-stone-600">
          New passenger? <Link to="/register" className="font-medium text-red-700 hover:underline">Create an account</Link>
        </p>
      </Card>

      <Card>
        <h2 className="font-medium">Try the story cast</h2>
        <p className="text-sm text-stone-500">Demo accounts, password <code>{DEMO_PASSWORD}</code>.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {DEMO_ACCOUNTS.map((account) => (
            <Button key={account.email} variant="secondary" disabled={pending} aria-label={`Sign in as ${account.name}`}
              className="text-left" onClick={() => void signIn(account.email, DEMO_PASSWORD)}>
              <span className="block font-medium">{account.name}</span>
              <span className="block text-xs font-normal text-stone-500">{account.blurb}</span>
            </Button>
          ))}
        </div>
      </Card>
    </div>
  );
}
