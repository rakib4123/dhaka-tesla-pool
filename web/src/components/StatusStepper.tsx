import type { RideStatus } from '../api/types';
import { RIDE_STEPS } from '../lib/status';

export function StatusStepper({ status }: { status: RideStatus }) {
  if (status === 'CANCELLED') return <p className="text-sm text-stone-500">This ride was cancelled.</p>;
  const current = RIDE_STEPS.findIndex((step) => step.status === status);
  return (
    <ol aria-label="Ride progress" className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
      {RIDE_STEPS.map((step, index) => (
        <li
          key={step.status}
          aria-current={index === current ? 'step' : undefined}
          className={index <= current ? 'font-medium text-red-700' : 'text-stone-400'}
        >
          {index > 0 && <span aria-hidden="true" className="mr-3 text-stone-300">→</span>}
          {step.label}
        </li>
      ))}
    </ol>
  );
}
