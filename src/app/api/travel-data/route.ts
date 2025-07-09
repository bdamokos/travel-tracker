import { NextRequest, NextResponse } from 'next/server';
import { updateTravelData, loadUnifiedTripData } from '../../lib/unifiedDataService';
import { filterTravelDataForServer } from '../../lib/serverPrivacyUtils';

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