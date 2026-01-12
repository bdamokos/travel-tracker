import { NextRequest, NextResponse } from 'next/server';
import { updateTravelData, loadUnifiedTripData, deleteTripWithBackup } from '../../lib/unifiedDataService';
import { filterTravelDataForServer } from '../../lib/serverPrivacyUtils';
import { isAdminDomain } from '../../lib/server-domains';

const DEBUG_TRAVEL_DATA = process.env.DEBUG_TRAVEL_DATA === 'true';

type RouteSegmentPayload = {
  from: string;
  to: string;
  fromCoords?: [number, number];
  toCoords?: [number, number];
};

type RoutePayload = RouteSegmentPayload & {
  id: string;
  subRoutes?: RouteSegmentPayload[];
};

const isSameCoords = (left?: [number, number], right?: [number, number]) => {
  if (!left || !right) return false;
  return left[0] === right[0] && left[1] === right[1];
};

const normalizeCompositeRoutes = (routes?: RoutePayload[]) => {
  if (!routes) return { routes };

  const normalized = routes.map((route) => {
    if (!route.subRoutes?.length) {
      return route;
    }

    const first = route.subRoutes[0];
    const last = route.subRoutes[route.subRoutes.length - 1];

    if (route.from && route.from !== first.from) {
      return { error: `Route ${route.id} from does not match sub-route start` };
    }

    if (route.to && route.to !== last.to) {
      return { error: `Route ${route.id} to does not match sub-route end` };
    }

    if (route.fromCoords && first.fromCoords && !isSameCoords(route.fromCoords, first.fromCoords)) {
      return { error: `Route ${route.id} fromCoords does not match sub-route start` };
    }

    if (route.toCoords && last.toCoords && !isSameCoords(route.toCoords, last.toCoords)) {
      return { error: `Route ${route.id} toCoords does not match sub-route end` };
    }

    return {
      ...route,
      from: first.from,
      to: last.to,
      fromCoords: first.fromCoords ?? route.fromCoords,
      toCoords: last.toCoords ?? route.toCoords
    };
  });

  const errorResult = normalized.find((entry) => typeof entry === 'object' && 'error' in entry) as
    | { error: string }
    | undefined;

  if (errorResult) {
    return { error: errorResult.error };
  }

  return { routes: normalized as RoutePayload[] };
};

