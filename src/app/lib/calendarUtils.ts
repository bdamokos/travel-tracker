import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays } from 'date-fns';
import { pickDistinctColors } from 'pick-distinct-colors';
import { Trip, Location } from '@/app/types';
import { buildSideTripMap } from './sideTripUtils';
import { SHADOW_LOCATION_PREFIX } from '@/app/lib/shadowConstants';

function toCalendarDay(value: string | Date): Date {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (isNaN(date.getTime())) {
    return new Date(NaN);
  }

  const isLocalMidnight =
    date.getHours() === 0 &&
    date.getMinutes() === 0 &&
    date.getSeconds() === 0 &&
    date.getMilliseconds() === 0;

  if (isLocalMidnight) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export interface CalendarDay {
  date: Date;
  locations: Location[];
  primaryLocation?: Location;
  secondaryLocation?: Location;
  sideTrips?: Location[];
  baseLocation?: Location;
  cellType: 'single' | 'transition' | 'merged-start' | 'merged-middle' | 'merged-end';
  mergeGroup?: string;
  isOutsideTrip?: boolean;
  isOutsideMonth?: boolean;
}

export interface CalendarCell {
  day: CalendarDay;
  backgroundColor: string;
  textColor: string;
  diagonalSplit?: {
    topLeft: string;
    bottomRight: string;
    direction: 'A-to-B' | 'B-to-A';
  };
  mergeInfo?: {
    colspan: number;
    position: 'start' | 'middle' | 'end';
    groupId: string;
  };
}

export interface MonthCalendar {
  month: Date;
  weeks: CalendarCell[][];
}

export async function generateLocationColors(locations: Location[]): Promise<Map<string, string>> {
  const uniqueLocations = Array.from(new Set(locations.map(l => l.name)));
  
  if (uniqueLocations.length === 0) {
    return new Map();
  }
  
  // Use pickDistinctColors for optimal color selection
  const result = await pickDistinctColors({
    count: uniqueLocations.length,
    algorithm: 'greedy',
    poolSize: Math.max(uniqueLocations.length * 20, 128),
    seed: 42 // Fixed seed for consistent colors
  });
  
  const selectedColors = result.colors;
  
  // Convert RGB arrays to hex colors and map to locations
  const locationColors = new Map();
  uniqueLocations.forEach((location, index) => {
    const [r, g, b] = selectedColors[index];
    const hexColor = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    locationColors.set(location, hexColor);
  });
  
  return locationColors;
}

function normalizeHex(value: string): string {
  const raw = value.trim().replace('#', '');
  if (raw.length === 3) {
    return raw
      .split('')
      .map(ch => `${ch}${ch}`)
      .join('')
      .toLowerCase();
  }
  return raw.slice(0, 6).toLowerCase();
}

function srgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance(red: number, green: number, blue: number): number {
  const R = srgbToLinear(red);
  const G = srgbToLinear(green);
  const B = srgbToLinear(blue);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function getContrastColor(hexColor: string): string {
  const hex = normalizeHex(hexColor);
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);

  const bgL = relativeLuminance(r, g, b);
  const blackContrast = contrastRatio(bgL, 0); // #000000
  const whiteContrast = contrastRatio(bgL, 1); // #FFFFFF

  return blackContrast >= whiteContrast ? '#000000' : '#FFFFFF';
}

export function muteColor(hexColor: string, opacity: number = 0.6): string {
  // Convert to RGB, blend with white, return as hex
  const color = hexColor.replace('#', '');
  const r = parseInt(color.slice(0, 2), 16);
  const g = parseInt(color.slice(2, 4), 16);
  const b = parseInt(color.slice(4, 6), 16);
  
  const mutedR = Math.round(r + (255 - r) * (1 - opacity));
  const mutedG = Math.round(g + (255 - g) * (1 - opacity));
  const mutedB = Math.round(b + (255 - b) * (1 - opacity));
  
  return `#${mutedR.toString(16).padStart(2, '0')}${mutedG.toString(16).padStart(2, '0')}${mutedB.toString(16).padStart(2, '0')}`;
}

export function applyShadowStyling(hexColor: string): string {
  // Convert to RGB
  const color = hexColor.replace('#', '');
  const r = parseInt(color.slice(0, 2), 16);
  const g = parseInt(color.slice(2, 4), 16);
  const b = parseInt(color.slice(4, 6), 16);
  
  // Apply shadow styling: mute the color and add a blue tint
  const opacity = 0.5; // More muted than regular muted colors
  const blueTint = 30; // Add blue tint for shadow effect
  
  const shadowR = Math.round((r + (255 - r) * (1 - opacity)) * 0.9);
  const shadowG = Math.round((g + (255 - g) * (1 - opacity)) * 0.9);
  const shadowB = Math.round((b + (255 - b) * (1 - opacity)) * 0.9 + blueTint);
  
  // Ensure values stay within 0-255 range
  const clampedR = Math.min(255, Math.max(0, shadowR));
  const clampedG = Math.min(255, Math.max(0, shadowG));
  const clampedB = Math.min(255, Math.max(0, shadowB));
  
  return `#${clampedR.toString(16).padStart(2, '0')}${clampedG.toString(16).padStart(2, '0')}${clampedB.toString(16).padStart(2, '0')}`;
}

export function generateDateRange(startDate: string | Date, endDate: string | Date): Date[] {
  const start = toCalendarDay(startDate);
  const end = toCalendarDay(endDate);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return [];
  }

  const dates: Date[] = [];
  let currentDate = start;
  
  while (currentDate <= end) {
    dates.push(new Date(currentDate.getTime()));
    currentDate = addDays(currentDate, 1);
  }
  
  return dates;
}

