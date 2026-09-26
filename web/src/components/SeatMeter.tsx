export function SeatMeter({ taken, capacity }: { taken: number; capacity: number }) {
  return (
    <div className="flex items-center gap-2">
      <span role="img" aria-label={`${taken} of ${capacity} seats taken`} className="text-lg tracking-widest text-red-700">
        {'●'.repeat(taken)}
        {'○'.repeat(Math.max(capacity - taken, 0))}
      </span>
      <span className="text-sm text-stone-600">{`${taken}/${capacity} seats`}</span>
    </div>
  );
}
