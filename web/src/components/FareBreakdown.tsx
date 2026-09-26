import type { FareBreakdown as Fare } from '../api/types';
import { formatTaka } from '../lib/format';

export function FareBreakdown({ fare, distanceKm }: { fare: Fare; distanceKm: number }) {
  const rows = [
    { label: 'Base fare', value: formatTaka(fare.basePaisa) },
    { label: `Distance (${distanceKm} km)`, value: formatTaka(fare.distancePaisa) },
    ...(fare.discountPaisa > 0 ? [{ label: 'Pool discount', value: formatTaka(-fare.discountPaisa) }] : []),
  ];
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
      {rows.map((row) => (
        <div key={row.label} className="contents">
          <dt className="text-stone-600">{row.label}</dt>
          <dd className="text-right tabular-nums">{row.value}</dd>
        </div>
      ))}
      <dt className="border-t border-stone-200 pt-1 font-medium">Total</dt>
      <dd className="border-t border-stone-200 pt-1 text-right font-semibold tabular-nums">{formatTaka(fare.totalPaisa)}</dd>
    </dl>
  );
}