export function getCalendarDaysForMonth(month: Date): Date[] {
  const normalizedMonth = toCalendarDay(month);
  if (isNaN(normalizedMonth.getTime())) {
    return [];
  }

  const monthStart = toCalendarDay(startOfMonth(normalizedMonth));
  const monthEnd = toCalendarDay(endOfMonth(normalizedMonth));
  const calendarStart = toCalendarDay(startOfWeek(monthStart, { weekStartsOn: 1 })); // Monday = 1
  const calendarEnd = toCalendarDay(endOfWeek(monthEnd, { weekStartsOn: 1 }));
  
  return generateDateRange(calendarStart, calendarEnd);
}

export function getAllMonthsInTrip(tripStart: Date, tripEnd: Date): Date[] {
  const months: Date[] = [];
  const normalizedStart = toCalendarDay(tripStart);
  const normalizedEnd = toCalendarDay(tripEnd);

  if (isNaN(normalizedStart.getTime()) || isNaN(normalizedEnd.getTime())) {
    return months;
  }

  let currentMonth = toCalendarDay(startOfMonth(normalizedStart));
  const lastMonth = toCalendarDay(startOfMonth(normalizedEnd));
  
  while (currentMonth <= lastMonth) {
    months.push(new Date(currentMonth.getTime()));
    // Move to next month
    currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
  }
  
  return months;
}

