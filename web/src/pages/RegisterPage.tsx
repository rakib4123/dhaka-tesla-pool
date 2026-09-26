import { type FormEvent, useState } from 'react';
import { Link, Navigate } from 'react-router';
import { type ApiError, toApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { homePathFor } from '../auth/homePath';
import { Button, Card } from '../components/Button';
import { InlineError } from '../components/StateViews';

const inputClass = 'mt-1 block w-full rounded-md border border-stone-300 px-3 py-2';

function fieldProblems(error: ApiError | null): string[] {
  if (!error || !Array.isArray(error.details)) return [];
  return (error.details as { path: string; message: string }[]).map((d) => `${d.path}: ${d.message}`);
}

export function RegisterPage() {
  const { status, me, register } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  if (status === 'authenticated' && me) return <Navigate to={homePathFor(me.role)} replace />;

  const update = (field: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [field]: e.target.value });

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await register({
        name: form.name,
        email: form.email,
        password: form.password,
        ...(form.phone.trim() && { phone: form.phone.trim() }),
      });
    } catch (err) {
      setError(toApiError(err));
      setPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-4 px-4 py-10">
      <Card>
        <h1 className="text-xl font-semibold">Create a passenger account</h1>
        <form className="mt-4 space-y-3" onSubmit={onSubmit}>
          <div>
            <label htmlFor="reg-name" className="block text-sm font-medium">Name</label>
            <input id="reg-name" required className={inputClass} value={form.name} onChange={update('name')} />
          </div>
          <div>
            <label htmlFor="reg-email" className="block text-sm font-medium">Email</label>
            <input id="reg-email" type="email" required autoComplete="email" className={inputClass} value={form.email} onChange={update('email')} />
          </div>
          <div>
            <label htmlFor="reg-phone" className="block text-sm font-medium">Phone (optional)</label>
            <input id="reg-phone" type="tel" autoComplete="tel" className={inputClass} value={form.phone} onChange={update('phone')} />
          </div>
          <div>
            <label htmlFor="reg-password" className="block text-sm font-medium">Password</label>
            <input id="reg-password" type="password" required minLength={8} autoComplete="new-password" className={inputClass}
              value={form.password} onChange={update('password')} />
          </div>
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? 'Creating account…' : 'Create account'}
          </Button>
        </form>
        <InlineError message={error?.message ?? null} />
        {fieldProblems(error).length > 0 && (
          <ul className="mt-2 list-disc pl-5 text-sm text-red-800">
            {fieldProblems(error).map((problem) => <li key={problem}>{problem}</li>)}
          </ul>
        )}
        <p className="mt-4 text-sm text-stone-600">
          Already have an account? <Link to="/login" className="font-medium text-red-700 hover:underline">Sign in</Link>
        </p>
      </Card>
    </div>
  );
}
