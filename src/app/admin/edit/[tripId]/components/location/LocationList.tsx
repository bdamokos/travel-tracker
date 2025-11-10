'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Location } from '@/app/types';
import { CostTrackingData } from '@/app/types';
import { ExpenseTravelLookup } from '@/app/lib/expenseTravelLookup';
import LocationItem from './LocationItem';
import LocationPosts from './LocationPosts';
import { formatUtcDate } from '@/app/lib/dateUtils';

interface LocationListProps {
  locations: Location[];
  tripId: string;
  travelLookup: ExpenseTravelLookup | null;
  costData: CostTrackingData | null;
  selectedLocationForPosts: number | null;
  newInstagramPost: Partial<{ url: string; caption: string }>;
  setNewInstagramPost: React.Dispatch<React.SetStateAction<Partial<{ url: string; caption: string }>>>;
  newTikTokPost: Partial<{ url: string; caption: string }>;
  setNewTikTokPost: React.Dispatch<React.SetStateAction<Partial<{ url: string; caption: string }>>>;
  newBlogPost: Partial<{ title: string; url: string; excerpt: string }>;
  setNewBlogPost: React.Dispatch<React.SetStateAction<Partial<{ title: string; url: string; excerpt: string }>>>;
  onLocationUpdate: (index: number, updatedLocation: Location) => void;
  onLocationDelete: (index: number) => void;
  onViewPosts: (index: number) => void;
  onGeocode: (locationName: string) => Promise<[number, number]>;
  onAddInstagramPost: (index: number) => void;
  onAddTikTokPost: (index: number) => void;
  onAddBlogPost: (index: number) => void;
}

export default function LocationList({
  locations,
  tripId,
  travelLookup,
  costData,
  selectedLocationForPosts,
  newInstagramPost,
  setNewInstagramPost,
  newTikTokPost,
  setNewTikTokPost,
  newBlogPost,
  setNewBlogPost,
  onLocationUpdate,
  onLocationDelete,
  onViewPosts,
  onGeocode,
  onAddInstagramPost,
  onAddTikTokPost,
  onAddBlogPost,
}: LocationListProps) {
  const [openLocations, setOpenLocations] = useState<Record<string, boolean>>({});

  const sortedLocations = useMemo(
    () =>
      [...locations].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [locations]
  );

  useEffect(() => {
    setOpenLocations(prev => {
      const today = getTodayMidnight();
      const next: Record<string, boolean> = {};
      let changed = false;

      for (const location of sortedLocations) {
        const defaultOpen = getDefaultOpenState(location, today);
        if (Object.prototype.hasOwnProperty.call(prev, location.id)) {
          next[location.id] = prev[location.id];
        } else {
          next[location.id] = defaultOpen;
          changed = true;
        }
      }

      for (const key of Object.keys(prev)) {
        if (!Object.prototype.hasOwnProperty.call(next, key)) {
          changed = true;
        }
      }

      if (changed || Object.keys(prev).length !== Object.keys(next).length) {
        return next;
      }

      return prev;
    });
  }, [sortedLocations]);

  useEffect(() => {
    if (selectedLocationForPosts === null) {
      return;
    }

    const targetLocation = sortedLocations[selectedLocationForPosts];
    if (!targetLocation) {
      return;
    }

    setOpenLocations(prev => {
      if (prev[targetLocation.id]) {
        return prev;
      }

      return { ...prev, [targetLocation.id]: true };
    });
  }, [selectedLocationForPosts, sortedLocations]);

  if (locations.length === 0) {
    return null;
  }

  const today = getTodayMidnight();

  return (
    <div className="space-y-6">
      <h4 className="font-medium mb-4 text-gray-900 dark:text-white">Added Locations ({locations.length})</h4>
      <div className="space-y-6">
        {sortedLocations.map((location, index) => {
          const defaultOpen = getDefaultOpenState(location, today);
          const isOpen = openLocations[location.id] ?? defaultOpen;

          return (
            <div key={location.id} className="space-y-3">
              <button
                type="button"
                onClick={() => toggleLocation(location, setOpenLocations)}
                className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 text-left text-gray-900 shadow-sm transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:hover:bg-gray-700"
                aria-expanded={isOpen}
              >
                <div>
                  <div className="font-medium">{location.name}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-300">
                    {formatDateRange(location)}
                  </div>
                </div>
                <span className="ml-4 text-xl text-gray-500 dark:text-gray-400">
                  {isOpen ? '▾' : '▸'}
                </span>
              </button>

              {isOpen && (
                <div className="space-y-3">
                  <LocationItem
                    location={location}
                    tripId={tripId}
                    travelLookup={travelLookup}
                    costData={costData}
                    onLocationUpdate={(updatedLocation) => onLocationUpdate(index, updatedLocation)}
                    onLocationDelete={() => onLocationDelete(index)}
                    onViewPosts={() => onViewPosts(index)}
                    onGeocode={onGeocode}
                    showLocationHeader={false}
                  />

                  <LocationPosts
                    location={location}
                    isVisible={selectedLocationForPosts === index}
                    newInstagramPost={newInstagramPost}
                    setNewInstagramPost={setNewInstagramPost}
                    newTikTokPost={newTikTokPost}
                    setNewTikTokPost={setNewTikTokPost}
                    newBlogPost={newBlogPost}
                    setNewBlogPost={setNewBlogPost}
                    onLocationUpdate={(updatedLocation) => onLocationUpdate(index, updatedLocation)}
                    onAddInstagramPost={() => onAddInstagramPost(index)}
                    onAddTikTokPost={() => onAddTikTokPost(index)}
                    onAddBlogPost={() => onAddBlogPost(index)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatDateRange(location: Location): string {
  const formatDate = (date: string | Date) =>
    formatUtcDate(date, 'en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });

  if (location.endDate) {
    return `${formatDate(location.date)} - ${formatDate(location.endDate)}`;
  }

  return formatDate(location.date);
}

function toggleLocation(
  location: Location,
  setOpenLocations: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
) {
  setOpenLocations(prev => {
    const today = getTodayMidnight();
    const defaultOpen = getDefaultOpenState(location, today);
    const current = Object.prototype.hasOwnProperty.call(prev, location.id)
      ? prev[location.id]
      : defaultOpen;
    const nextValue = !current;

    if (prev[location.id] === nextValue) {
      return prev;
    }

    return { ...prev, [location.id]: nextValue };
  });
}

function getDefaultOpenState(location: Location, today: Date): boolean {
  const start = normalizeDate(location.date);
  if (Number.isNaN(start.getTime())) {
    return true;
  }

  const rawEnd = location.endDate ? normalizeDate(location.endDate) : start;
  const end = Number.isNaN(rawEnd.getTime()) || rawEnd < start ? start : rawEnd;

  const isCurrent = today >= start && today <= end;
  const isFuture = start > today;

  return isCurrent || isFuture;
}

function getTodayMidnight(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function normalizeDate(value: string | Date): Date {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date(NaN);
  }

  date.setHours(0, 0, 0, 0);
  return date;
}
