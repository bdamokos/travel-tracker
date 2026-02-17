import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { getDomainConfig } from '@/app/lib/domains';
import EmbeddableMap from './components/EmbeddableMap';
import { formatDateRange, formatUtcDate, normalizeUtcDateToLocalDay } from '@/app/lib/dateUtils';
import { Location, Transportation, type MapTravelData } from '@/app/types';
import InstagramIcon from '@/app/components/icons/InstagramIcon';
import TikTokIcon from '@/app/components/icons/TikTokIcon';
import TripUpdates from '@/app/components/TripUpdates';
import { filterUpdatesForPublic } from '@/app/lib/updateFilters';
import { SHADOW_LOCATION_PREFIX } from '@/app/lib/shadowConstants';
import { toMapRouteSegment } from '@/app/lib/mapRouteTransform';

const toMapDateString = (value?: string | Date): string | undefined => {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
};

async function getTravelData(id: string, isAdmin: boolean = false): Promise<MapTravelData | null> {
  try {
    const { embedDomain } = getDomainConfig();
    const baseUrl = embedDomain || 'http://localhost:3000';
    
    // In admin mode, try to load shadow data first, fallback to regular data
    if (isAdmin) {
      try {
        const shadowResponse = await fetch(`${baseUrl}/api/shadow-trips/${id}`, {
          cache: 'no-store'
        });
        
        if (shadowResponse.ok) {
          const shadowData = await shadowResponse.json();

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

          // Transform shadow data to TravelData format
          const transformedData: MapTravelData = {
            id: shadowData.id,
            title: shadowData.title,
            description: shadowData.description,
            startDate: shadowData.startDate,
            endDate: shadowData.endDate,
            createdAt: shadowData.createdAt,
            publicUpdates: shadowData.publicUpdates || [],
            // Merge real locations with shadow locations
            locations: [
              ...(shadowData.travelData?.locations || []).map((loc: Location) => ({
                id: loc.id,
                name: loc.name,
                coordinates: loc.coordinates,
                date: toMapDateString(loc.date) ?? '',
                endDate: toMapDateString(loc.endDate),
                notes: loc.notes,
                wikipediaRef: loc.wikipediaRef,
                instagramPosts: loc.instagramPosts,
                tikTokPosts: loc.tikTokPosts,
                blogPosts: loc.blogPosts,
              })),
              ...filteredShadowLocations.map((loc: Location) => ({
                id: loc.id,
                name: `${SHADOW_LOCATION_PREFIX} ${loc.name}`, // Prefix shadow locations
                coordinates: loc.coordinates,
                date: toMapDateString(loc.date) ?? '',
                endDate: toMapDateString(loc.endDate),
                notes: loc.notes,
                wikipediaRef: loc.wikipediaRef,
                instagramPosts: loc.instagramPosts,
                tikTokPosts: loc.tikTokPosts,
                blogPosts: loc.blogPosts,
              }))
            ],
            // Merge real routes with shadow routes
            routes: [
              ...(shadowData.travelData?.routes || []).map((route: Transportation) => toMapRouteSegment(route)),
              ...filteredShadowRoutes.map((route: Transportation) => {
                const baseRoute = toMapRouteSegment(route);
                return {
                  ...baseRoute,
                  from: `${SHADOW_LOCATION_PREFIX} ${route.from}`,
                  to: `${SHADOW_LOCATION_PREFIX} ${route.to}`,
                  subRoutes: baseRoute.subRoutes?.map(segment => ({
                    ...segment,
                    from: `${SHADOW_LOCATION_PREFIX} ${segment.from}`,
                    to: `${SHADOW_LOCATION_PREFIX} ${segment.to}`
                  }))
                };
              })
            ]
          };
          
          return transformedData;
        }
      } catch {
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
    alternates: {
      types: {
        'application/rss+xml': `/api/travel-data/${encodeURIComponent(id)}/updates/rss`
      }
    }
  };
}

export default async function MapPage({ params }: { 
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  
  // Check if this is admin mode based on domain
  const headersList = await headers();
  const host = headersList.get('host');
  const isAdmin = Boolean(host?.includes('tt-admin') || host?.includes('localhost'));
  
  const travelData = await getTravelData(id, isAdmin);
  
  if (!travelData) {
    notFound();
  }

  const updates = isAdmin
    ? travelData.publicUpdates
    : filterUpdatesForPublic(travelData.publicUpdates, travelData.locations, travelData.routes);
  
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
                    You are viewing this map with shadow planning data. Shadow locations and routes are marked with {SHADOW_LOCATION_PREFIX}.
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
                {isAdmin && <span className="ml-2 text-sm text-blue-600 dark:text-blue-400">{SHADOW_LOCATION_PREFIX} Planning Mode</span>}
              </h1>
              {travelData.description && (
                <p className="text-gray-600 dark:text-gray-300 mb-2">{travelData.description}</p>
              )}
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {formatUtcDate(travelData.startDate)} - {formatUtcDate(travelData.endDate)}
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

        <TripUpdates
          updates={updates}
          className="mb-6"
          locations={travelData.locations}
          routes={travelData.routes}
        />

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
                              className="text-green-700 dark:text-green-300 hover:text-green-800 dark:hover:text-green-200 text-sm font-medium underline block"
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
                              className="flex items-center space-x-2 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm font-medium underline"
                              title={post.caption || post.url}
                            >
                              <InstagramIcon
                                containerClassName="w-6 h-6"
                                iconClassName="w-3.5 h-3.5"
                                ariaLabel="Instagram"
                              />
                              <span>{post.caption || 'Instagram Post'}</span>
                            </a>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Display TikTok Posts */}
                  {location.tikTokPosts && location.tikTokPosts.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                      <div className="space-y-2">
                        {location.tikTokPosts.map((post, postIndex) => (
                          <div key={post.id || postIndex}>
                            <a
                              href={post.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center space-x-2 text-gray-700 dark:text-gray-200 hover:text-gray-900 dark:hover:text-white text-sm font-medium underline"
                              title={post.caption || post.url}
                            >
                              <TikTokIcon
                                containerClassName="w-6 h-6"
                                iconClassName="w-3.5 h-3.5"
                                ariaLabel="TikTok"
                              />
                              <span>{post.caption || 'TikTok Clip'}</span>
                            </a>
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
