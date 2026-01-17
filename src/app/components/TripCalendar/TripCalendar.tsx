'use client';

import { ReactNode, useCallback, useEffect, useId, useMemo, useState } from 'react';
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
import { LocationPopupModal } from '@/app/components/LocationPopup';
import { useLocationPopup } from '@/app/hooks/useLocationPopup';
import { SHADOW_LOCATION_PREFIX } from '@/app/lib/shadowConstants';
import StatusAnnouncer from '@/app/components/a11y/StatusAnnouncer';

/**
 * Helper function to sort legend items by earliest date.
 * Moved outside component to prevent recreation on each render.
 */
const getSortedLegendItems = (
  locationColors: Map<string, string>,
  locations: Location[]
): [string, string][] => {
  // Create a map of location name to earliest date
  const locationDates = new Map<string, Date>();

  locations.forEach(location => {
    const locationName = location.name;
    const locationDate = new Date(location.date);

    // Validate date before storing - skip invalid dates
    if (isNaN(locationDate.getTime())) {
      return;
    }

    // If this location hasn't been seen before, or this date is earlier, update it
    const existingDate = locationDates.get(locationName);
    if (!existingDate || locationDate < existingDate) {
      locationDates.set(locationName, locationDate);
    }
  });

  // Sort the legend entries by earliest date
  const normalizeLocationName = (name: string) => {
    if (!name || name === SHADOW_LOCATION_PREFIX) {
      return name; // Return as-is if empty or just the prefix
    }
    return name.startsWith(SHADOW_LOCATION_PREFIX)
      ? name.replace(SHADOW_LOCATION_PREFIX, '').trim()
      : name;
  };

  return Array.from(locationColors.entries()).sort(([nameA], [nameB]) => {
    // Shadow locations have the prefix in legend keys but trip.locations use original names,
    // so we normalize both to the original location name for date lookups
    const cleanNameA = normalizeLocationName(nameA);
    const cleanNameB = normalizeLocationName(nameB);

    const actualDateA = locationDates.get(cleanNameA);
    const actualDateB = locationDates.get(cleanNameB);

    if (!actualDateA && !actualDateB) return 0;
    if (!actualDateA) return 1;
    if (!actualDateB) return -1;

    return actualDateA.getTime() - actualDateB.getTime();
  });
};

interface TripCalendarProps {
  trip: Trip;
  planningMode?: boolean;
  isPublic?: (location: Location) => boolean;
  className?: string;
  children?: ReactNode;
}

export default function TripCalendar({ 
  trip, 
  planningMode = false, 
  isPublic: isPublicProp,
  className = '',
  children
}: TripCalendarProps) {
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [mounted, setMounted] = useState(false);
  const [calendarAnnouncement, setCalendarAnnouncement] = useState('');
  const instructionsId = useId();
  const statusId = useId();
  const monthHeaderBaseId = useId();
  
  // Location popup state
  const { isOpen, data, openPopup, closePopup } = useLocationPopup();
  const handlePopupClose = useCallback(() => {
    closePopup();
    setCalendarAnnouncement('Popup closed.');
  }, [closePopup]);

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
    const formattedDate = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(calendarDay.date);
    setCalendarAnnouncement(`Opened popup for ${location.name} on ${formattedDate}.`);
  };

  // Memoize the sorted legend items to prevent re-sorting on every render
  const sortedLegendItems = useMemo(() => {
    if (!calendarData) return [];
    return getSortedLegendItems(calendarData.locationColors, trip.locations);
  }, [calendarData, trip.locations]);

  // Show loading state until mounted and data loaded to prevent hydration issues
  if (!mounted || !calendarData) {
    return (
      <div className={`${styles.tripCalendar} ${className}`}>
        <div className="trip-calendar-header mb-4">
          <h2 className="text-2xl font-bold text-gray-800 dark:text-white">
            {trip.title}
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-300">Loading calendar...</p>
        </div>
        {children ? <div className="mt-4">{children}</div> : null}
      </div>
    );
  }

  return (
    <div
      className={`${styles.tripCalendar} ${planningMode ? styles.planningMode : ''} ${className}`}
      role="region"
      aria-label={`Trip calendar for ${trip.title}`}
      aria-describedby={`${instructionsId} ${statusId}`}
    >
      <div id={instructionsId} className="sr-only">
        Trip calendar for {trip.title}. Use Tab to move into a month grid. Use arrow keys to move between days.
        Use Home or End to jump to the start or end of a week row. Press Enter or Space on a day to open the
        location popup. Press Escape to close the popup.
      </div>
      <StatusAnnouncer id={statusId} announcement={calendarAnnouncement} ariaLive="polite" role="status" atomic />
      <div className="trip-calendar-header mb-4">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white">
          {trip.title}
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
                <span>{SHADOW_LOCATION_PREFIX} Shadow planning locations</span>
              </div>
            </div>
          </div>
          )}
      </div>

      {children ? <div className="mt-4">{children}</div> : null}
      
      {/* Multi-Month Calendar Grid */}
      <div className="space-y-8">
        {calendarData.monthCalendars.map((monthCalendar, index) => (
          <div key={index} className="month-calendar">
            {/* Month Header */}
            <h3
              id={`${monthHeaderBaseId}-month-${index}`}
              className="text-xl font-bold text-gray-800 dark:text-white mb-4 text-center"
            >
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
              locationColors={calendarData.locationColors}
              monthHeaderId={`${monthHeaderBaseId}-month-${index}`}
              onAnnounce={setCalendarAnnouncement}
            />
          </div>
        ))}
      </div>
      
      {/* Location Legend */}
      <div className="location-legend mt-6 p-4 rounded-lg bg-gray-100 dark:bg-gray-800">
        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-3">Locations</h3>
        <div className="flex flex-wrap gap-3">
          {sortedLegendItems.map(([locationName, color]) => {
            const isShadowLocation = locationName.startsWith(SHADOW_LOCATION_PREFIX);
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
        onClose={handlePopupClose}
        data={data}
      />
    </div>
  );
}
