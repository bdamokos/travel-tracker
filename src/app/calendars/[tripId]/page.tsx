import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { TripCalendar } from '@/app/components/TripCalendar';
import { loadUnifiedTripData } from '@/app/lib/unifiedDataService';
import { Location, Transportation, Accommodation } from '@/app/types';
import { normalizeUtcDateToLocalDay } from '@/app/lib/dateUtils';

interface CalendarPageProps {
  params: Promise<{
    tripId: string;
  }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}

async function loadTripDataWithShadow(tripId: string, isAdmin: boolean) {
  if (isAdmin) {
    try {
      // Try to load shadow data first
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
      const response = await fetch(`${baseUrl}/api/shadow-trips/${tripId}`, {
        cache: 'no-store'
      });
      
      if (response.ok) {
        const shadowData = await response.json();

        // Build coverage from real plans and filter shadow items that overlap
        const realLocations: Location[] = shadowData.travelData?.locations || [];
        const realRoutes: Transportation[] = shadowData.travelData?.routes || [];
        const shadowLocations: Location[] = shadowData.shadowData?.shadowLocations || [];
        const shadowRoutes: Transportation[] = shadowData.shadowData?.shadowRoutes || [];

        const toStartOfDay = (d: Date) => {
          const normalized = normalizeUtcDateToLocalDay(d) || new Date(d);
          normalized.setHours(0, 0, 0, 0);
          return normalized.getTime();
        };
        const toEndOfDay = (d: Date) => {
          const normalized = normalizeUtcDateToLocalDay(d) || new Date(d);
          normalized.setHours(23, 59, 59, 999);
          return normalized.getTime();
        };
        const safeDate = (value?: string | Date) => {
          if (!value) return null;
          const d = value instanceof Date ? value : new Date(value);
          return isNaN(d.getTime()) ? null : d;
        };

        type Interval = { start: number; end: number };
        const realIntervals: Interval[] = [];
        // Real locations coverage
        for (const loc of realLocations) {
          const startDate = safeDate((loc as any).date); // eslint-disable-line @typescript-eslint/no-explicit-any
          const endDate = safeDate((loc as any).endDate || (loc as any).date); // eslint-disable-line @typescript-eslint/no-explicit-any
          if (startDate && endDate) {
            realIntervals.push({ start: toStartOfDay(startDate), end: toEndOfDay(endDate) });
          }
        }
        // Real routes coverage
        for (const route of realRoutes) {
          const dep = safeDate((route as any).departureTime); // eslint-disable-line @typescript-eslint/no-explicit-any
          const arr = safeDate((route as any).arrivalTime || (route as any).departureTime); // eslint-disable-line @typescript-eslint/no-explicit-any
          if (dep && arr) {
            realIntervals.push({ start: toStartOfDay(dep), end: toEndOfDay(arr) });
          }
        }
        const overlaps = (start: number, end: number) => realIntervals.some(i => start <= i.end && end >= i.start);

        const filteredShadowLocations: Location[] = shadowLocations.filter(loc => {
          const startDate = safeDate((loc as any).date); // eslint-disable-line @typescript-eslint/no-explicit-any
          const endDate = safeDate((loc as any).endDate || (loc as any).date); // eslint-disable-line @typescript-eslint/no-explicit-any
          if (!startDate || !endDate) return true;
          const s = toStartOfDay(startDate);
          const e = toEndOfDay(endDate);
          return !overlaps(s, e);
        });

        const filteredShadowRoutes: Transportation[] = shadowRoutes.filter(route => {
          const dep = safeDate((route as any).departureTime); // eslint-disable-line @typescript-eslint/no-explicit-any
          const arr = safeDate((route as any).arrivalTime || (route as any).departureTime); // eslint-disable-line @typescript-eslint/no-explicit-any
          if (!dep || !arr) return true;
          const s = toStartOfDay(dep);
          const e = toEndOfDay(arr);
          return !overlaps(s, e);
        });

        // Merge real data with shadow data
        return {
          ...shadowData,
          travelData: {
            ...shadowData.travelData,
            // Merge real locations with shadow locations
            locations: [
              ...(shadowData.travelData?.locations || []),
              ...filteredShadowLocations.map((loc: Location) => ({
                ...loc,
                name: `🔮 ${loc.name}`, // Prefix shadow locations
                notes: loc.notes ? `🔮 PLANNED: ${loc.notes}` : '🔮 PLANNED LOCATION'
              }))
            ],
            // Merge real routes with shadow routes  
            routes: [
              ...(shadowData.travelData?.routes || []),
              ...filteredShadowRoutes.map((route: Transportation) => ({
                ...route,
                from: `🔮 ${route.from}`,
                to: `🔮 ${route.to}`,
                privateNotes: route.privateNotes ? `🔮 PLANNED: ${route.privateNotes}` : '🔮 PLANNED ROUTE'
              }))
            ]
          },
          // Merge real accommodations with shadow accommodations
          accommodations: [
            ...(shadowData.accommodations || []),
            ...(shadowData.shadowData?.shadowAccommodations || []).map((acc: Accommodation) => ({
              ...acc,
              name: `🔮 ${acc.name}`,
              accommodationData: acc.accommodationData ? `🔮 PLANNED: ${acc.accommodationData}` : '🔮 PLANNED ACCOMMODATION'
            }))
          ]
        };
      }
    } catch {
      console.log('Shadow data not available, falling back to regular data');
    }
  }
  
  // Fallback to regular data
  return await loadUnifiedTripData(tripId);
}

