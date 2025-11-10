'use client';

import React, { useEffect, useState } from 'react';
import { Location } from '@/app/types';
import { CostTrackingData } from '@/app/types';
import { ExpenseTravelLookup } from '@/app/lib/expenseTravelLookup';
import LocationItem from './LocationItem';
import LocationPosts from './LocationPosts';

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
  const [collapsedLocations, setCollapsedLocations] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const today = getTodayMidnight();

    setCollapsedLocations(prev => {
      const next: Record<string, boolean> = {};
      let changed = false;

      locations.forEach(location => {
        const defaultCollapsed = getDefaultCollapsedState(location, today);
        if (Object.prototype.hasOwnProperty.call(prev, location.id)) {
          next[location.id] = prev[location.id];
        } else {
          next[location.id] = defaultCollapsed;
          changed = true;
        }
      });

      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);
      if (!changed) {
        if (prevKeys.length !== nextKeys.length) {
          changed = true;
        } else if (prevKeys.some(id => !nextKeys.includes(id))) {
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [locations]);

  const today = getTodayMidnight();

  const handleToggleCollapse = (locationId: string, isOpen: boolean) => {
    setCollapsedLocations(prev => {
      const nextValue = !isOpen;
      if (prev[locationId] === nextValue) {
        return prev;
      }
      return { ...prev, [locationId]: nextValue };
    });
  };

  if (locations.length === 0) {
    return null;
  }

  return (
    <div className="space-y-6">
      <h4 className="font-medium mb-4 text-gray-900 dark:text-white">Added Locations ({locations.length})</h4>
      <div className="space-y-6">
        {locations
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
          .map((location, index) => {
            const hasCustomState = Object.prototype.hasOwnProperty.call(collapsedLocations, location.id);
            const isCollapsed = hasCustomState
              ? collapsedLocations[location.id]
              : getDefaultCollapsedState(location, today);

            return (
              <div key={location.id} className="space-y-3">
                <LocationItem
                  location={location}
                  tripId={tripId}
                  travelLookup={travelLookup}
                  costData={costData}
                  onLocationUpdate={(updatedLocation) => onLocationUpdate(index, updatedLocation)}
                  onLocationDelete={() => onLocationDelete(index)}
                  onViewPosts={() => onViewPosts(index)}
                  onGeocode={onGeocode}
                  isCollapsed={isCollapsed}
                  onToggleCollapse={(isOpen) => handleToggleCollapse(location.id, isOpen)}
                />

                {!isCollapsed && (
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
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
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

function getDefaultCollapsedState(location: Location, today: Date): boolean {
  const start = normalizeDate(location.date);
  if (Number.isNaN(start.getTime())) {
    return false;
  }

  const rawEnd = location.endDate ? normalizeDate(location.endDate) : start;
  const end = Number.isNaN(rawEnd.getTime()) || rawEnd < start ? start : rawEnd;

  const isCurrent = today >= start && today <= end;
  const isFuture = start > today;

  return !isCurrent && !isFuture;
}
