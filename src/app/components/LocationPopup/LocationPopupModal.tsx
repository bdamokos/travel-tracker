/**
 * Unified LocationPopupModal for both map markers and calendar clicks
 * Replaces broken calendar behavior and enhances map popups with rich content
 */

'use client';

import React, { useState } from 'react';
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
  const isTransition = data?.day.locations && data.day.locations.length > 1;
  const [activeTab, setActiveTab] = useState<'departure' | 'arrival'>('departure');
  
  // For transition days, fetch Wikipedia data for both locations
  const departureLocation = data?.location || null;
  const arrivalLocation = isTransition && data.day.locations[1] ? data.day.locations[1] : null;
  
  // Fetch Wikipedia data for departure location
  const { 
    data: departureWikipediaData, 
    loading: departureWikipediaLoading, 
    error: departureWikipediaError 
  } = useWikipediaData(departureLocation, { enabled: true });
  
  // Fetch Wikipedia data for arrival location (only if transition)
  const { 
    data: arrivalWikipediaData, 
    loading: arrivalWikipediaLoading, 
    error: arrivalWikipediaError 
  } = useWikipediaData(arrivalLocation, { enabled: isTransition });

  if (!data) return null;

  const { location, day, tripId } = data;
  
  // Determine active Wikipedia data based on tab selection
  const activeLocation = isTransition 
    ? (activeTab === 'departure' ? departureLocation : arrivalLocation)
    : departureLocation;
  const activeWikipediaData = isTransition 
    ? (activeTab === 'departure' ? departureWikipediaData : arrivalWikipediaData)
    : departureWikipediaData;
  const activeWikipediaLoading = isTransition 
    ? (activeTab === 'departure' ? departureWikipediaLoading : arrivalWikipediaLoading)
    : departureWikipediaLoading;
  const activeWikipediaError = isTransition 
    ? (activeTab === 'departure' ? departureWikipediaError : arrivalWikipediaError)
    : departureWikipediaError;

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

        {/* Wikipedia Section with Tabs for Transition Days */}
        {isTransition ? (
          <div className="border-t border-gray-200 dark:border-gray-600 pt-4">
            {/* Tab Navigation */}
            <div className="flex space-x-1 mb-4 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
              <button
                onClick={() => setActiveTab('departure')}
                className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'departure'
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                📍 Departure: {departureLocation?.name}
              </button>
              <button
                onClick={() => setActiveTab('arrival')}
                className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'arrival'
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                🎯 Arrival: {arrivalLocation?.name}
              </button>
            </div>
            
            {/* Active Wikipedia Section */}
            <WikipediaSection
              location={activeLocation || location}
              wikipediaData={activeWikipediaData}
              loading={activeWikipediaLoading}
              error={activeWikipediaError}
            />
          </div>
        ) : (
          <WikipediaSection
            location={location}
            wikipediaData={activeWikipediaData}
            loading={activeWikipediaLoading}
            error={activeWikipediaError}
          />
        )}
      </div>
    </AccessibleModal>
  );
}