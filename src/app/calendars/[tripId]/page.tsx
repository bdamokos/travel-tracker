import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import Link from 'next/link';
import { TripCalendar } from '@/app/components/TripCalendar';
import TripUpdates from '@/app/components/TripUpdates';
import { loadUnifiedTripData } from '@/app/lib/unifiedDataService';
import { buildPublicCalendarTrip } from '@/app/lib/calendarPrivacy';
import { isAdminHost } from '@/app/lib/server-domains';
import { loadShadowTrip } from '@/app/lib/shadowTripStorage';
import { filterNonOverlappingShadowPlans } from '@/app/lib/mapShadowData';
import { Location, Transportation, Accommodation } from '@/app/types';
import { filterUpdatesForPublic } from '@/app/lib/updateFilters';
import { SHADOW_LOCATION_PREFIX } from '@/app/lib/shadowConstants';

interface CalendarPageProps {
  params: Promise<{
    tripId: string;
  }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tripId: string }>;
}): Promise<Metadata> {
  const { tripId } = await params;
  const tripData = await loadUnifiedTripData(tripId);

  if (!tripData) {
    return {
      title: 'Trip Calendar Not Found',
    };
  }

  return {
    title: `${tripData.title} - Trip Calendar`,
    description: tripData.description || `Trip calendar for ${tripData.title}`,
    alternates: {
      types: {
        'application/rss+xml': `/api/travel-data/${encodeURIComponent(tripId)}/updates/rss`,
      },
    },
  };
}

async function loadTripDataWithShadow(tripId: string, isAdmin: boolean) {
  const tripData = await loadUnifiedTripData(tripId);

  if (!tripData) {
    return null;
  }

  if (isAdmin) {
    try {
      const shadowTrip = await loadShadowTrip(tripId);

      if (shadowTrip) {
        const shadowData = {
          ...tripData,
          shadowData: {
            shadowLocations: shadowTrip.shadowLocations,
            shadowRoutes: shadowTrip.shadowRoutes,
            shadowAccommodations: shadowTrip.shadowAccommodations,
          },
        };

        // Build coverage from real plans and filter shadow items that overlap
        const realLocations: Location[] = shadowData.travelData?.locations || [];
        const realRoutes: Transportation[] = shadowData.travelData?.routes || [];
        const shadowLocations: Location[] = shadowData.shadowData?.shadowLocations || [];
        const shadowRoutes: Transportation[] = shadowData.shadowData?.shadowRoutes || [];

        const { filteredShadowLocations, filteredShadowRoutes } = filterNonOverlappingShadowPlans({
          realLocations,
          realRoutes,
          shadowLocations,
          shadowRoutes,
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
                name: `${SHADOW_LOCATION_PREFIX} ${loc.name}`, // Prefix shadow locations
                notes: loc.notes ? `${SHADOW_LOCATION_PREFIX} PLANNED: ${loc.notes}` : `${SHADOW_LOCATION_PREFIX} PLANNED LOCATION`
              }))
            ],
            // Merge real routes with shadow routes  
            routes: [
              ...(shadowData.travelData?.routes || []),
              ...filteredShadowRoutes.map((route: Transportation) => ({
                ...route,
                from: `${SHADOW_LOCATION_PREFIX} ${route.from}`,
                to: `${SHADOW_LOCATION_PREFIX} ${route.to}`,
                privateNotes: route.privateNotes ? `${SHADOW_LOCATION_PREFIX} PLANNED: ${route.privateNotes}` : `${SHADOW_LOCATION_PREFIX} PLANNED ROUTE`
              }))
            ]
          },
          // Merge real accommodations with shadow accommodations
          accommodations: [
            ...(shadowData.accommodations || []),
            ...(shadowData.shadowData?.shadowAccommodations || []).map((acc: Accommodation) => ({
              ...acc,
              name: `${SHADOW_LOCATION_PREFIX} ${acc.name}`,
              accommodationData: acc.accommodationData ? `${SHADOW_LOCATION_PREFIX} PLANNED: ${acc.accommodationData}` : `${SHADOW_LOCATION_PREFIX} PLANNED ACCOMMODATION`
            }))
          ]
        };
      }
    } catch {
      console.log('Shadow data not available, falling back to regular data');
    }
  }
  
  // Fallback to regular data
  return tripData;
}

export default async function TripCalendarPage({ params }: CalendarPageProps) {
  const { tripId } = await params;
  
  // Check if this is admin mode based on domain
  const headersList = await headers();
  const host = headersList.get('host');
  const isAdmin = isAdminHost(host);

  let tripData: Awaited<ReturnType<typeof loadTripDataWithShadow>>;
  try {
    tripData = await loadTripDataWithShadow(tripId, isAdmin);
  } catch (error) {
    console.error('Error loading trip calendar:', error);
    notFound();
  }

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
  const displayTrip = isAdmin ? trip : buildPublicCalendarTrip(trip);

  const updates = isAdmin
    ? tripData.publicUpdates
    : filterUpdatesForPublic(tripData.publicUpdates, displayTrip.locations, displayTrip.routes);

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Page Title */}
      <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-6">
        {displayTrip.title}
      </h1>

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
              <h2 className="text-lg font-semibold text-blue-800 dark:text-blue-200">
                Planning Mode Active
              </h2>
              <div className="mt-2 text-sm text-blue-700 dark:text-blue-300">
                <p>
                  You are viewing this calendar with shadow planning data. Shadow items are marked with {SHADOW_LOCATION_PREFIX}.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header with View Map button */}
      <div className="flex justify-end mb-6">
        <Link
          href={`/map/${tripId}`}
          className="inline-flex items-center px-4 py-2 border border-purple-300 rounded-md shadow-sm bg-white text-sm font-medium text-purple-700 hover:bg-purple-50 dark:bg-gray-700 dark:border-purple-600 dark:text-purple-300 dark:hover:bg-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900"
        >
          View Map
        </Link>
      </div>

      <TripCalendar trip={displayTrip} planningMode={isAdmin} className="w-full">
        <TripUpdates
          updates={updates}
          className="mb-6"
          locations={displayTrip.locations}
          routes={displayTrip.routes}
        />
      </TripCalendar>
    </div>
  );
}
