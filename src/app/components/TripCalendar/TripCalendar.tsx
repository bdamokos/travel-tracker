'use client';

import { useState, useEffect, useCallback } from 'react';
import { Trip, Location } from '@/app/types';
import { 
  applyPlanningModeColors,
  generateTripCalendars,
  MonthCalendar,
  CalendarDay
} from '@/app/lib/calendarUtils';
import { formatUtcDate } from '@/app/lib/dateUtils';
import CalendarGrid from './CalendarGrid';
import styles from './Calendar.module.css';
import { LocationPopupModal } from '../LocationPopup';
import { useLocationPopup } from '../../hooks/useLocationPopup';

interface TripCalendarProps {
  trip: Trip;
  planningMode?: boolean;
  isPublic?: (location: Location) => boolean;
  className?: string;
}

export default function TripCalendar({ 
  trip, 
  planningMode = false, 
  isPublic: isPublicProp,
  className = ''
}: TripCalendarProps) {
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [mounted, setMounted] = useState(false);
  
  // Location popup state
  const { isOpen, data, openPopup, closePopup } = useLocationPopup();

  useEffect(() => {
    setMounted(true);
  }, []);

  const isPublic = useCallback(
    (location: Location) => (isPublicProp ? isPublicProp(location) : true),
    [isPublicProp]
  );

  // Generate colors and process calendar data
  const [calendarData, setCalendarData] = useState<{
    locationColors: Map<string, string>;
    monthCalendars: MonthCalendar[];
  } | null>(null);
  
  useEffect(() => {
    async function loadCalendarData() {
      try {
        // Generate calendars and colors
        const result = await generateTripCalendars(trip);
        const { locationColors: originalLocationColors, monthCalendars } = result;
        let locationColors = originalLocationColors;
        
        // Apply planning mode muting if needed
        if (planningMode) {
          locationColors = applyPlanningModeColors(locationColors, trip.locations, isPublic);
        }
        
        setCalendarData({
          locationColors,
          monthCalendars
        });
      } catch (error) {
        console.error('Error loading calendar data:', error);
      }
    }
    
    if (mounted) {
      loadCalendarData();
    }
  }, [trip, planningMode, mounted, isPublic]);

  const handleLocationSelect = (
    calendarDay: CalendarDay,
    location: Location,
    options: { isSideTrip?: boolean; baseLocation?: Location } = {}
  ) => {
    if (!location) return;

    setSelectedDate(calendarDay.date);

    const baseLocation = options.baseLocation ?? calendarDay.baseLocation ?? calendarDay.primaryLocation;
    const isSideTrip = options.isSideTrip ?? false;
    const sideTripNames = calendarDay.sideTrips?.map(loc => loc.name).filter(Boolean) ?? [];

    const getDateValue = (value: Date | string | undefined): Date | undefined => {
      if (!value) return undefined;
      if (value instanceof Date) return value;
      const parsed = new Date(value);
      return isNaN(parsed.getTime()) ? undefined : parsed;
    };

    const journeyDay = {
      id: `day-${calendarDay.date.getTime()}-${location.id}`,
      date: getDateValue(location.date) ?? calendarDay.date,
      endDate: getDateValue(location.endDate),
      title: isSideTrip && baseLocation
        ? `Side Trip: ${location.name}`
        : location.name,
      locations: [location],
      transportation: undefined,
      customNotes: isSideTrip
        ? baseLocation
          ? `Side trip from ${baseLocation.name}`
          : undefined
        : sideTripNames.length > 0
          ? `Side trips: ${sideTripNames.join(', ')}`
          : undefined
    };

    openPopup(location, journeyDay, trip.id);
  };

  // Show loading state until mounted and data loaded to prevent hydration issues
  if (!mounted || !calendarData) {
    return (
      <div className={`${styles.tripCalendar} ${className}`}>
        <div className="trip-calendar-header mb-4">
          <h2 className="text-2xl font-bold text-gray-800 dark:text-white">
            {trip.title} - Calendar View
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-300">Loading calendar...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.tripCalendar} ${planningMode ? styles.planningMode : ''} ${className}`}>
      <div className="trip-calendar-header mb-4">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white">
          {trip.title} - Calendar View
        </h2>
        <p className="text-sm text-gray-600">
          {formatUtcDate(trip.startDate, undefined, { day: 'numeric', month: 'numeric', year: 'numeric' })}
          {' - '}
          {formatUtcDate(trip.endDate, undefined, { day: 'numeric', month: 'numeric', year: 'numeric' })}
        </p>
        {planningMode && (
          <div className="mt-2 space-y-1">
            <div className="text-sm text-orange-600 font-medium">
              Planning Mode Active - Showing shadow planning data
            </div>
            <div className="flex items-center space-x-4 text-xs text-gray-600 dark:text-gray-400">
              <div className="flex items-center space-x-1">
                <div className="w-3 h-3 bg-blue-300 border border-solid rounded"></div>
                <span>Real locations</span>
              </div>
              <div className="flex items-center space-x-1">
                <div className="w-3 h-3 bg-blue-200 border-2 border-dashed border-blue-400 rounded"></div>
                <span>🔮 Shadow planning locations</span>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Multi-Month Calendar Grid */}
      <div className="space-y-8">
        {calendarData.monthCalendars.map((monthCalendar, index) => (
          <div key={index} className="month-calendar">
            {/* Month Header */}
            <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-4 text-center">
              {formatUtcDate(monthCalendar.month, 'en-US', {
                month: 'long',
                year: 'numeric'
              })}
            </h3>
            
            {/* Calendar Grid for this month */}
            <CalendarGrid
              monthCalendar={monthCalendar}
              selectedDate={selectedDate}
              onLocationSelect={handleLocationSelect}
            />
          </div>
        ))}
      </div>
      
      {/* Location Legend */}
      <div className="location-legend mt-6 p-4 rounded-lg bg-gray-100 dark:bg-gray-800">
        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-3">Locations</h3>
        <div className="flex flex-wrap gap-3">
          {Array.from(calendarData.locationColors.entries()).map(([locationName, color]) => {
            const isShadowLocation = locationName.startsWith('🔮');
            return (
              <div key={locationName} className="flex items-center space-x-2">
                <div 
                  className={`w-4 h-4 rounded ${isShadowLocation ? 'border-2 border-dashed border-blue-400' : ''}`}
                  style={{ backgroundColor: color }}
                />
                <span className={`text-sm ${isShadowLocation ? 'font-medium text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-200'}`}>
                  {locationName}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      
      {/* Location Popup Modal */}
      <LocationPopupModal
        isOpen={isOpen}
        onClose={closePopup}
        data={data}
      />
    </div>
  );
}
