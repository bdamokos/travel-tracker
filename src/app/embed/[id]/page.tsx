import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getMapUrl } from '../../lib/domains';
import EmbeddableMap from '../../map/[id]/components/EmbeddableMap';

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
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    
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
            min-height: 100vh;
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
          
          .description {
            font-size: 13px;
            color: #495057;
            margin: 6px 0 0 0;
            line-height: 1.4;
          }
          
          .map-container {
            height: 400px;
            position: relative;
            flex-shrink: 0;
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
          
          .locations-section {
            padding: 16px;
            background: #f8f9fa;
          }
          
          .section-title {
            font-size: 16px;
            font-weight: 600;
            color: #212529;
            margin: 0 0 12px 0;
          }
          
          .locations-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 12px;
          }
          
          .location-card {
            background: white;
            border: 1px solid #e9ecef;
            border-radius: 8px;
            padding: 12px;
          }
          
          .location-name {
            font-size: 14px;
            font-weight: 600;
            color: #212529;
            margin: 0 0 4px 0;
          }
          
          .location-date {
            font-size: 12px;
            color: #6c757d;
            margin: 0 0 6px 0;
          }
          
          .location-notes {
            font-size: 12px;
            color: #495057;
            margin: 0 0 8px 0;
            line-height: 1.4;
          }
          
          .posts-section {
            margin-top: 8px;
            padding-top: 8px;
            border-top: 1px solid #e9ecef;
          }
          
          .posts-header {
            font-size: 11px;
            font-weight: 600;
            color: #495057;
            margin-bottom: 4px;
          }
          
          .post-link {
            margin-bottom: 4px;
          }
          
          .post-link a {
            font-size: 11px;
            color: #007bff;
            text-decoration: none;
          }
          
          .post-link a:hover {
            text-decoration: underline;
          }
          
          .post-excerpt {
            font-size: 10px;
            color: #6c757d;
            margin-top: 2px;
            line-height: 1.3;
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
          {travelData.description && (
            <p className="description">{travelData.description}</p>
          )}
        </div>
        
        <div className="map-container">
          <EmbeddableMap travelData={travelData} />
          <div className="attribution">
            <a href={getMapUrl(travelData.id)} target="_blank" rel="noopener">
              View full map
            </a>
          </div>
        </div>

        {/* Location List */}
        {travelData.locations.length > 0 && (
          <div className="locations-section">
            <h2 className="section-title">Locations Visited</h2>
            <div className="locations-grid">
              {travelData.locations
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                .map((location, index) => (
                <div key={index} className="location-card">
                  <h3 className="location-name">{location.name}</h3>
                  <p className="location-date">
                    {new Date(location.date).toLocaleDateString()}
                  </p>
                  {location.notes && (
                    <p className="location-notes">{location.notes}</p>
                  )}
                  
                  {/* Instagram Posts */}
                  {location.instagramPosts && location.instagramPosts.length > 0 && (
                    <div className="posts-section">
                      <div className="posts-header">📷 Instagram:</div>
                      {location.instagramPosts.map((post, postIndex) => (
                        <div key={postIndex} className="post-link">
                          <a href={post.url} target="_blank" rel="noopener">
                            {post.caption || 'View Post'}
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {/* Blog Posts */}
                  {location.blogPosts && location.blogPosts.length > 0 && (
                    <div className="posts-section">
                      <div className="posts-header">📝 Blog:</div>
                      {location.blogPosts.map((post, postIndex) => (
                        <div key={postIndex} className="post-link">
                          <a href={post.url} target="_blank" rel="noopener">
                            {post.title}
                          </a>
                          {post.excerpt && (
                            <div className="post-excerpt">{post.excerpt}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </body>
    </html>
  );
} 