export async function POST(request: NextRequest) {
  try {
    const travelData = await request.json();

    const { routes, error } = normalizeCompositeRoutes(travelData.routes);
    if (error) {
      return NextResponse.json(
        { error },
        { status: 400 }
      );
    }
    
    // Generate a unique ID for this travel map
    const id = Date.now().toString(36) + Math.random().toString(36).substr(2);
    
    // Use unified data service to save travel data
    await updateTravelData(id, {
      ...travelData,
      routes,
      id,
      createdAt: new Date().toISOString()
    });
    
    return NextResponse.json({ 
      success: true, 
      id,
      mapUrl: `/map/${id}`,
      embedUrl: `/embed/${id}`
    });
  } catch (error) {
    console.error('Error saving travel data:', error);
    return NextResponse.json(
      { error: 'Failed to save travel data' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json(
        { error: 'ID parameter is required' },
        { status: 400 }
      );
    }
    
    // Use unified data service
    const unifiedData = await loadUnifiedTripData(id);
    
    if (!unifiedData) {
      console.log('[GET] Trip %s not found', id);
      return NextResponse.json(
        { error: 'Travel data not found' },
        { status: 404 }
      );
    }
    
    if (DEBUG_TRAVEL_DATA) {
      console.log('[GET] Loading trip %s, has %d routes', id, unifiedData.travelData?.routes?.length || 0);
      unifiedData.travelData?.routes?.forEach(
        (route: { id: string; routePoints?: [number, number][] }, index: number) => {
          const routePointsCount = route.routePoints ? route.routePoints.length : 0;
          console.log('[GET] Route %d (%s): %d route points', index, route.id, routePointsCount);
        }
      );
    }
    
    // Return the travel data portion for backward compatibility, including accommodations
    const travelData = {
      id: unifiedData.id,
      title: unifiedData.title,
      description: unifiedData.description,
      startDate: unifiedData.startDate,
      endDate: unifiedData.endDate,
      instagramUsername: unifiedData.travelData?.instagramUsername,
      locations: unifiedData.travelData?.locations || [],
      routes: unifiedData.travelData?.routes || [],
      days: unifiedData.travelData?.days,
      accommodations: unifiedData.accommodations || [],
      publicUpdates: unifiedData.publicUpdates || []
    };
    
    // Apply server-side privacy filtering based on domain
    const host = request.headers.get('host');
    const filteredData = filterTravelDataForServer(travelData, host);
    
    if (DEBUG_TRAVEL_DATA && filteredData.routes) {
      filteredData.routes.forEach((route: { id: string; routePoints?: [number, number][] }, index: number) => {
        const routePointsCount = route.routePoints ? route.routePoints.length : 0;
        console.log('[GET] After filtering - Route %d (%s): %d route points', index, route.id, routePointsCount);
      });
    }
    
    return NextResponse.json(filteredData, {
      headers: {
        // Cache at the CDN for a day; allow serving stale for a week while revalidating
        'Cache-Control': 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800'
      }
    });
  } catch (error) {
    console.error('Error loading travel data:', error);
    return NextResponse.json(
      { error: 'Travel data not found' },
      { status: 404 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json(
        { error: 'ID parameter is required' },
        { status: 400 }
      );
    }
    
    const updatedData = await request.json();

    const { routes, error } = normalizeCompositeRoutes(updatedData.routes);
    if (error) {
      return NextResponse.json(
        { error },
        { status: 400 }
      );
    }
    
    if (DEBUG_TRAVEL_DATA) {
      console.log('[PUT] Received data for trip %s, %d routes', id, updatedData.routes?.length || 0);
      updatedData.routes?.forEach(
        (route: { id: string; from: string; to: string; routePoints?: [number, number][] }, index: number) => {
          console.log(
            '[PUT] Route %d (%s): %s → %s, routePoints: %s',
            index,
            route.id,
            route.from,
            route.to,
            route.routePoints?.length ?? 'undefined'
          );
        }
      );
    }
    
    // Use unified data service to update travel data
    await updateTravelData(id, {
      ...updatedData,
      routes,
      id
    });
    
    return NextResponse.json({ 
      success: true, 
      id,
      mapUrl: `/map/${id}`,
      embedUrl: `/embed/${id}`
    });
  } catch (error) {
    console.error('Error updating travel data:', error);
    return NextResponse.json(
      { error: 'Failed to update travel data' },
      { status: 500 }
    );
  }
} 

export async function PATCH(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json(
        { error: 'ID parameter is required' },
        { status: 400 }
      );
    }
    
    const updateRequest = await request.json();
    
    // Handle batch route point updates
    if (updateRequest.batchRouteUpdate) {
      const updates = updateRequest.batchRouteUpdate as Array<{routeId: string, routePoints: [number, number][]}>;
      console.log('[PATCH] Processing batch route update for trip %s with %d routes', id, updates.length);
      
      // Load current unified data
      const unifiedData = await loadUnifiedTripData(id);
      if (!unifiedData) {
        console.log('[PATCH] Trip %s not found', id);
        return NextResponse.json(
          { error: 'Travel data not found' },
          { status: 404 }
        );
      }
      
      console.log('[PATCH] Loaded trip %s, has %d routes', id, unifiedData.travelData?.routes?.length || 0);
      
      // Update multiple routes with new route points
      if (unifiedData.travelData && unifiedData.travelData.routes) {
        let updatedCount = 0;
        
        for (const update of updates) {
          const routeIndex = unifiedData.travelData.routes.findIndex((route: { id: string }) => route.id === update.routeId);
          if (routeIndex >= 0) {
            console.log(
              '[PATCH] Updating route %s at index %d with %d points',
              update.routeId,
              routeIndex,
              update.routePoints.length
            );
            (unifiedData.travelData.routes[routeIndex] as { routePoints?: [number, number][] }).routePoints = update.routePoints;
            updatedCount++;
          } else {
            console.log('[PATCH] Route %s not found in trip data', update.routeId);
          }
        }
        
        if (updatedCount > 0) {
          console.log('[PATCH] Saving %d route updates to trip %s', updatedCount, id);
          // Save the updated data - pass only the route updates
          try {
            await updateTravelData(id, {
              routes: unifiedData.travelData.routes,
              locations: unifiedData.travelData.locations,
              days: unifiedData.travelData.days
            });
            console.log('[PATCH] Successfully saved trip %s with route updates', id);
          } catch (error) {
            console.error('[PATCH] Failed to save trip %s:', id, error);
            return NextResponse.json(
              { error: 'Failed to save route updates' },
              { status: 500 }
            );
          }
          
          return NextResponse.json({ 
            success: true,
            message: `${updatedCount} route(s) updated successfully`
          });
        } else {
          console.log('[PATCH] No routes found to update for trip %s', id);
          return NextResponse.json(
            { error: 'No routes found to update' },
            { status: 404 }
          );
        }
      }
    }
    
    // Handle single route point updates (backwards compatibility)
    if (updateRequest.routeUpdate) {
      const { routeId, routePoints } = updateRequest.routeUpdate;
      
      // Load current unified data
      const unifiedData = await loadUnifiedTripData(id);
      if (!unifiedData) {
        return NextResponse.json(
          { error: 'Travel data not found' },
          { status: 404 }
        );
      }
      
      // Update the specific route with new route points
      if (unifiedData.travelData && unifiedData.travelData.routes) {
        const routeIndex = unifiedData.travelData.routes.findIndex((route: { id: string }) => route.id === routeId);
        if (routeIndex >= 0) {
          (unifiedData.travelData.routes[routeIndex] as { routePoints?: [number, number][] }).routePoints = routePoints;
          
          // Save the updated data - pass only the route updates
          await updateTravelData(id, {
            routes: unifiedData.travelData.routes,
            locations: unifiedData.travelData.locations,
            days: unifiedData.travelData.days
          });
          
          return NextResponse.json({ 
            success: true,
            message: 'Route points updated successfully'
          });
        } else {
          return NextResponse.json(
            { error: 'Route not found' },
            { status: 404 }
          );
        }
      }
    }
    
    return NextResponse.json(
      { error: 'Invalid update request' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error updating travel data:', error);
    return NextResponse.json(
      { error: 'Failed to update travel data' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // Check if request is from admin domain
    const isAdmin = await isAdminDomain();
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Delete operation only allowed on admin domain' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json(
        { error: 'ID parameter is required' },
        { status: 400 }
      );
    }
    
    // Verify trip exists before deletion
    const tripData = await loadUnifiedTripData(id);
    if (!tripData) {
      return NextResponse.json(
        { error: 'Trip not found' },
        { status: 404 }
      );
    }
    
    // Delete trip with backup
    await deleteTripWithBackup(id);
    
    return NextResponse.json({ 
      success: true, 
      message: `Trip "${tripData.title}" has been deleted and backed up`
    });
  } catch (error) {
    console.error('Error deleting trip:', error);
    return NextResponse.json(
      { error: 'Failed to delete trip' },
      { status: 500 }
    );
  }
}
