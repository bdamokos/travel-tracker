import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import EmbeddableMap from '../../map/[id]/components/EmbeddableMap';

interface TravelData {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  locations: Array<{
    name: string;
    coordinates: [number, number];
    date: string;
    notes?: string;
  }>;
  routes: Array<{
    from: string;
    to: string;
    fromCoords: [number, number];
    toCoords: [number, number];
    transportType: string;
    date: string;
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
      cache: 'no-store'
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
  
  return {
    title: travelData ? `${travelData.title} - Travel Map` : 'Travel Map',
    description: travelData?.description || 'Interactive travel map',
  };
}

export default async function EmbedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const travelData = await getTravelData(id);
  
  if (!travelData) {
    notFound();
  }
  
  return (
    <html>
      <head>
        <title>{`${travelData.title} - Travel Map`}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>{`
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            background: white;
            height: 100vh;
            display: flex;
            flex-direction: column;
          }
          
          .header {
            background: #f8f9fa;
            padding: 12px 16px;
            border-bottom: 1px solid #e9ecef;
            flex-shrink: 0;
          }
          
          .title {
            font-size: 18px;
            font-weight: 600;
            color: #212529;
            margin: 0;
          }
          
          .subtitle {
            font-size: 12px;
            color: #6c757d;
            margin: 2px 0 0 0;
          }
          
          .map-container {
            flex: 1;
            position: relative;
          }
          
          .attribution {
            position: absolute;
            bottom: 8px;
            right: 8px;
            background: rgba(255, 255, 255, 0.8);
            padding: 2px 6px;
            font-size: 10px;
            color: #666;
            border-radius: 3px;
            z-index: 1000;
          }
          
          .attribution a {
            color: #007bff;
            text-decoration: none;
          }
        `}</style>
      </head>
      <body>
        <div className="header">
          <h1 className="title">{travelData.title}</h1>
          <p className="subtitle">
            {new Date(travelData.startDate).toLocaleDateString()} - {new Date(travelData.endDate).toLocaleDateString()}
            {travelData.locations.length > 0 && ` • ${travelData.locations.length} locations`}
          </p>
        </div>
        
        <div className="map-container">
          <EmbeddableMap travelData={travelData} />
          <div className="attribution">
            <a href={`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3001'}/map/${travelData.id}`} target="_blank" rel="noopener">
              View full map
            </a>
          </div>
        </div>
      </body>
    </html>
  );
} 