import { Metadata } from 'next';
import { notFound } from 'next/navigation';
// import { getEmbedUrl } from '../../lib/domains';
import EmbeddableMap from './components/EmbeddableMap';
import { formatDateRange } from '../../lib/dateUtils';
import { Location, Transportation } from '../../types';

interface TravelData {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  locations: Array<{
    id: string;
    name: string;
    coordinates: [number, number];
    date: string;
    endDate?: string;
    notes?: string;
    instagramPosts?: Array<{
      id: string;
      url: string;
      caption?: string;
    }>;
    blogPosts?: Array<{
      id: string;
      title: string;
      url: string;
      excerpt?: string;
    }>;
  }>;
  routes: Array<{
    id: string;
    from: string;
    to: string;
    fromCoords: [number, number];
    toCoords: [number, number];
    transportType: string;
    date: string;
    duration?: string;
    notes?: string;
    routePoints?: [number, number][]; // Pre-generated route points for better performance
  }>;
  createdAt: string;
}
async function getTravelData(id: string, isAdmin: boolean = false): Promise<TravelData | null> {
  try {
    // Use unified API for both server and client side
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    
    // In admin mode, try to load shadow data first, fallback to regular data
    if (isAdmin) {
      try {
        const shadowResponse = await fetch(`${baseUrl}/api/shadow-trips/${id}`, {
          cache: 'no-store'
        });
        
        if (shadowResponse.ok) {
          const shadowData = await shadowResponse.json();
          
          // Transform shadow data to TravelData format
          const transformedData: TravelData = {
            id: shadowData.id,
            title: shadowData.title,
            description: shadowData.description,
            startDate: shadowData.startDate,
            endDate: shadowData.endDate,
            createdAt: shadowData.createdAt,
            // Merge real locations with shadow locations
            locations: [
              ...(shadowData.travelData?.locations || []).map((loc: Location) => ({
                id: loc.id,
                name: loc.name,
                coordinates: loc.coordinates,
                date: loc.date,
                endDate: loc.endDate,
                notes: loc.notes,
                instagramPosts: loc.instagramPosts,
                blogPosts: loc.blogPosts,
              })),
              ...(shadowData.shadowData?.shadowLocations || []).map((loc: Location) => ({
                ...loc,
                name: `🔮 ${loc.name}` // Prefix shadow locations
              }))
            ],
            // Merge real routes with shadow routes
            routes: [
              ...(shadowData.travelData?.routes || []).map((route: Transportation) => ({
                id: route.id,
                from: route.from,
                to: route.to,
                fromCoords: (route as Transportation & { fromCoords?: [number, number] }).fromCoords || [0, 0],
                toCoords: (route as Transportation & { toCoords?: [number, number] }).toCoords || [0, 0],
                transportType: route.type,
                date: route.departureTime || route.date || '',
                duration: route.duration,
                notes: route.notes || route.privateNotes,
                routePoints: route.routePoints,
              })),
              ...(shadowData.shadowData?.shadowRoutes || []).map((route: Transportation) => ({
                id: route.id,
                from: `🔮 ${route.from}`,
                to: `🔮 ${route.to}`,
                fromCoords: [0, 0] as [number, number],
                toCoords: [0, 0] as [number, number],
                transportType: route.type,
                date: route.departureTime || '',
                duration: '',
                notes: route.privateNotes,
                routePoints: undefined,
              }))
            ]
          };
          
          return transformedData;
        }
      } catch (shadowError) {
        console.log('Shadow data not available, falling back to regular data');
      }
    }
    
    const response = await fetch(`${baseUrl}/api/travel-data?id=${id}`, {
      cache: 'no-store' // Always fetch fresh data
    });
    
    if (!response.ok) {
      return null;
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching travel data:', error);
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const travelData = await getTravelData(id);
  
  if (!travelData) {
    return {
      title: 'Travel Map Not Found',
    };
  }
  
  return {
    title: `${travelData.title} - Travel Map`,
    description: travelData.description || `Travel map from ${travelData.startDate} to ${travelData.endDate}`,
  };
}

export default async function MapPage({ params, searchParams }: { 
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const search = await searchParams;
  
  // Check if this is admin mode (either by domain or planningMode param)
  const isAdmin = search?.planningMode === 'true';
  
  const travelData = await getTravelData(id, isAdmin);
  
  if (!travelData) {
    notFound();
  }
  
  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      <div className="container mx-auto px-4 py-6">
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
                    You are viewing this map with shadow planning data. Shadow locations and routes are marked with 🔮.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
        
        <header className="mb-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-2">
                {travelData.title}
                {isAdmin && <span className="ml-2 text-sm text-blue-600 dark:text-blue-400">🔮 Planning Mode</span>}
              </h1>
              {travelData.description && (
                <p className="text-gray-600 dark:text-gray-300 mb-2">{travelData.description}</p>
              )}
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {new Date(travelData.startDate).toLocaleDateString()} - {new Date(travelData.endDate).toLocaleDateString()}
              </p>
            </div>
            <a 
              href={`/calendars/${travelData.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-4 py-2 border border-purple-300 rounded-md shadow-sm bg-white text-sm font-medium text-purple-700 hover:bg-purple-50 dark:bg-gray-700 dark:border-purple-600 dark:text-purple-300 dark:hover:bg-gray-600"
            >
              📅 View Calendar
            </a>
          </div>
        </header>
        
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden">
          <div style={{ height: '600px' }}>
            <EmbeddableMap travelData={travelData} />
          </div>
        </div>
        
        {/* Location List */}
        {travelData.locations.length > 0 && (
          <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">Locations Visited</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {travelData.locations
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                .map((location, index) => (
                <div key={index} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                  <h3 className="font-medium text-gray-800 dark:text-white">{location.name}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                    {formatDateRange(location.date, location.endDate)}
                  </p>
                  {location.notes && (
                    <p className="text-sm text-gray-600 dark:text-gray-300">{location.notes}</p>
                  )}
                  
                  {/* Display Blog Posts */}
                  {location.blogPosts && location.blogPosts.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                      <div className="space-y-2">
                        {location.blogPosts.map((post, postIndex) => (
                          <div key={post.id || postIndex}>
                            <a
                              href={post.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300 text-sm font-medium underline block"
                              title={post.title}
                            >
                              📝 {post.title}
                            </a>
                            {post.excerpt && (
                              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{post.excerpt}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Display Instagram Posts */}
                  {location.instagramPosts && location.instagramPosts.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                      <div className="space-y-2">
                        {location.instagramPosts.map((post, postIndex) => (
                          <div key={post.id || postIndex}>
                            <a
                              href={post.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm underline block"
                              title={post.caption || post.url}
                            >
                              📸 Instagram Post
                            </a>
                            {post.caption && (
                              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{post.caption}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Embed Info */}
        {/* <div className="mt-6 bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
          <h3 className="font-medium text-gray-800 dark:text-white mb-2">Embed this map</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
            Use this iframe code to embed the map in your blog:
          </p>
          <code className="block bg-white dark:bg-gray-700 p-3 rounded-sm border border-gray-200 dark:border-gray-600 text-xs font-mono break-all text-gray-900 dark:text-gray-100">
            {`<iframe src="${getEmbedUrl(travelData.id)}" width="100%" height="600" frameborder="0"></iframe>`}
          </code>
        </div> */}
      </div>
    </div>
  );
} 