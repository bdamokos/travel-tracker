'use client';

import { useEffect, useMemo, useState } from 'react';
import { TripUpdate } from '../types';
import { formatUtcDate } from '../lib/dateUtils';
import { getCurrentTripStatus } from '../lib/currentTripStatus';

const MAX_UPDATES = 10;
const MAX_DAYS = 30;
const COOKIE_NAME = 'tt_updates_seen';

type LocationTiming = {
  name: string;
  date: string | Date;
  endDate?: string | Date;
  notes?: string;
};

type RouteTiming = {
  from: string;
  to: string;
  date?: string | Date;
  departureTime?: string | Date;
  arrivalTime?: string | Date;
};

type TripUpdatesProps = {
  updates?: TripUpdate[];
  className?: string;
  currentStatus?: string | null;
  locations?: LocationTiming[];
  routes?: RouteTiming[];
};

const getUpdateDate = (update: TripUpdate): Date | null => {
  const date = update.createdAt instanceof Date ? update.createdAt : new Date(update.createdAt);
  return Number.isNaN(date.getTime()) ? null : date;
};

const isRecentUpdate = (update: TripUpdate, now: Date) => {
  const createdAt = getUpdateDate(update);
  if (!createdAt) return false;
  const diffMs = now.getTime() - createdAt.getTime();
  return diffMs >= 0 && diffMs <= MAX_DAYS * 24 * 60 * 60 * 1000;
};

const getSortedUpdates = (updates: TripUpdate[]): TripUpdate[] =>
  [...updates].sort((a, b) => {
    const aDate = getUpdateDate(a);
    const bDate = getUpdateDate(b);

    if (!aDate) return 1;
    if (!bDate) return -1;

    return bDate.getTime() - aDate.getTime();
  });

const getCookieValue = (name: string): string | null => {
  if (typeof document === 'undefined') return null;
  const cookies = document.cookie.split(';').map(cookie => cookie.trim());
  const match = cookies.find(cookie => cookie.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : null;
};

// Validate URL to prevent XSS attacks (javascript: URLs)
const isValidHttpUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

export default function TripUpdates({ updates = [], className = '', currentStatus, locations, routes }: TripUpdatesProps) {
  const [expanded, setExpanded] = useState(false);
  const visibleUpdates = useMemo(() => {
    const now = new Date();
    return getSortedUpdates(updates)
      .filter(update => isRecentUpdate(update, now))
      .slice(0, MAX_UPDATES);
  }, [updates]);

  const latestUpdateDate = useMemo(() => {
    for (const update of getSortedUpdates(updates)) {
      const date = getUpdateDate(update);
      if (date) return date;
    }
    return null;
  }, [updates]);

  useEffect(() => {
    const cookieValue = getCookieValue(COOKIE_NAME);
    const cookieDate = cookieValue ? new Date(cookieValue) : null;
    const hasValidCookieDate = cookieDate && !Number.isNaN(cookieDate.getTime());
    const shouldExpand = Boolean(
      hasValidCookieDate && latestUpdateDate && latestUpdateDate > (cookieDate as Date)
    );
    setExpanded(shouldExpand);

    const nowString = new Date().toISOString();
    document.cookie = `${COOKIE_NAME}=${encodeURIComponent(nowString)}; path=/; max-age=31536000`;
  }, [latestUpdateDate]);

  const updateItems = useMemo(() => {
    // Calculate current status on client-side if locations and routes are provided
    const clientStatus = locations && routes
      ? getCurrentTripStatus(locations, routes, new Date())
      : currentStatus;

    if (!clientStatus) return visibleUpdates;
    return [
      {
        id: 'current-status',
        createdAt: new Date().toISOString(),
        message: clientStatus
      },
      ...visibleUpdates
    ];
  }, [currentStatus, locations, routes, visibleUpdates]);

  if (updateItems.length === 0) {
    return null;
  }

  return (
    <section className={`bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Latest updates</h2>
        <button
          type="button"
          onClick={() => setExpanded(prev => !prev)}
          className="text-sm font-semibold text-blue-600 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200"
          aria-expanded={expanded}
          aria-controls="trip-updates-list"
        >
          {expanded ? 'Hide updates' : 'Show updates'}
        </button>
      </div>
      {expanded && (
        <ul id="trip-updates-list" className="mt-4 space-y-3">
          {updateItems.map(update => (
            <li key={update.id} className="flex flex-wrap items-start gap-2 text-sm text-gray-700 dark:text-gray-200">
              <span className="font-semibold text-gray-900 dark:text-gray-100">
                {formatUtcDate(update.createdAt)}
              </span>
              <span className="text-gray-500 dark:text-gray-400">•</span>
              <span>
                {update.message}
                {update.links && update.links.length > 0 && (
                  <>
                    {' '}
                    {update.links
                      .filter(link => isValidHttpUrl(link.url))
                      .map((link, index) => (
                        <span key={`${update.id}-link-${index}`}>
                          {index > 0 && ', '}
                          <a
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline"
                            title={link.title || link.url}
                          >
                            {link.title || 'View post'}
                          </a>
                        </span>
                      ))}
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
