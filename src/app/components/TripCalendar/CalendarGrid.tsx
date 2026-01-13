'use client';

import { useMemo } from 'react';
import { MonthCalendar, CalendarDay } from '@/app/lib/calendarUtils';
import { Location } from '@/app/types';
import CalendarDayCell from './CalendarDayCell';
import styles from './Calendar.module.css';

interface CalendarGridProps {
  monthCalendar: MonthCalendar;
  selectedDate: Date | null;
  onLocationSelect: (
    day: CalendarDay,
    location: Location,
    options?: { isSideTrip?: boolean; baseLocation?: Location }
  ) => void;
  locationColors: Map<string, string>;
}

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function CalendarGrid({
  monthCalendar,
  selectedDate,
  onLocationSelect,
  locationColors
}: CalendarGridProps) {

  // Filter out weeks that consist entirely of outside-month days
  const weeks = useMemo(
    () => monthCalendar.weeks.filter(week =>
      week.some(cell => !cell.day.isOutsideMonth)
    ),
    [monthCalendar.weeks]
  );

  return (
    <div className={styles.calendarGrid}>
      {/* Days of week header */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {DAYS_OF_WEEK.map(day => (
          <div key={day} className="text-center text-sm font-medium text-gray-500 p-2">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar weeks */}
      <div className="space-y-1">
        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} className="grid grid-cols-7 gap-1">
            {week.map((cell, dayIndex) => (
              <CalendarDayCell
                key={`${weekIndex}-${dayIndex}`}
                cell={cell}
                isSelected={selectedDate ? 
                  cell.day.date.getTime() === selectedDate.getTime() : false}
                isToday={false} // Disabled to prevent hydration mismatch
                onSelectLocation={(day, location, options) =>
                  onLocationSelect(day, location, options)
                }
                locationColors={locationColors}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
