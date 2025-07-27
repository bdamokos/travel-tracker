/**
 * Unified LocationPopupModal for both map markers and calendar clicks
 * Replaces broken calendar behavior and enhances map popups with rich content
 */

'use client';

import React from 'react';
import { Location, JourneyDay } from '../../types';
import { useWikipediaData } from '../../hooks/useWikipediaData';
import WikipediaSection from './WikipediaSection';
import TripContextSection from './TripContextSection';
import AccessibleModal from '../../admin/components/AccessibleModal';

export interface LocationPopupData {
  location: Location;
  day: JourneyDay;
  tripId: string;
}

interface LocationPopupModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: LocationPopupData | null;
}

export default function LocationPopupModal({
  isOpen,
  onClose,
  data
}: LocationPopupModalProps) {
  // Fetch Wikipedia data for the location
  const { 
    data: wikipediaData, 
    loading: wikipediaLoading, 
    error: wikipediaError 
  } = useWikipediaData(data?.location || null, { enabled: true });

  if (!data) return null;

  const { location, day, tripId } = data;

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={onClose}
      title={location.name}
      size="md"
      className="max-w-2xl"
      showOverlay={false}
    >
      <div className="space-y-6">
        {/* Trip Context Section */}
        <TripContextSection 
          location={location}
          day={day}
          tripId={tripId}
        />

        {/* Wikipedia Section */}
        <WikipediaSection
          location={location}
          wikipediaData={wikipediaData}
          loading={wikipediaLoading}
          error={wikipediaError}
        />
      </div>
    </AccessibleModal>
  );
}