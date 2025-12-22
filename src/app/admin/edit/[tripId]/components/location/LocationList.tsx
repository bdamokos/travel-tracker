'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Location } from '@/app/types';
import { CostTrackingData } from '@/app/types';
import { ExpenseTravelLookup } from '@/app/lib/expenseTravelLookup';
import { buildSideTripMap } from '@/app/lib/sideTripUtils';
import LocationItem from './LocationItem';
import LocationPosts from './LocationPosts';

interface LocationListProps {
  locations: Location[];
  tripId: string;
  travelLookup: ExpenseTravelLookup | null;
  costData: CostTrackingData | null;
  selectedLocationForPosts: string | null;
  newInstagramPost: Partial<{ url: string; caption: string }>;
  setNewInstagramPost: React.Dispatch<React.SetStateAction<Partial<{ url: string; caption: string }>>>;
  newTikTokPost: Partial<{ url: string; caption: string }>;
  setNewTikTokPost: React.Dispatch<React.SetStateAction<Partial<{ url: string; caption: string }>>>;
  newBlogPost: Partial<{ title: string; url: string; excerpt: string }>;
  setNewBlogPost: React.Dispatch<React.SetStateAction<Partial<{ title: string; url: string; excerpt: string }>>>;
  onLocationUpdate: (locationId: string, updatedLocation: Location) => void;
  onLocationDelete: (locationId: string) => void;
  onViewPosts: (locationId: string) => void;
  onGeocode: (locationName: string) => Promise<[number, number]>;
  onAddInstagramPost: (locationId: string) => void;
  onAddTikTokPost: (locationId: string) => void;
  onAddBlogPost: (locationId: string) => void;
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

  const sortedLocations = useMemo(
    () => [...locations].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [locations]
  );

  // Build side-trip map once and memoize it
  const sideTripMap = useMemo(() => buildSideTripMap(locations), [locations]);

  useEffect(() => {
    const today = getTodayMidnight();

    setCollapsedLocations(prev => {
      const next: Record<string, boolean> = {};
      let changed = false;

      locations.forEach(location => {
        const defaultCollapsed = getDefaultCollapsedState(location, today, locations, sideTripMap);
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
  }, [locations, sideTripMap]);

  useEffect(() => {
    if (selectedLocationForPosts === null) {
      return;
    }

    setCollapsedLocations(prev => {
      if (prev[selectedLocationForPosts] === false) {
        return prev;
      }

      return { ...prev, [selectedLocationForPosts]: false };
    });
  }, [selectedLocationForPosts]);

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
        {sortedLocations.map((location) => {
            const hasCustomState = Object.prototype.hasOwnProperty.call(collapsedLocations, location.id);
            const isCollapsed = hasCustomState
              ? collapsedLocations[location.id]
              : getDefaultCollapsedState(location, today, locations, sideTripMap);

            return (
              <div key={location.id} className="space-y-3">
                <LocationItem
                  location={location}
                  tripId={tripId}
                  travelLookup={travelLookup}
                  costData={costData}
                  onLocationUpdate={(updatedLocation) => onLocationUpdate(location.id, updatedLocation)}
                  onLocationDelete={() => onLocationDelete(location.id)}
                  onViewPosts={() => onViewPosts(location.id)}
                  onGeocode={onGeocode}
                  isCollapsed={isCollapsed}
                  onToggleCollapse={(isOpen) => handleToggleCollapse(location.id, isOpen)}
                />

                {!isCollapsed && (
                  <LocationPosts
                    location={location}
                    isVisible={selectedLocationForPosts === location.id}
                    newInstagramPost={newInstagramPost}
                    setNewInstagramPost={setNewInstagramPost}
                    newTikTokPost={newTikTokPost}
                    setNewTikTokPost={setNewTikTokPost}
                    newBlogPost={newBlogPost}
                    setNewBlogPost={setNewBlogPost}
                    onLocationUpdate={(updatedLocation) => onLocationUpdate(location.id, updatedLocation)}
                    onAddInstagramPost={() => onAddInstagramPost(location.id)}
                    onAddTikTokPost={() => onAddTikTokPost(location.id)}
                    onAddBlogPost={() => onAddBlogPost(location.id)}
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

function getDefaultCollapsedState(
  location: Location,
  today: Date,
  allLocations: Location[],
  sideTripMap: Map<string, Location>
): boolean {
  const start = normalizeDate(location.date);
  if (Number.isNaN(start.getTime())) {
    return false;
  }

  const rawEnd = location.endDate ? normalizeDate(location.endDate) : start;
  const end = Number.isNaN(rawEnd.getTime()) || rawEnd < start ? start : rawEnd;

  const isCurrent = today >= start && today <= end;
  const isFuture = start > today;

  // If location is current or future, don't collapse
  if (isCurrent || isFuture) {
    return false;
  }

  // Check if this location is the base city of a currently active side-trip
  // If we're currently on a side-trip, its base city should remain expanded
  for (const otherLocation of allLocations) {
    const otherStart = normalizeDate(otherLocation.date);
    if (Number.isNaN(otherStart.getTime())) {
      continue;
    }

    const otherRawEnd = otherLocation.endDate ? normalizeDate(otherLocation.endDate) : otherStart;
    const otherEnd = Number.isNaN(otherRawEnd.getTime()) || otherRawEnd < otherStart ? otherStart : otherRawEnd;

    // Check if this other location is currently active
    const isOtherCurrent = today >= otherStart && today <= otherEnd;
    
    if (isOtherCurrent) {
      // Check if this other location is a side-trip and if the location we're checking is its base
      const baseLocation = sideTripMap.get(otherLocation.id);
      if (baseLocation && baseLocation.id === location.id) {
        // This location is the base city of a currently active side-trip, so don't collapse
        return false;
      }
    }
  }

  // Location is in the past and not related to any current side-trip
  return true;
}