export default async function TripCalendarPage({ params }: CalendarPageProps) {
  const { tripId } = await params;
  
  // Check if this is admin mode based on domain
  const headersList = await headers();
  const host = headersList.get('host');
  const isAdmin = Boolean(host?.includes('tt-admin') || host?.includes('localhost'));
  
  try {
    const tripData = await loadTripDataWithShadow(tripId, isAdmin);
    
    if (!tripData || !tripData.travelData) {
      notFound();
    }

    // Create Trip-compatible object by flattening UnifiedTripData
    const trip = {
      ...tripData, // This gives us id, title, description, startDate, endDate, etc.
      locations: tripData.travelData.locations || [],
      routes: tripData.travelData.routes || [],
      accommodations: tripData.accommodations || [],
      isArchived: false, // Default for public view
    };

    // In admin/planning mode, show all data including shadow data
    // In public mode, filter for public locations only
    const displayTrip = isAdmin ? trip : {
      ...trip,
      locations: trip.locations.filter((location: Location) => {
        // Temporary workaround: check for [PRIVATE] in notes
        // TODO: Replace with proper isPublic boolean field when Issue #28 is implemented
        return !location.notes?.includes('[PRIVATE]');
      }),
      routes: trip.routes.filter((route: Transportation) => {
        // Temporary workaround: filter out routes with private notes
        // TODO: Replace with proper public/private route flags when Issue #28 is implemented
        return !route.privateNotes;
      })
    };

    return (
      <div className="container mx-auto px-4 py-8">
        {/* Planning Mode Banner */}
        {isAdmin && (
          <div className="mb-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-blue-800 dark:text-blue-200">
                  Planning Mode Active
                </h3>
                <div className="mt-2 text-sm text-blue-700 dark:text-blue-300">
                  <p>
                    You are viewing this calendar with shadow planning data. Shadow items are marked with 🔮.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
        
        <TripCalendar 
          trip={displayTrip} 
          planningMode={isAdmin}
          className="w-full"
        />
        
        {/* Navigation back to map */}
        <div className="mt-8 text-center">
          <a 
            href={`/map/${trip.id}`}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            ← View Map
          </a>
        </div>
      </div>
    );
  } catch (error) {
    console.error('Error loading trip calendar:', error);
    notFound();
  }
}
