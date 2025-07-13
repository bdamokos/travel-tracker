'use client';

import React from 'react';
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
  newBlogPost: Partial<{ title: string; url: string; excerpt: string }>;
  setNewBlogPost: React.Dispatch<React.SetStateAction<Partial<{ title: string; url: string; excerpt: string }>>>;
  onLocationUpdate: (index: number, updatedLocation: Location) => void;
  onLocationDelete: (index: number) => void;
  onViewPosts: (index: number) => void;
  onGeocode: (locationName: string) => Promise<[number, number]>;
  onAddInstagramPost: (index: number) => void;
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
  newBlogPost,
  setNewBlogPost,
  onLocationUpdate,
  onLocationDelete,
  onViewPosts,
  onGeocode,
  onAddInstagramPost,
  onAddBlogPost,
}: LocationListProps) {
  if (locations.length === 0) {
    return null;
  }

  return (
    <div className="space-y-6">
      <h4 className="font-medium mb-4 text-gray-900 dark:text-white">Added Locations ({locations.length})</h4>
      <div className="space-y-6">
        {locations
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
          .map((location, index) => (
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
            />

            <LocationPosts
              location={location}
              isVisible={selectedLocationForPosts === index}
              newInstagramPost={newInstagramPost}
              setNewInstagramPost={setNewInstagramPost}
              newBlogPost={newBlogPost}
              setNewBlogPost={setNewBlogPost}
              onLocationUpdate={(updatedLocation) => onLocationUpdate(index, updatedLocation)}
              onAddInstagramPost={() => onAddInstagramPost(index)}
              onAddBlogPost={() => onAddBlogPost(index)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}