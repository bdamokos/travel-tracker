import { notFound } from 'next/navigation';
import { TripCalendar } from '@/app/components/TripCalendar';
import { loadUnifiedTripData } from '@/app/lib/unifiedDataService';

interface CalendarPageProps {
  params: Promise<{
    tripId: string;
  }>;
}

export default async function TripCalendarPage({ params }: CalendarPageProps) {
  const { tripId } = await params;
  try {
    const tripData = await loadUnifiedTripData(tripId);
    
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

    // Filter for public locations only (TECHNICAL DEBT - see Serena memory: calendar-planning-mode-technical-debt)
    const publicTrip = {
      ...trip,
      locations: trip.locations.filter(location => {
        // Temporary workaround: check for [PRIVATE] in notes
        // TODO: Replace with proper isPublic boolean field when Issue #28 is implemented
        return !location.notes?.includes('[PRIVATE]');
      }),
      routes: trip.routes.filter(route => {
        // Temporary workaround: filter out routes with private notes
        // TODO: Replace with proper public/private route flags when Issue #28 is implemented
        return !route.privateNotes;
      })
    };

    return (
      <div className="container mx-auto px-4 py-8">
        <TripCalendar 
          trip={publicTrip} 
          planningMode={false}
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