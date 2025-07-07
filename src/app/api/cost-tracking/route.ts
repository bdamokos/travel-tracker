import { NextRequest, NextResponse } from 'next/server';
import { writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import { updateCostData, getLegacyCostData } from '../../lib/unifiedDataService';

// Helper function to generate unique ID
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Helper function to extract ID from filename
function extractIdFromFilename(filename: string): string {
  return filename.replace('cost-', '').replace('.json', '');
}

// Helper function to fix cost tracking file with empty ID
async function fixEmptyId(filePath: string, costData: any): Promise<any> {
  if (!costData.id || costData.id.trim() === '') {
    console.log(`Fixing empty ID for file: ${filePath}`);
    
    // Try to use the ID from the filename first
    const filename = filePath.split('/').pop() || '';
    let newId = extractIdFromFilename(filename);
    
    // If filename doesn't have a proper ID, generate a new one
    if (!newId || newId === '' || newId === 'undefined') {
      newId = generateId();
      console.log(`Generated new ID: ${newId}`);
    } else {
      console.log(`Using ID from filename: ${newId}`);
    }
    
    // Update the data with the new ID
    const updatedData = {
      ...costData,
      id: newId,
      updatedAt: new Date().toISOString()
    };
    
    // Save the fixed data back to the file
    await writeFile(filePath, JSON.stringify(updatedData, null, 2));
    console.log(`Fixed and saved cost tracking file with ID: ${newId}`);
    
    return updatedData;
  }
  
  return costData;
}

export async function POST(request: NextRequest) {
  try {
    const costData = await request.json();
    
    // Generate a unique ID for this cost tracking data
    const id = Date.now().toString(36) + Math.random().toString(36).substr(2);
    
    // Add the ID to the data
    const dataWithId = {
      id,
      ...costData,
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
    const filePath = join(dataDir, `cost-${id}.json`);
    await writeFile(filePath, JSON.stringify(dataWithId, null, 2));
    
    return NextResponse.json({ 
      success: true, 
      id,
      data: dataWithId
    });
  } catch (error) {
    console.error('Error saving cost tracking data:', error);
    return NextResponse.json(
      { error: 'Failed to save cost tracking data' },
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
    
    // Clean the ID to handle both cost-prefixed and clean IDs
    const cleanId = id.replace(/^(cost-)+/, '');
    
    // Use unified data service for automatic migration
    const costData = await getLegacyCostData(cleanId);
    
    if (!costData) {
      return NextResponse.json(
        { error: 'Cost tracking data not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(costData);
  } catch (error) {
    console.error('Error loading cost tracking data:', error);
    return NextResponse.json(
      { error: 'Cost tracking data not found' },
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
    
    // Clean the ID to handle both cost-prefixed and clean IDs
    const cleanId = id.replace(/^(cost-)+/, '');
    
    const updatedData = await request.json();
    
    // Use unified data service to update cost data
    const unifiedData = await updateCostData(cleanId, updatedData);
    
    // Extract legacy format for response
    const legacyData = {
      id: cleanId,
      ...updatedData,
      updatedAt: unifiedData.updatedAt
    };
    
    return NextResponse.json({ 
      success: true, 
      id: cleanId,
      data: legacyData
    });
  } catch (error) {
    console.error('Error updating cost tracking data:', error);
    return NextResponse.json(
      { error: 'Failed to update cost tracking data' },
      { status: 500 }
    );
  }
} 