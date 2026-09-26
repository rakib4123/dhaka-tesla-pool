import { Link, NavLink, Outlet } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { Button } from './Button';

const PASSENGER_LINKS = [
  { to: '/ride', label: 'Ride' },
  { to: '/history', label: 'History' },
];
const DRIVER_LINKS = [
  { to: '/driver', label: 'Drive' },
  { to: '/driver/history', label: 'History' },
];

export function Layout() {
  const { me, logout } = useAuth();
  const links = me ? (me.role === 'DRIVER' ? DRIVER_LINKS : PASSENGER_LINKS) : [];

  return (
    <div className="min-h-screen">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="font-semibold text-stone-900">
            🛺 Dhaka Tesla Pool
          </Link>
          {me && (
            <nav className="flex gap-1">
              {links.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end
                  className={({ isActive }) =>
                    `rounded-md px-3 py-1.5 text-sm ${isActive ? 'bg-red-50 font-medium text-red-800' : 'text-stone-600 hover:bg-stone-100'}`
                  }
                >
                  {link.label}
                </NavLink>
              ))}
            </nav>
          )}
          {me && (
            <div className="flex items-center gap-3 text-sm text-stone-600">
              <span>Signed in as {me.name}</span>
              <Button variant="secondary" onClick={() => logout()}>
                Sign out
              </Button>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
