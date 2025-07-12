import { NextRequest, NextResponse } from 'next/server';
import { updateTravelData, loadUnifiedTripData, deleteTripWithBackup } from '../../lib/unifiedDataService';
import { filterTravelDataForServer } from '../../lib/serverPrivacyUtils';
import { isAdminDomain } from '../../lib/server-domains';

export async function POST(request: NextRequest) {
  try {
    const travelData = await request.json();
    
    // Generate a unique ID for this travel map
    const id = Date.now().toString(36) + Math.random().toString(36).substr(2);
    
    // Use unified data service to save travel data
    await updateTravelData(id, {
      ...travelData,
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
      return NextResponse.json(
        { error: 'Travel data not found' },
        { status: 404 }
      );
    }
    
    // Return the travel data portion for backward compatibility, including accommodations
    const travelData = {
      id: unifiedData.id,
      title: unifiedData.title,
      description: unifiedData.description,
      startDate: unifiedData.startDate,
      endDate: unifiedData.endDate,
      locations: unifiedData.travelData?.locations || [],
      routes: unifiedData.travelData?.routes || [],
      days: unifiedData.travelData?.days,
      accommodations: unifiedData.accommodations || []
    };
    
    // Apply server-side privacy filtering based on domain
    const host = request.headers.get('host');
    const filteredData = filterTravelDataForServer(travelData, host);
    
    return NextResponse.json(filteredData);
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
    
    // Use unified data service to update travel data
    await updateTravelData(id, {
      ...updatedData,
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
      
      // Load current unified data
      const unifiedData = await loadUnifiedTripData(id);
      if (!unifiedData) {
        return NextResponse.json(
          { error: 'Travel data not found' },
          { status: 404 }
        );
      }
      
      // Update multiple routes with new route points
      if (unifiedData.travelData && unifiedData.travelData.routes) {
        let updatedCount = 0;
        
        for (const update of updates) {
          const routeIndex = unifiedData.travelData.routes.findIndex((route: { id: string }) => route.id === update.routeId);
          if (routeIndex >= 0) {
            (unifiedData.travelData.routes[routeIndex] as { routePoints?: [number, number][] }).routePoints = update.routePoints;
            updatedCount++;
          }
        }
        
        if (updatedCount > 0) {
          // Save the updated data
          await updateTravelData(id, unifiedData as unknown as Record<string, unknown>);
          
          return NextResponse.json({ 
            success: true,
            message: `${updatedCount} route(s) updated successfully`
          });
        } else {
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
          
          // Save the updated data
          await updateTravelData(id, unifiedData as unknown as Record<string, unknown>);
          
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
