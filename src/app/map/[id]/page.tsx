import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getEmbedUrl } from '../../lib/domains';
import EmbeddableMap from './components/EmbeddableMap';

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
  }>;
  createdAt: string;
}

async function getTravelData(id: string): Promise<TravelData | null> {
  try {
    // Use direct unified data service for server-side rendering
    if (typeof window === 'undefined') {
      const { loadUnifiedTripData } = await import('../../lib/unifiedDataService');
      const unifiedData = await loadUnifiedTripData(id);
      
      if (!unifiedData || !unifiedData.travelData) {
        return null;
      }
      
      // Transform unified data to legacy format for compatibility
      return {
        id: unifiedData.id,
        title: unifiedData.title,
        description: unifiedData.description,
        startDate: unifiedData.startDate,
        endDate: unifiedData.endDate,
        locations: unifiedData.travelData.locations || [],
        routes: (unifiedData.travelData.routes || []).map(route => ({
          id: route.id,
          from: route.from,
          to: route.to,
          fromCoords: route.fromCoordinates || [0, 0],
          toCoords: route.toCoordinates || [0, 0],
          transportType: route.type,
          date: route.departureTime || '',
          duration: undefined, // Transportation interface doesn't have duration
          notes: route.privateNotes
        })),
        createdAt: unifiedData.createdAt
      };
    }
    
    // Use fetch for client-side requests
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    
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

export default async function MapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const travelData = await getTravelData(id);
  
  if (!travelData) {
    notFound();
  }
  
  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      <div className="container mx-auto px-4 py-6">
        <header className="mb-6">
          <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-2">{travelData.title}</h1>
          {travelData.description && (
            <p className="text-gray-600 dark:text-gray-300 mb-2">{travelData.description}</p>
          )}
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {new Date(travelData.startDate).toLocaleDateString()} - {new Date(travelData.endDate).toLocaleDateString()}
          </p>
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
                    {new Date(location.date).toLocaleDateString()}
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
        <div className="mt-6 bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
          <h3 className="font-medium text-gray-800 dark:text-white mb-2">Embed this map</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
            Use this iframe code to embed the map in your blog:
          </p>
          <code className="block bg-white dark:bg-gray-700 p-3 rounded-sm border border-gray-200 dark:border-gray-600 text-xs font-mono break-all text-gray-900 dark:text-gray-100">
            {`<iframe src="${getEmbedUrl(travelData.id)}" width="100%" height="600" frameborder="0"></iframe>`}
          </code>
        </div>
      </div>
    </div>
  );
} 