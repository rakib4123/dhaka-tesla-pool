import type { RideEvent } from '../api/types';
import { describeEvent } from '../lib/events';
import { formatTime } from '../lib/format';

export function EventTimeline({ events }: { events: RideEvent[] }) {
  return (
    <ol className="space-y-1 border-l-2 border-stone-200 pl-4 text-sm">
      {events.map((event, index) => (
        <li key={`${event.createdAt}-${index}`} className="flex gap-3">
          <time dateTime={event.createdAt} className="w-12 shrink-0 tabular-nums text-stone-500">
            {formatTime(event.createdAt)}
          </time>
          <span>{describeEvent(event)}</span>
        </li>
      ))}
    </ol>
  );
}
