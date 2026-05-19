import { NextRequest, NextResponse } from 'next/server';
import { updateTravelData, loadUnifiedTripData, deleteTripWithBackup } from '@/app/lib/unifiedDataService';
import { filterTravelDataForServer } from '@/app/lib/serverPrivacyUtils';
import { isAdminDomain, isAdminHost } from '@/app/lib/server-domains';
import { validateAndNormalizeCompositeRoute } from '@/app/lib/compositeRouteValidation';
import { applyTravelDataDelta, isTravelDataDelta, isTravelDataDeltaEmpty } from '@/app/lib/travelDataDelta';
import { dateReviver } from '@/app/lib/jsonDateReviver';
import {
  MAX_ROUTE_POINTS_PER_TRIP,
  MAX_ROUTE_POINTS_PER_UPDATE,
  validateRoutePoints
} from '@/app/lib/routePointValidation';
import type { TravelData } from '@/app/types';
import { parseDateAsLocalDay } from '@/app/lib/localDateUtils';

const DEBUG_TRAVEL_DATA = process.env.DEBUG_TRAVEL_DATA === 'true';
const PUBLIC_TRAVEL_DATA_CACHE_CONTROL = 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800';
const PRIVATE_TRAVEL_DATA_CACHE_CONTROL = 'no-store';
const SAFE_TRIP_ID_PATTERN = /^[A-Za-z0-9]+$/;

type RouteSegmentPayload = {
  from: string;
  to: string;
  fromCoords?: [number, number];
  toCoords?: [number, number];
  routePoints?: [number, number][];
};

type RoutePayload = RouteSegmentPayload & {
  id: string;
  subRoutes?: RouteSegmentPayload[];
};

const validateSubmittedRoutePoints = (
  routes?: Array<Partial<RoutePayload> & { id?: string }>,
  options: { totalLimit?: number; totalLabel?: string } = {}
): { error?: string } => {
  if (!routes) return {};

  const totalLimit = options.totalLimit ?? MAX_ROUTE_POINTS_PER_UPDATE;
  const totalLabel = options.totalLabel ?? 'Route update';
  let totalRoutePoints = 0;

  for (const route of routes) {
    const routeId = route.id ?? 'unknown';
    const routePointValidation = validateRoutePoints(route.routePoints, `Route ${routeId} routePoints`);
    if (!routePointValidation.ok) {
      return { error: routePointValidation.error };
    }
    totalRoutePoints += routePointValidation.points.length;

    const subRoutes = route.subRoutes ?? [];
    for (let index = 0; index < subRoutes.length; index += 1) {
      const segment = subRoutes[index];
      const segmentPointValidation = validateRoutePoints(
        segment.routePoints,
        `Route ${routeId} sub-route ${index + 1} routePoints`
      );
      if (!segmentPointValidation.ok) {
        return { error: segmentPointValidation.error };
      }
      totalRoutePoints += segmentPointValidation.points.length;
    }

    if (totalRoutePoints > totalLimit) {
      return {
        error: `${totalLabel} cannot contain more than ${totalLimit} total route points`
      };
    }
  }

  return {};
};

const normalizeCompositeRoutes = (
  routes?: RoutePayload[],
  options: { validateRoutePoints?: boolean; totalRoutePointsLimit?: number; totalLabel?: string } = {}
) => {
  if (!routes) return { routes };

  if (options.validateRoutePoints ?? true) {
    const routePointValidation = validateSubmittedRoutePoints(routes, {
      totalLimit: options.totalRoutePointsLimit ?? MAX_ROUTE_POINTS_PER_TRIP,
      totalLabel: options.totalLabel ?? 'Trip'
    });
    if (routePointValidation.error) {
      return { error: routePointValidation.error };
    }
  }

  const normalized = routes.map((route) => {
    const validation = validateAndNormalizeCompositeRoute(route);
    if (validation.ok) {
      return validation.normalizedRoute as RoutePayload;
    }

    switch (validation.error.code) {
      case 'invalid_route_name':
        return {
          error: validation.error.segmentNumber
            ? `Route ${route.id} sub-route ${validation.error.segmentNumber} ${validation.error.field} must be a non-empty string`
            : `Route ${route.id} ${validation.error.field} must be a non-empty string`
        };
      case 'from_mismatch':
        return { error: `Route ${route.id} from does not match sub-route start` };
      case 'to_mismatch':
        return { error: `Route ${route.id} to does not match sub-route end` };
      case 'from_coords_mismatch':
        return { error: `Route ${route.id} fromCoords does not match sub-route start` };
      case 'to_coords_mismatch':
        return { error: `Route ${route.id} toCoords does not match sub-route end` };
      case 'disconnected_segment':
        return { error: `Route ${route.id} sub-route ${validation.error.segmentNumber} does not connect to previous segment` };
      default:
        return { error: `Route ${route.id} failed validation` };
    }
  });

  const errorResult = normalized.find((entry) => typeof entry === 'object' && 'error' in entry) as
    | { error: string }
    | undefined;

  if (errorResult) {
    return { error: errorResult.error };
  }

  return { routes: normalized as RoutePayload[] };
};

const requireAdminDomain = async (
  operation: string
): Promise<NextResponse<{ error: string }> | null> => {
  const isAdmin = await isAdminDomain();
  if (isAdmin) {
    return null;
  }

  return NextResponse.json(
    { error: `${operation} operation only allowed on admin domain` },
    { status: 403 }
  );
};

