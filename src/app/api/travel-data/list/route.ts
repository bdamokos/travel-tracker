import { NextResponse } from 'next/server';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

export async function GET() {
  try {
    const dataDir = join(process.cwd(), 'data');
    
    // Get all JSON files in the data directory
    let files: string[] = [];
    try {
      files = await readdir(dataDir);
    } catch (error) {
      // Data directory might not exist yet
      return NextResponse.json([]);
    }
    
    const travelFiles = files.filter(file => file.startsWith('travel-') && file.endsWith('.json'));
    
    const trips = await Promise.all(
      travelFiles.map(async (file) => {
        try {
          const filePath = join(dataDir, file);
          const fileContent = await readFile(filePath, 'utf-8');
          const travelData = JSON.parse(fileContent);
          
          // Return only the metadata for listing
          return {
            id: travelData.id,
            title: travelData.title || 'Untitled Trip',
            description: travelData.description || '',
            startDate: travelData.startDate,
            endDate: travelData.endDate,
            createdAt: travelData.createdAt,
            updatedAt: travelData.updatedAt || travelData.createdAt,
            locationCount: travelData.locations?.length || 0,
            routeCount: travelData.routes?.length || 0
          };
        } catch (error) {
          console.error(`Error reading file ${file}:`, error);
          return null;
        }
      })
    );
    
    // Filter out any null results and sort by creation date (newest first)
    const validTrips = trips
      .filter(trip => trip !== null)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    return NextResponse.json(validTrips);
  } catch (error) {
    console.error('Error listing travel data:', error);
    return NextResponse.json(
      { error: 'Failed to list travel data' },
      { status: 500 }
    );
  }
} 