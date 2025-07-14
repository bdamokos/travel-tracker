'use client';

import { MonthCalendar } from '@/app/lib/calendarUtils';
import CalendarDayCell from './CalendarDayCell';
import styles from './Calendar.module.css';

interface CalendarGridProps {
  monthCalendar: MonthCalendar;
  selectedDate: Date | null;
  onDateSelect: (date: Date) => void;
}

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function CalendarGrid({
  monthCalendar,
  selectedDate,
  onDateSelect
}: CalendarGridProps) {
  
  const weeks = monthCalendar.weeks;

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
                onClick={() => onDateSelect(cell.day.date)}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}