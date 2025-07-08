import { Metadata } from 'next';
import Link from 'next/link';
import { listAllTrips, loadUnifiedTripData } from '../lib/unifiedDataService';

interface TravelMap {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  locationCount: number;
}

export const metadata: Metadata = {
  title: 'Travel Maps - Explore My Journeys',
  description: 'Browse interactive travel maps showing my journeys around the world.',
};

async function getTravelMaps(): Promise<TravelMap[]> {
  try {
    const trips = await listAllTrips();
    const travelTrips = trips.filter(trip => trip.hasTravel);
    
    const maps: TravelMap[] = [];
    
    for (const trip of travelTrips) {
      try {
        const fullData = await loadUnifiedTripData(trip.id);
        if (fullData && fullData.travelData) {
          maps.push({
            id: trip.id,
            title: trip.title || 'Untitled Journey',
            description: fullData.description || '',
            startDate: trip.startDate,
            endDate: trip.endDate,
            createdAt: trip.createdAt,
            locationCount: fullData.travelData.locations?.length || 0,
          });
        }
      } catch (error) {
        console.error(`Error reading trip ${trip.id}:`, error);
      }
    }
    
    // Sort by creation date (newest first)
    return maps.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch (error) {
    console.error('Error loading travel maps:', error);
    return [];
  }
}

export default async function PublicMapsPage() {
  const maps = await getTravelMaps();
  
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <header className="mb-8 text-center">
            <h1 className="text-4xl font-bold text-gray-800 dark:text-white mb-4">
              Travel Maps
            </h1>
            <p className="text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
              Explore interactive maps of my journeys around the world. Click on any map to see the detailed view.
            </p>
          </header>
          
          {maps.length === 0 ? (
            <div className="text-center py-12">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
                <h2 className="text-2xl font-semibold text-gray-700 dark:text-gray-200 mb-4">No Travel Maps Yet</h2>
                <p className="text-gray-600 dark:text-gray-400">
                  Travel maps will appear here once they&apos;re created. Check back soon!
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {maps.map((map) => (
                <Link
                  key={map.id}
                  href={`/map/${map.id}`}
                  className="block bg-white dark:bg-gray-800 rounded-lg shadow-lg hover:shadow-xl transition-shadow duration-300 overflow-hidden"
                >
                  <div className="p-6">
                    <h3 className="text-xl font-semibold text-gray-800 dark:text-white mb-2">
                      {map.title}
                    </h3>
                    {map.description && (
                      <p className="text-gray-600 dark:text-gray-300 mb-4 line-clamp-3">
                        {map.description}
                      </p>
                    )}
                    
                    <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400 mb-3">
                      <span>
                        {new Date(map.startDate).toLocaleDateString()} - {new Date(map.endDate).toLocaleDateString()}
                      </span>
                      <span className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded-full text-xs">
                        {map.locationCount} location{map.locationCount !== 1 ? 's' : ''}
                      </span>
                    </div>
                    
                    <div className="flex items-center text-blue-600 dark:text-blue-400 font-medium">
                      View Map
                      <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
      
      {/* Footer */}
      <footer className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 mt-12">
        <div className="container mx-auto px-4 py-6">
          <div className="max-w-6xl mx-auto text-center">
            <p className="text-gray-600 dark:text-gray-400">
             
              <a 
                href={process.env.NEXT_PUBLIC_GITHUB_REPO_URL || "https://github.com/bdamokos/travel-tracker"} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline ml-2 font-medium"
              >
                View source code on GitHub
              </a>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
} 