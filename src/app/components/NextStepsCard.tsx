'use client';

import { useEffect, useState } from 'react';

type NextStepsResponse = {
  trip: { id: string; title: string; startDate: string; endDate: string };
  status: 'before' | 'during' | 'after';
  currentLocation: { id: string; name: string; coordinates: [number, number]; date: string | Date; endDate?: string | Date; duration?: number } | null;
  nextRoute: { id: string; type: string; from: string; to: string; departureTime?: string; arrivalTime?: string } | null;
  nextLocation: { id: string; name: string; coordinates: [number, number]; date: string | Date; endDate?: string | Date; duration?: number } | null;
  enrichments: {
    weather?: {
      summary?: { averageTemp?: number | null; averageTempC?: number | null; predominantCondition?: string };
    } | null;
    wikipedia?: { title?: string; extract?: string } | null;
  };
};

function formatDate(input?: string | Date | null): string | null {
  if (!input) return null;
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString();
}

export default function NextStepsCard({ tripId }: { tripId: string }) {
  const [data, setData] = useState<NextStepsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/travel-data/${tripId}/next-steps`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`Failed to load next steps (${res.status})`);
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [tripId]);

  if (loading) return <div className="p-4 rounded-md border bg-white dark:bg-gray-800">Loading next steps…</div>;
  if (error) return <div className="p-4 rounded-md border bg-red-50 text-red-700">{error}</div>;
  if (!data) return null;

  const current = data.currentLocation;
  const nextRoute = data.nextRoute;
  const nextLocation = data.nextLocation;

  return (
    <div className="p-4 rounded-md border bg-white dark:bg-gray-800 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Next steps</h3>
        <span className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700">{data.status}</span>
      </div>

      {current ? (
        <div>
          <div className="text-sm text-gray-600 dark:text-gray-300">You are currently in</div>
          <div className="text-base font-medium">{current.name}</div>
          {data.enrichments?.weather?.summary && (
            <div className="text-sm text-gray-700 dark:text-gray-200">
              Weather: {data.enrichments.weather.summary?.predominantCondition || '—'} · avg {data.enrichments.weather.summary?.averageTempC != null ? Math.round(data.enrichments.weather.summary.averageTempC) : '—'}°C
            </div>
          )}
          {data.enrichments?.wikipedia?.title && (
            <div className="text-sm text-gray-700 dark:text-gray-200 mt-1">
              {data.enrichments.wikipedia.extract}
            </div>
          )}
        </div>
      ) : (
        <div>
          <div className="text-sm text-gray-600 dark:text-gray-300">Trip hasn’t started yet</div>
        </div>
      )}

      {(nextRoute || nextLocation) && (
        <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
          <div className="text-sm text-gray-600 dark:text-gray-300">Up next</div>
          {nextRoute && (
            <div className="text-sm">
              Travel to {nextRoute.to} by {nextRoute.type}
              {nextRoute.departureTime ? ` on ${formatDate(nextRoute.departureTime)}` : ''}
            </div>
          )}
          {!nextRoute && nextLocation && (
            <div className="text-sm">
              Next location: {nextLocation.name}
              {nextLocation.date ? ` on ${formatDate(nextLocation.date)}` : ''}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


