import { NextRequest, NextResponse } from 'next/server';
import { writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import { filterTravelDataForServer } from '../../lib/serverPrivacyUtils';
import { updateTravelData, getLegacyTravelData } from '../../lib/unifiedDataService';

export async function POST(request: NextRequest) {
  try {
    const travelData = await request.json();
    
    // Generate a unique ID for this travel map
    const id = Date.now().toString(36) + Math.random().toString(36).substr(2);
    
    // Add the ID to the data
    const dataWithId = {
      id,
      ...travelData,
      createdAt: new Date().toISOString()
    };
    
    // Create data directory if it doesn't exist
    const dataDir = join(process.cwd(), 'data');
    
    try {
      // Try to create directory (will fail silently if it exists)
      await writeFile(join(dataDir, '.gitkeep'), '');
    } catch (error) {
      // Directory might not exist, that's okay for now
    }
    
    // Save the data to a JSON file
    const filePath = join(dataDir, `travel-${id}.json`);
    await writeFile(filePath, JSON.stringify(dataWithId, null, 2));
    
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
    
    // Use unified data service for automatic migration
    const travelData = await getLegacyTravelData(id);
    
    if (!travelData) {
      return NextResponse.json(
        { error: 'Travel data not found' },
        { status: 404 }
      );
    }
    
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