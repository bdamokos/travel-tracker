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
  };

  // Show loading state until mounted and data loaded to prevent hydration issues
  if (!mounted || !calendarData) {
    return (
      <div className={`${styles.tripCalendar} ${className}`}>
        <div className="trip-calendar-header mb-4">
          <h2 className="text-2xl font-bold text-gray-800">
            {trip.title} - Calendar View
          </h2>
          <p className="text-sm text-gray-600">Loading calendar...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.tripCalendar} ${planningMode ? styles.planningMode : ''} ${className}`}>
      <div className="trip-calendar-header mb-4">
        <h2 className="text-2xl font-bold text-gray-800">
          {trip.title} - Calendar View
        </h2>
        <p className="text-sm text-gray-600">
          {new Date(trip.startDate).getDate()}/{new Date(trip.startDate).getMonth() + 1}/{new Date(trip.startDate).getFullYear()} - {new Date(trip.endDate).getDate()}/{new Date(trip.endDate).getMonth() + 1}/{new Date(trip.endDate).getFullYear()}
        </p>
        {planningMode && (
          <div className="mt-2 text-sm text-orange-600 font-medium">
            Planning Mode - Muted colors indicate non-public locations
          </div>
        )}
      </div>
      
      {/* Multi-Month Calendar Grid */}
      <div className="space-y-8">
        {calendarData.monthCalendars.map((monthCalendar, index) => (
          <div key={index} className="month-calendar">
            {/* Month Header */}
            <h3 className="text-xl font-bold text-gray-800 mb-4 text-center">
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
      <div className="location-legend mt-6">
        <h3 className="text-lg font-semibold text-gray-700 mb-3">Locations</h3>
        <div className="flex flex-wrap gap-3">
          {Array.from(calendarData.locationColors.entries()).map(([locationName, color]) => (
            <div key={locationName} className="flex items-center space-x-2">
              <div 
                className="w-4 h-4 rounded"
                style={{ backgroundColor: color }}
              />
              <span className="text-sm text-gray-700">{locationName}</span>
            </div>
          ))}
        </div>
      </div>
      
      {/* Selected Date Info */}
      {selectedDate && (
        <div className="selected-date-info mt-6 p-4 bg-gray-50 rounded-lg">
          <h3 className="text-lg font-semibold text-gray-700 mb-2">
            {selectedDate.getDate()}/{selectedDate.getMonth() + 1}/{selectedDate.getFullYear()}
          </h3>
          {/* Add selected date details here */}
        </div>
      )}
    </div>
  );
}