export function calculateLocationPeriodsForMonth(
  trip: Trip,
  month: Date,
  sideTripMap: Map<string, Location>
): CalendarDay[] {
  const tripStart = toCalendarDay(trip.startDate);
  const tripEnd = toCalendarDay(trip.endDate);
  const monthLocal = toCalendarDay(month);
  const monthDays = getCalendarDaysForMonth(monthLocal);
  
  return monthDays.map(date => {
    const normalizedDate = toCalendarDay(date);
    
    const isOutsideTrip = normalizedDate < tripStart || normalizedDate > tripEnd;
    const isOutsideMonth = normalizedDate.getMonth() !== monthLocal.getMonth();
    
    if (isOutsideTrip || isOutsideMonth) {
      return {
        date,
        locations: [],
        cellType: 'single' as const,
        isOutsideTrip,
        isOutsideMonth
      };
    }
    
    // Find locations that include this date
    const locationsOnDate = trip.locations.filter(location => {
      const locationStart = toCalendarDay(location.date);
      const locationEnd = location.endDate ? toCalendarDay(location.endDate) : locationStart;
      
      const normalizedLocationStart = locationStart;
      const normalizedLocationEnd = addDays(locationEnd, 1); // exclusive end
      
      return normalizedDate >= normalizedLocationStart && normalizedDate < normalizedLocationEnd;
    });
    
    // Sort locations by start date to ensure correct transition order
    const sortedLocations = locationsOnDate.sort((a, b) => {
      const dateA = toCalendarDay(a.date);
      const dateB = toCalendarDay(b.date);
      return dateA.getTime() - dateB.getTime();
    });

    const baseLocationForDay = sortedLocations.find(location => !sideTripMap.has(location.id));
    const sideTripLocations = baseLocationForDay
      ? sortedLocations.filter(location => {
          const base = sideTripMap.get(location.id);
          return base?.id === baseLocationForDay.id;
        })
      : [];

    let primaryLocation = sortedLocations[0];
    let secondaryLocation = sortedLocations[1];
    let locationsForDay = sortedLocations;
    let daySideTrips: Location[] | undefined;
    let baseLocation: Location | undefined = baseLocationForDay;
    let cellType: CalendarDay['cellType'] = 'single';

    if (baseLocationForDay && sideTripLocations.length > 0) {
      primaryLocation = baseLocationForDay;
      secondaryLocation = sideTripLocations[0];
      locationsForDay = [primaryLocation, ...sideTripLocations];
      daySideTrips = sideTripLocations;
      cellType = 'single';
    } else if (sortedLocations.length > 1) {
      primaryLocation = sortedLocations[0];
      secondaryLocation = sortedLocations[1];
      locationsForDay = sortedLocations;
      daySideTrips = undefined;
      baseLocation = primaryLocation;
      cellType = 'transition';
    }

    return {
      date,
      locations: locationsForDay,
      primaryLocation,
      secondaryLocation,
      sideTrips: daySideTrips,
      baseLocation,
      cellType,
      isOutsideTrip: false,
      isOutsideMonth: false
    };
  });
}

export function mergeAdjacentCells(calendarDays: CalendarDay[], locationColors: Map<string, string>): CalendarCell[] {
  const cells: CalendarCell[] = [];
  
  // Process calendar days in weekly chunks to maintain grid structure
  for (let week = 0; week < calendarDays.length; week += 7) {
    const weekDays = calendarDays.slice(week, Math.min(week + 7, calendarDays.length));
    
    let i = 0;
    while (i < weekDays.length) {
      const currentDay = weekDays[i];
      const currentLocation = currentDay.primaryLocation?.name;
      

      if (
        !currentLocation ||
        currentDay.isOutsideTrip ||
        currentDay.isOutsideMonth ||
        currentDay.cellType === 'transition' ||
        (currentDay.sideTrips && currentDay.sideTrips.length > 0)
      ) {
        // Single cell for empty, outside trip, outside month, or transition days
        cells.push(createSingleCell(currentDay, locationColors));
        i++;
        continue;
      }
      
      // Find consecutive days with same location within this week only
      let mergeEnd = i;
      while (
        mergeEnd + 1 < weekDays.length &&
        weekDays[mergeEnd + 1].primaryLocation?.name === currentLocation &&
        !weekDays[mergeEnd + 1].isOutsideTrip &&
        !weekDays[mergeEnd + 1].isOutsideMonth &&
        weekDays[mergeEnd + 1].cellType !== 'transition'
      ) {
        mergeEnd++;
      }
      
      const mergeLength = mergeEnd - i + 1;
      
      if (mergeLength > 1) {
        // Create merged cells
        for (let j = i; j <= mergeEnd; j++) {
          const position = j === i ? 'start' : j === mergeEnd ? 'end' : 'middle';
          cells.push(createMergedCell(
            weekDays[j],
            locationColors,
            mergeLength,
            position,
            `${currentLocation}-${week}-${i}`,
            j === i
          ));
        }
      } else {
        // Single cell
        cells.push(createSingleCell(currentDay, locationColors));
      }
      
      i = mergeEnd + 1;
    }
  }
  
  return cells;
}

