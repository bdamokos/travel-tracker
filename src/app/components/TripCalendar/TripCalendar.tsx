'use client';

import { useState, useEffect } from 'react';
import { Trip, Location } from '@/app/types';
import { 
  applyPlanningModeColors,
  generateTripCalendars,
  MonthCalendar
} from '@/app/lib/calendarUtils';
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
  isPublic = () => true,
  className = ''
}: TripCalendarProps) {
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [mounted, setMounted] = useState(false);
  
  // Location popup state
  const { isOpen, data, openPopup, closePopup } = useLocationPopup();

  useEffect(() => {
    setMounted(true);
  }, []);

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
  }, [trip.id, trip.startDate, trip.endDate, trip.locations.length, planningMode, mounted]);

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
    
    // Find the calendar day data for this date from the generated calendar
    let selectedCalendarDay = null;
    
    if (calendarData) {
      for (const monthCalendar of calendarData.monthCalendars) {
        for (const week of monthCalendar.weeks) {
          for (const cell of week) {
            if (cell.day.date.toDateString() === date.toDateString()) {
              selectedCalendarDay = cell.day;
              break;
            }
          }
          if (selectedCalendarDay) break;
        }
        if (selectedCalendarDay) break;
      }
    }
    
    if (selectedCalendarDay && selectedCalendarDay.primaryLocation) {
      // Create a JourneyDay-like object for the popup
      const journeyDay = {
        id: `day-${date.getTime()}`,
        date: date,
        title: selectedCalendarDay.cellType === 'transition' && selectedCalendarDay.secondaryLocation
          ? `${selectedCalendarDay.primaryLocation.name} → ${selectedCalendarDay.secondaryLocation.name}`
          : selectedCalendarDay.primaryLocation.name,
        locations: selectedCalendarDay.locations,
        transportation: undefined,
        isTransition: selectedCalendarDay.cellType === 'transition'
      };
      
      openPopup(selectedCalendarDay.primaryLocation, journeyDay, trip.id);
    }
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
          {new Date(trip.startDate).getDate()}/{new Date(trip.startDate).getMonth() + 1}/{new Date(trip.startDate).getFullYear()} - {new Date(trip.endDate).getDate()}/{new Date(trip.endDate).getMonth() + 1}/{new Date(trip.endDate).getFullYear()}
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
              {monthCalendar.month.toLocaleDateString('en-US', { 
                month: 'long', 
                year: 'numeric' 
              })}
            </h3>
            
            {/* Calendar Grid for this month */}
            <CalendarGrid
              monthCalendar={monthCalendar}
              selectedDate={selectedDate}
              onDateSelect={handleDateSelect}
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