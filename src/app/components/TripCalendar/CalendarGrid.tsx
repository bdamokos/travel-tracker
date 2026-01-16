'use client';

import { useCallback, useMemo, useRef } from 'react';
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
  monthHeaderId: string;
  onAnnounce: (message: string) => void;
}

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function CalendarGrid({
  monthCalendar,
  selectedDate,
  onLocationSelect,
  locationColors,
  monthHeaderId,
  onAnnounce,
}: CalendarGridProps) {
  const cellRefs = useRef(new globalThis.Map<string, HTMLElement>());

  // Filter out weeks that consist entirely of outside-month days
  const weeks = useMemo(
    () => monthCalendar.weeks.filter(week =>
      week.some(cell => !cell.day.isOutsideMonth)
    ),
    [monthCalendar.weeks]
  );

  const registerCell = useCallback((row: number, col: number, element: HTMLElement | null) => {
    const key = `${row}:${col}`;
    if (!element) {
      cellRefs.current.delete(key);
      return;
    }
    cellRefs.current.set(key, element);
  }, []);

  const focusCell = useCallback((row: number, col: number) => {
    const element = cellRefs.current.get(`${row}:${col}`);
    if (!element) return false;
    element.focus();
    return true;
  }, []);

  const focusFirstInRow = useCallback((row: number) => {
    for (let col = 0; col < 7; col += 1) {
      if (focusCell(row, col)) return true;
    }
    return false;
  }, [focusCell]);

  const focusLastInRow = useCallback((row: number) => {
    for (let col = 6; col >= 0; col -= 1) {
      if (focusCell(row, col)) return true;
    }
    return false;
  }, [focusCell]);

  const handleNavigate = useCallback((fromRow: number, fromCol: number, key: string) => {
    const rowCount = weeks.length;
    const colCount = 7;

    const move = (dr: number, dc: number) => {
      let r = fromRow + dr;
      let c = fromCol + dc;
      while (r >= 0 && r < rowCount && c >= 0 && c < colCount) {
        if (focusCell(r, c)) return;
        r += dr;
        c += dc;
      }
    };

    switch (key) {
      case 'ArrowUp':
        move(-1, 0);
        break;
      case 'ArrowDown':
        move(1, 0);
        break;
      case 'ArrowLeft':
        move(0, -1);
        break;
      case 'ArrowRight':
        move(0, 1);
        break;
      case 'Home':
        focusFirstInRow(fromRow);
        break;
      case 'End':
        focusLastInRow(fromRow);
        break;
      default:
        break;
    }
  }, [focusCell, focusFirstInRow, focusLastInRow, weeks.length]);

  return (
    <div className={styles.calendarGrid} role="grid" aria-labelledby={monthHeaderId}>
      {/* Days of week header */}
      <div className="grid grid-cols-7 gap-1 mb-2" role="row">
        {DAYS_OF_WEEK.map(day => (
          <div key={day} className="text-center text-sm font-medium text-gray-500 p-2" role="columnheader">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar weeks */}
      <div className="space-y-1" role="rowgroup">
        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} className="grid grid-cols-7 gap-1" role="row">
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
                gridPosition={{ row: weekIndex, col: dayIndex }}
                registerCell={registerCell}
                onNavigate={handleNavigate}
                onAnnounce={onAnnounce}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