function createSingleCell(day: CalendarDay, locationColors: Map<string, string>): CalendarCell {
  if (day.isOutsideTrip || day.isOutsideMonth) {
    return {
      day,
      backgroundColor: '#f3f4f6',
      textColor: '#4b5563'
    };
  }
  
  if (day.cellType === 'transition' && day.primaryLocation && day.secondaryLocation) {
    return createTransitionCell(day, locationColors);
  }
  
  const location = day.primaryLocation;
  const backgroundColor = location ? locationColors.get(location.name) || '#e5e7eb' : '#e5e7eb';
  
  return {
    day,
    backgroundColor,
    textColor: getContrastColor(backgroundColor)
  };
}

function createMergedCell(
  day: CalendarDay,
  locationColors: Map<string, string>,
  colspan: number,
  position: 'start' | 'middle' | 'end',
  groupId: string,
  isFirstInGroup: boolean
): CalendarCell {
  const location = day.primaryLocation;
  const backgroundColor = location ? locationColors.get(location.name) || '#e5e7eb' : '#e5e7eb';
  
  return {
    day,
    backgroundColor,
    textColor: getContrastColor(backgroundColor),
    mergeInfo: {
      colspan: isFirstInGroup ? colspan : 0,
      position,
      groupId
    }
  };
}

function createTransitionCell(day: CalendarDay, locationColors: Map<string, string>): CalendarCell {
  const fromLocation = day.primaryLocation!;  // Earlier start date
  const toLocation = day.secondaryLocation!;  // Later start date
  
  const fromColor = locationColors.get(fromLocation.name) || '#e5e7eb';
  const toColor = locationColors.get(toLocation.name) || '#e5e7eb';
  
  return {
    day,
    backgroundColor: 'transparent',
    textColor: '#000000',
    diagonalSplit: {
      topLeft: fromColor,     // Previous location color on top-left  
      bottomRight: toColor,   // New location color on bottom-right
      direction: 'A-to-B'
    }
  };
}

export async function generateTripCalendars(trip: Trip): Promise<{
  monthCalendars: MonthCalendar[];
  locationColors: Map<string, string>;
}> {
  const tripStart = toCalendarDay(trip.startDate);
  const tripEnd = toCalendarDay(trip.endDate);
  const months = getAllMonthsInTrip(tripStart, tripEnd);
  
  // Generate location colors first
  const locationColors = await generateLocationColors(trip.locations);
  const sideTripMap = buildSideTripMap(trip.locations);
  
  const monthCalendars = months.map(month => {
    // Calculate location periods for this specific month
    const calendarDays = calculateLocationPeriodsForMonth(trip, month, sideTripMap);
    
    // Create merged cells for this month
    const calendarCells = mergeAdjacentCells(calendarDays, locationColors);
    
    // Group cells into weeks (7 cells per week)
    const weeks: CalendarCell[][] = [];
    for (let i = 0; i < calendarCells.length; i += 7) {
      weeks.push(calendarCells.slice(i, i + 7));
    }
    
    return {
      month,
      weeks
    };
  });
  
  return {
    monthCalendars,
    locationColors
  };
}

export function applyPlanningModeColors(
  colors: Map<string, string>,
  locations: Location[],
  isPublic: (location: Location) => boolean = () => true
): Map<string, string> {
  const planningColors = new Map();
  
  colors.forEach((color, locationName) => {
    const location = locations.find(l => l.name === locationName);
    
    // Check if this is a shadow location (prefixed with SHADOW_LOCATION_PREFIX)
    const isShadowLocation = locationName.startsWith(SHADOW_LOCATION_PREFIX);
    
    if (isShadowLocation) {
      // Apply distinct styling for shadow locations - make them more muted with a slight blue tint
      const shadowColor = applyShadowStyling(color);
      planningColors.set(locationName, shadowColor);
    } else if (location && !isPublic(location)) {
      // Apply muted color for non-public real locations
      planningColors.set(locationName, muteColor(color, 0.6));
    } else {
      // Keep original color for public real locations
      planningColors.set(locationName, color);
    }
  });
  
  return planningColors;
}
