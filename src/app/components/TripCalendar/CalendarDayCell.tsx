'use client';

import { CalendarCell, CalendarDay, muteColor } from '@/app/lib/calendarUtils';
import { Location } from '@/app/types';
import WeatherIcon from '../Weather/WeatherIcon';
import { useMemo } from 'react';

interface CalendarDayCellProps {
  cell: CalendarCell;
  isSelected: boolean;
  isToday: boolean;
  onSelectLocation: (
    day: CalendarDay,
    location: Location,
    options?: { isSideTrip?: boolean; baseLocation?: Location }
  ) => void;
  locationColors: Map<string, string>;
}

export default function CalendarDayCell({
  cell,
  isSelected,
  isToday,
  onSelectLocation,
  locationColors
}: CalendarDayCellProps) {
  const { day, backgroundColor, textColor, diagonalSplit, mergeInfo } = cell;
  const hasSideTrips = !!day.sideTrips && day.sideTrips.length > 0;
  const baseLocation = day.baseLocation ?? day.primaryLocation ?? null;

  const handlePrimaryClick = () => {
    if (!day.primaryLocation || day.isOutsideTrip || day.isOutsideMonth) return;
    onSelectLocation(day, day.primaryLocation, { baseLocation: baseLocation ?? undefined });
  };

  // Today weather hint should be computed unconditionally for hooks order
  const todayHint = useMemo(() => {
    if (!day?.primaryLocation) return null as null | { icon: string; label: string };
    const today = new Date();
    if (today.toDateString() !== day.date.toDateString()) return null;
    return { icon: '⛅', label: 'Weather available in popup' };
  }, [day]);
  
  // Don't render if this is a middle cell in a merge group
  if (mergeInfo && mergeInfo.colspan === 0) {
    return null;
  }

  // Check if this is a shadow location
  const isShadowLocation = day.primaryLocation?.name.startsWith('🔮') || day.secondaryLocation?.name.startsWith('🔮');

  const baseClasses = `
    h-20 min-h-20 border border-gray-200 cursor-pointer relative overflow-hidden
    transition-all duration-200 hover:shadow-md
    ${isSelected ? 'ring-2 ring-blue-500' : ''}
    ${isToday ? 'ring-2 ring-yellow-400' : ''}
    ${isShadowLocation ? 'shadow-inner' : ''}
  `.trim();

  const cellStyle: React.CSSProperties = {
    backgroundColor: diagonalSplit ? 'transparent' : backgroundColor,
    color: textColor,
    gridColumn: mergeInfo?.colspan ? `span ${mergeInfo.colspan}` : undefined,
    // Add subtle border pattern for shadow cells
    ...(isShadowLocation && !diagonalSplit ? {
      borderStyle: 'dashed',
      borderWidth: '2px',
      borderColor: 'rgba(59, 130, 246, 0.5)' // Blue dashed border for shadow locations
    } : {})
  };

  // Diagonal split background for transition days
  const diagonalStyle: React.CSSProperties = diagonalSplit ? {
    background: `linear-gradient(
      45deg,
      ${diagonalSplit.topLeft} 0%,
      ${diagonalSplit.topLeft} 49%,
      ${diagonalSplit.bottomRight} 51%,
      ${diagonalSplit.bottomRight} 100%
    )`
  } : {};

  return (
    <div
      className={baseClasses}
      style={cellStyle}
      onClick={handlePrimaryClick}
    >
      {/* Diagonal background for transition cells */}
      {diagonalSplit && (
        <div 
          className="absolute inset-0"
          style={diagonalStyle}
        />
      )}
      
      {/* Shadow overlay indicator for shadow locations */}
      {isShadowLocation && (
        <div className="absolute inset-0 bg-gradient-to-br from-blue-100/20 to-purple-100/20 pointer-events-none" />
      )}
      
      {/* Day number */}
      <div className="absolute top-1 left-2 text-sm font-medium z-10">
        {day.date.getDate()}
      </div>

      {/* Today weather hint */}
      {todayHint && (
        <div className="absolute top-1 right-2 z-10">
          <WeatherIcon icon={todayHint.icon} label={todayHint.label} />
        </div>
      )}
      
      {/* Location label for merged cells */}
      {mergeInfo && mergeInfo.position === 'start' && day.primaryLocation && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <span className="text-sm font-semibold text-center px-1 truncate">
            {day.primaryLocation.name}
          </span>
        </div>
      )}
      
      {/* Single location label */}
      {!mergeInfo && day.primaryLocation && !diagonalSplit && (
        <div className={`absolute ${hasSideTrips ? 'bottom-6' : 'bottom-1'} left-1 right-1 z-10`}>
          <span className="text-xs font-medium truncate block text-center">
            {day.primaryLocation.name}
          </span>
        </div>
      )}
      
      {/* Transition day labels */}
      {diagonalSplit && day.primaryLocation && day.secondaryLocation && (
        <>
          <div className="absolute top-1 left-1 text-xs font-medium z-10 bg-white/80 rounded px-1">
            {day.primaryLocation.name.slice(0, 3)}
          </div>
          <div className="absolute bottom-1 right-1 text-xs font-medium z-10 bg-white/80 rounded px-1">
            {day.secondaryLocation.name.slice(0, 3)}
          </div>
        </>
      )}

      {/* Side trip badges */}
      {hasSideTrips && !diagonalSplit && (
        <div className="absolute left-1 right-1 bottom-1 z-10 flex flex-wrap items-center justify-center gap-1">
          {day.sideTrips!.map(sideTrip => {
            const color = locationColors.get(sideTrip.name);
            const background = color ? muteColor(color, 0.2) : 'rgba(255,255,255,0.85)';
            const border = color ?? 'rgba(17,24,39,0.15)';
            return (
              <button
                key={sideTrip.id}
                type="button"
                onClick={event => {
                  event.stopPropagation();
                  onSelectLocation(day, sideTrip, {
                    isSideTrip: true,
                    baseLocation: baseLocation ?? undefined
                  });
                }}
                className="px-2 py-0.5 rounded-full border text-xs font-semibold shadow-sm transition hover:shadow"
                style={{
                  backgroundColor: background,
                  borderColor: border,
                  color: color ? '#1f2937' : '#374151'
                }}
              >
                 {sideTrip.name}
              </button>
            );
          })}
        </div>
      )}
      
      {/* Outside trip or month styling */}
      {(day.isOutsideTrip || day.isOutsideMonth) && (
        <div className="absolute inset-0 bg-gray-100 dark:bg-gray-800/50 opacity-50" />
      )}
    </div>
  );
}
