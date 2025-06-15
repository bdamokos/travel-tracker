import { Metadata } from 'next';
import { notFound } from 'next/navigation';
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
    // Use direct file reading for server-side rendering to avoid fetch issues
    if (typeof window === 'undefined') {
      const { readFile } = await import('fs/promises');
      const { join } = await import('path');
      
      try {
        const filePath = join(process.cwd(), 'data', `travel-${id}.json`);
        const fileContent = await readFile(filePath, 'utf-8');
        return JSON.parse(fileContent);
      } catch (fileError) {
        console.error('Error reading travel data file:', fileError);
        return null;
      }
    }
    
    // Use fetch for client-side requests
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 
                   (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
    
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
    <div className="min-h-screen bg-white">
      <div className="container mx-auto px-4 py-6">
        <header className="mb-6">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">{travelData.title}</h1>
          {travelData.description && (
            <p className="text-gray-600 mb-2">{travelData.description}</p>
          )}
          <p className="text-sm text-gray-500">
            {new Date(travelData.startDate).toLocaleDateString()} - {new Date(travelData.endDate).toLocaleDateString()}
          </p>
        </header>
        
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <div style={{ height: '600px' }}>
            <EmbeddableMap travelData={travelData} />
          </div>
        </div>
        
        {/* Location List */}
        {travelData.locations.length > 0 && (
          <div className="mt-6 bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Locations Visited</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {travelData.locations
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                .map((location, index) => (
                <div key={index} className="border rounded-lg p-4">
                  <h3 className="font-medium text-gray-800">{location.name}</h3>
                  <p className="text-sm text-gray-500 mb-2">
                    {new Date(location.date).toLocaleDateString()}
                  </p>
                  {location.notes && (
                    <p className="text-sm text-gray-600">{location.notes}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Embed Info */}
        <div className="mt-6 bg-gray-50 rounded-lg p-4">
          <h3 className="font-medium text-gray-800 mb-2">Embed this map</h3>
          <p className="text-sm text-gray-600 mb-2">
            Use this iframe code to embed the map in your blog:
          </p>
          <code className="block bg-white p-3 rounded border text-xs font-mono break-all">
            {`<iframe src="${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3001'}/embed/${travelData.id}" width="100%" height="600" frameborder="0"></iframe>`}
          </code>
        </div>
      </div>
    </div>
  );
} 