export async function POST(request: NextRequest) {
  try {
    const forbidden = await requireAdminDomain('Create');
    if (forbidden) {
      return forbidden;
    }

    const travelData = await request.json();

    const { routes, error } = normalizeCompositeRoutes(travelData.routes);
    if (error) {
      return NextResponse.json(
        { error },
        { status: 400 }
      );
    }
    
    // Generate a unique ID for this travel map
    const id = Date.now().toString(36) + Math.random().toString(36).substring(2);
    
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
    
    const cacheControl = isAdminHost(host)
      ? PRIVATE_TRAVEL_DATA_CACHE_CONTROL
      : PUBLIC_TRAVEL_DATA_CACHE_CONTROL;

    return NextResponse.json(filteredData, {
      headers: {
        'Cache-Control': cacheControl
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
    const forbidden = await requireAdminDomain('Update');
    if (forbidden) {
      return forbidden;
    }

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
    const forbidden = await requireAdminDomain('Patch');
    if (forbidden) {
      return forbidden;
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json(
        { error: 'ID parameter is required' },
        { status: 400 }
      );
    }
    
    const updateRequest = JSON.parse(await request.text(), dateReviver);
    
    // Handle autosave delta updates
    if (updateRequest.deltaUpdate !== undefined) {
      const delta = updateRequest.deltaUpdate;
      if (!isTravelDataDelta(delta)) {
        return NextResponse.json(
          { error: 'Invalid delta payload' },
          { status: 400 }
        );
      }

      if (isTravelDataDeltaEmpty(delta)) {
        return NextResponse.json({
          success: true,
          message: 'No delta changes to apply'
        });
      }

      const routePointValidation = validateSubmittedRoutePoints([
        ...(delta.routes?.added ?? []),
        ...(delta.routes?.updated ?? [])
      ] as Array<Partial<RoutePayload> & { id?: string }>);
      if (routePointValidation.error) {
        return NextResponse.json(
          { error: routePointValidation.error },
          { status: 400 }
        );
      }

      const unifiedData = await loadUnifiedTripData(id);
      if (!unifiedData) {
        return NextResponse.json(
          { error: 'Travel data not found' },
          { status: 404 }
        );
      }

      const baseTravelData = {
        id: unifiedData.id,
        title: unifiedData.title,
        description: unifiedData.description,
        startDate: parseDateAsLocalDay(unifiedData.startDate) ?? new Date(),
        endDate: parseDateAsLocalDay(unifiedData.endDate) ?? new Date(),
        instagramUsername: unifiedData.travelData?.instagramUsername,
        locations: unifiedData.travelData?.locations || [],
        routes: (unifiedData.travelData?.routes || []) as unknown as TravelData['routes']
      } as TravelData;

      // Defensive merge: apply only explicit add/update/remove operations from the delta.
      // Missing keys never imply deletion.
      // Accommodations are intentionally excluded here because they are managed by dedicated
      // accommodation endpoints and not part of TravelDataDelta.
      const merged = applyTravelDataDelta(baseTravelData, delta);

      const { routes, error } = normalizeCompositeRoutes(merged.routes as unknown as RoutePayload[]);
      if (error) {
        return NextResponse.json(
          { error },
          { status: 400 }
        );
      }

      await updateTravelData(id, {
        id,
        title: merged.title,
        description: merged.description,
        startDate: merged.startDate,
        endDate: merged.endDate,
        instagramUsername: merged.instagramUsername,
        locations: merged.locations,
        routes
      });

      return NextResponse.json({
        success: true,
        message: 'Delta applied successfully'
      });
    }

    // Handle batch route point updates
    if (updateRequest.batchRouteUpdate) {
      const updates = updateRequest.batchRouteUpdate as Array<{routeId: string, routePoints: [number, number][]}>;
      let totalRoutePoints = 0;
      for (const update of updates) {
        const validation = validateRoutePoints(update.routePoints, `Route ${update.routeId} routePoints`);
        if (!validation.ok) {
          return NextResponse.json(
            { error: validation.error },
            { status: 400 }
          );
        }

        totalRoutePoints += validation.points.length;
        if (totalRoutePoints > MAX_ROUTE_POINTS_PER_UPDATE) {
          return NextResponse.json(
            { error: `Route update cannot contain more than ${MAX_ROUTE_POINTS_PER_UPDATE} total route points` },
            { status: 400 }
          );
        }
      }

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
          const routePointValidation = validateSubmittedRoutePoints(
            unifiedData.travelData.routes as unknown as RoutePayload[],
            { totalLimit: MAX_ROUTE_POINTS_PER_TRIP, totalLabel: 'Trip' }
          );
          if (routePointValidation.error) {
            return NextResponse.json(
              { error: routePointValidation.error },
              { status: 400 }
            );
          }

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
      const validation = validateRoutePoints(routePoints, `Route ${routeId} routePoints`);
      if (!validation.ok) {
        return NextResponse.json(
          { error: validation.error },
          { status: 400 }
        );
      }
      
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

          const routePointValidation = validateSubmittedRoutePoints(
            unifiedData.travelData.routes as unknown as RoutePayload[],
            { totalLimit: MAX_ROUTE_POINTS_PER_TRIP, totalLabel: 'Trip' }
          );
          if (routePointValidation.error) {
            return NextResponse.json(
              { error: routePointValidation.error },
              { status: 400 }
            );
          }
          
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
    const forbidden = await requireAdminDomain('Delete');
    if (forbidden) {
      return forbidden;
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json(
        { error: 'ID parameter is required' },
        { status: 400 }
      );
    }

    if (!SAFE_TRIP_ID_PATTERN.test(id)) {
      return NextResponse.json(
        { error: 'Invalid trip ID' },
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
