import { NextRequest, NextResponse } from 'next/server';
import { writeFile, readFile } from 'fs/promises';
import { join } from 'path';

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
    
    const filePath = join(process.cwd(), 'data', `travel-${id}.json`);
    const fileContent = await readFile(filePath, 'utf-8');
    const travelData = JSON.parse(fileContent);
    
    return NextResponse.json(travelData);
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
    
    // Ensure the ID is preserved
    const dataWithId = {
      ...updatedData,
      id,
      updatedAt: new Date().toISOString()
    };
    
    // Save the updated data
    const filePath = join(process.cwd(), 'data', `travel-${id}.json`);
    await writeFile(filePath, JSON.stringify(dataWithId, null, 2));
    
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