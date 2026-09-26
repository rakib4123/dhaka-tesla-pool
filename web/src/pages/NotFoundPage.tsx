import { Link } from 'react-router';
import { EmptyState } from '../components/StateViews';

export function NotFoundPage() {
  return (
    <div className="space-y-3">
      <EmptyState title="Page not found" hint="That address doesn't exist in Dhaka Tesla Pool." />
      <p className="text-center text-sm">
        <Link to="/" className="font-medium text-red-700 hover:underline">Go home</Link>
      </p>
    </div>
  );
}
