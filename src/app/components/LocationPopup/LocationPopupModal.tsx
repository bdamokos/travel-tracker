/**
 * Unified LocationPopupModal for both map markers and calendar clicks
 * Replaces broken calendar behavior and enhances map popups with rich content
 */

'use client';

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Location, JourneyDay } from '@/app/types';
import { useWikipediaData } from '@/app/hooks/useWikipediaData';
import TripContextSection from '@/app/components/LocationPopup/TripContextSection';
import WikipediaSection from '@/app/components/LocationPopup/WikipediaSection';
import WeatherSummary from '@/app/components/Weather/WeatherSummary';
import { useWeather } from '@/app/hooks/useWeather';
import AccessibleModal from '@/app/admin/components/AccessibleModal';
import StatusAnnouncer from '@/app/components/a11y/StatusAnnouncer';

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
  const isTransition = (data?.day.locations?.length ?? 0) > 1;
  const [activeTab, setActiveTab] = useState<'departure' | 'arrival'>('departure');
  const [announcement, setAnnouncement] = useState('');
  const statusId = useId();
  const weatherPanelId = useId();
  const wikiPanelId = useId();
  const weatherDepartureTabId = useId();
  const weatherArrivalTabId = useId();
  const wikiDepartureTabId = useId();
  const wikiArrivalTabId = useId();
  const prevFlagsRef = useRef({
    departureWeatherLoaded: false,
    arrivalWeatherLoaded: false,
    departureWikiLoaded: false,
    arrivalWikiLoaded: false,
    departureWikiErrored: false,
    arrivalWikiErrored: false,
  });

  const announceOnce = useCallback(
    (
      condition: unknown,
      flag: keyof typeof prevFlagsRef.current,
      locationName: string | undefined,
      messageForLocation: (name: string) => string
    ) => {
      if (!condition) return;
      if (prevFlagsRef.current[flag]) return;
      prevFlagsRef.current[flag] = true;
      if (locationName) setAnnouncement(messageForLocation(locationName));
    },
    []
  );
  
  // For transition days, fetch Wikipedia data for both locations
  const departureLocation = data?.location || null;
  const arrivalLocation = isTransition ? (data?.day.locations?.[1] ?? null) : null;
  
  // Fetch Weather data for departure/arrival
  const { data: departureWeather, loading: departureWeatherLoading } = useWeather(departureLocation);
  const { data: arrivalWeather, loading: arrivalWeatherLoading } = useWeather(arrivalLocation);

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
  
  // Determine active Wikipedia data based on tab selection
  const activeWikipediaData = isTransition 
    ? (activeTab === 'departure' ? departureWikipediaData : arrivalWikipediaData)
    : departureWikipediaData;
  const activeWikipediaLoading = isTransition 
    ? (activeTab === 'departure' ? departureWikipediaLoading : arrivalWikipediaLoading)
    : departureWikipediaLoading;
  const activeWikipediaError = isTransition 
    ? (activeTab === 'departure' ? departureWikipediaError : arrivalWikipediaError)
    : departureWikipediaError;

  useEffect(() => {
    if (!isOpen) {
      setAnnouncement('');
      prevFlagsRef.current = {
        departureWeatherLoaded: false,
        arrivalWeatherLoaded: false,
        departureWikiLoaded: false,
        arrivalWikiLoaded: false,
        departureWikiErrored: false,
        arrivalWikiErrored: false,
      };
      return;
    }

    if (isTransition) {
      const targetName = activeTab === 'departure' ? departureLocation?.name : arrivalLocation?.name;
      if (targetName) setAnnouncement(`Showing details for ${targetName}.`);
    }
  }, [activeTab, arrivalLocation?.name, departureLocation?.name, isOpen, isTransition]);

  useEffect(() => {
    if (!isOpen) return;

    announceOnce(departureWeather, 'departureWeatherLoaded', departureLocation?.name, name => `Weather loaded for ${name}.`);
    announceOnce(arrivalWeather, 'arrivalWeatherLoaded', arrivalLocation?.name, name => `Weather loaded for ${name}.`);
  }, [announceOnce, arrivalLocation?.name, arrivalWeather, departureLocation?.name, departureWeather, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    announceOnce(
      departureWikipediaData,
      'departureWikiLoaded',
      departureLocation?.name,
      name => `Wikipedia content loaded for ${name}.`
    );
    announceOnce(
      arrivalWikipediaData,
      'arrivalWikiLoaded',
      arrivalLocation?.name,
      name => `Wikipedia content loaded for ${name}.`
    );
    announceOnce(
      departureWikipediaError,
      'departureWikiErrored',
      departureLocation?.name,
      name => `Wikipedia failed to load for ${name}.`
    );
    announceOnce(
      arrivalWikipediaError,
      'arrivalWikiErrored',
      arrivalLocation?.name,
      name => `Wikipedia failed to load for ${name}.`
    );
  }, [
    announceOnce,
    arrivalLocation?.name,
    arrivalWikipediaData,
    arrivalWikipediaError,
    departureLocation?.name,
    departureWikipediaData,
    departureWikipediaError,
    isOpen,
  ]);

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
      <StatusAnnouncer id={statusId} announcement={announcement} ariaLive="polite" role="status" atomic />
      <div className="space-y-6">
        {/* Trip Details first */}
        <TripContextSection 
          location={location}
          day={day}
          tripId={tripId}
        />

        {/* Weather Section with Tabs for Transition Days */}
        <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
          {isTransition ? (
            <div>
              <div className="flex space-x-1 mb-3 bg-gray-100 dark:bg-gray-800 rounded-lg p-1" role="tablist" aria-label="Weather location tabs">
                <button
                  onClick={() => setActiveTab('departure')}
                  id={weatherDepartureTabId}
                  role="tab"
                  aria-selected={activeTab === 'departure'}
                  aria-controls={weatherPanelId}
                  className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    activeTab === 'departure'
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  📍 {departureLocation?.name}
                </button>
                <button
                  onClick={() => setActiveTab('arrival')}
                  id={weatherArrivalTabId}
                  role="tab"
                  aria-selected={activeTab === 'arrival'}
                  aria-controls={weatherPanelId}
                  className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    activeTab === 'arrival'
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  🎯 {arrivalLocation?.name}
                </button>
              </div>
              <div
                id={weatherPanelId}
                role="tabpanel"
                aria-labelledby={activeTab === 'departure' ? weatherDepartureTabId : weatherArrivalTabId}
              >
                {activeTab === 'departure' ? (
                  <>
                    {departureWeather && <WeatherSummary summary={departureWeather} />}
                    {!departureWeather && departureWeatherLoading && (
                      <div className="text-xs text-gray-500">Loading weather…</div>
                    )}
                  </>
                ) : (
                  <>
                    {arrivalWeather && <WeatherSummary summary={arrivalWeather} />}
                    {!arrivalWeather && arrivalWeatherLoading && (
                      <div className="text-xs text-gray-500">Loading weather…</div>
                    )}
                  </>
                )}
              </div>
            </div>
          ) : (
            <div>
              {departureWeather && <WeatherSummary summary={departureWeather} />}
              {!departureWeather && departureWeatherLoading && (
                <div className="text-xs text-gray-500">Loading weather…</div>
              )}
            </div>
          )}
        </div>

        {/* Wikipedia Section with Tabs for Transition Days */}
        {isTransition ? (
          <div className="border-t border-gray-200 dark:border-gray-600 pt-4">
            {/* Tab Navigation */}
            <div className="flex space-x-1 mb-4 bg-gray-100 dark:bg-gray-800 rounded-lg p-1" role="tablist" aria-label="Wikipedia tabs">
              <button
                onClick={() => setActiveTab('departure')}
                id={wikiDepartureTabId}
                role="tab"
                aria-selected={activeTab === 'departure'}
                aria-controls={wikiPanelId}
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
                id={wikiArrivalTabId}
                role="tab"
                aria-selected={activeTab === 'arrival'}
                aria-controls={wikiPanelId}
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
            <div
              id={wikiPanelId}
              role="tabpanel"
              aria-labelledby={activeTab === 'departure' ? wikiDepartureTabId : wikiArrivalTabId}
            >
              <WikipediaSection
                wikipediaData={activeWikipediaData}
                loading={activeWikipediaLoading}
                error={activeWikipediaError}
              />
            </div>
          </div>
        ) : (
          <WikipediaSection
            wikipediaData={activeWikipediaData}
            loading={activeWikipediaLoading}
            error={activeWikipediaError}
          />
        )}
      </div>
    </AccessibleModal>
  );
}
