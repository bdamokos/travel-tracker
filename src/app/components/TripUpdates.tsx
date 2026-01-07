import { TripUpdate } from '../types';
import { formatUtcDate } from '../lib/dateUtils';

const MAX_UPDATES = 10;
const MAX_DAYS = 30;

type TripUpdatesProps = {
  updates?: TripUpdate[];
  className?: string;
};

const isRecentUpdate = (update: TripUpdate, now: Date) => {
  const createdAt = update.createdAt instanceof Date ? update.createdAt : new Date(update.createdAt);
  if (Number.isNaN(createdAt.getTime())) return false;
  const diffMs = now.getTime() - createdAt.getTime();
  return diffMs <= MAX_DAYS * 24 * 60 * 60 * 1000;
};

const getSortedUpdates = (updates: TripUpdate[]): TripUpdate[] =>
  [...updates].sort((a, b) => {
    const aDate = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
    const bDate = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
    return bDate.getTime() - aDate.getTime();
  });

export default function TripUpdates({ updates = [], className = '' }: TripUpdatesProps) {
  const now = new Date();
  const visibleUpdates = getSortedUpdates(updates)
    .filter(update => isRecentUpdate(update, now))
    .slice(0, MAX_UPDATES);

  if (visibleUpdates.length === 0) {
    return null;
  }

  return (
    <section className={`bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 ${className}`}>
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Latest updates</h2>
      <ul className="space-y-3">
        {visibleUpdates.map(update => (
          <li key={update.id} className="flex flex-wrap items-start gap-2 text-sm text-gray-700 dark:text-gray-200">
            <span className="font-semibold text-gray-900 dark:text-gray-100">
              {formatUtcDate(update.createdAt)}
            </span>
            <span className="text-gray-500 dark:text-gray-400">•</span>
            <span>{update.message}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
