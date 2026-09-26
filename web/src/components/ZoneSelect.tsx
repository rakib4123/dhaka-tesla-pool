import type { Zone } from '../api/types';

export function ZoneSelect({ id, label, zones, value, onChange, disabled }: {
  id: string;
  label: string;
  zones: Zone[];
  value: number | '';
  onChange: (zoneId: number | '') => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">{label}</label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value === '' ? '' : Number(event.target.value))}
        className="mt-1 block w-full rounded-md border border-stone-300 bg-white px-3 py-2"
      >
        <option value="">Choose a zone</option>
        {zones.map((zone) => (
          <option key={zone.id} value={zone.id}>{zone.name}</option>
        ))}
      </select>
    </div>
  );
}
