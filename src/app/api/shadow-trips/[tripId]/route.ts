import { NextRequest, NextResponse } from 'next/server';
import { join } from 'path';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { ShadowTrip } from '@/app/types';
import { loadUnifiedTripData } from '@/app/lib/unifiedDataService';
import { UnifiedTripData } from '@/app/lib/dataMigration';
import { getDataDir } from '@/app/lib/dataDirectory';

const DATA_DIR = getDataDir();
const SHADOW_DATA_FILE = join(DATA_DIR, 'shadowTravelData.json');

// Ensure data directory exists
async function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true });
  }
}

// Load shadow trip data
async function loadShadowData(): Promise<Record<string, ShadowTrip>> {
  try {
    await ensureDataDir();
    if (!existsSync(SHADOW_DATA_FILE)) {
      return {};
    }
    const content = await readFile(SHADOW_DATA_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error('Error loading shadow data:', error);
    return {};
  }
}

// Save shadow trip data
async function saveShadowData(data: Record<string, ShadowTrip>): Promise<void> {
  try {
    await ensureDataDir();
    await writeFile(SHADOW_DATA_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error saving shadow data:', error);
    throw error;
  }
}

// Merge real trip data with shadow data
function mergeTripWithShadowData(realTrip: UnifiedTripData, shadowTrip: ShadowTrip | null) {
  if (!shadowTrip) {
    return realTrip;
  }

  return {
    ...realTrip,
    shadowData: {
      shadowLocations: shadowTrip.shadowLocations,
      shadowRoutes: shadowTrip.shadowRoutes,
      shadowAccommodations: shadowTrip.shadowAccommodations,
    }
  };
}

// GET: Fetch merged trip data (real + shadow)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  try {
    const { tripId } = await params;

    // Check if user is admin (shadow trips are admin-only)
    const host = request.headers.get('host');
    const isAdmin = host?.includes('tt-admin') || host?.includes('localhost');
    
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Shadow trips are only accessible in admin mode' },
        { status: 403 }
      );
    }

    // Load real trip data
    const realTripData = await loadUnifiedTripData(tripId);
    if (!realTripData) {
      return NextResponse.json(
        { error: 'Base trip not found' },
        { status: 404 }
      );
    }

    // Load shadow data
    const shadowData = await loadShadowData();
    let shadowTrip = shadowData[tripId] || null;

    // If no shadow trip exists, create an empty one
    if (!shadowTrip) {
      const now = new Date().toISOString();
      shadowTrip = {
        id: `shadow-${tripId}`,
        basedOn: tripId,
        shadowLocations: [],
        shadowRoutes: [],
        shadowAccommodations: [],
        createdAt: now,
        updatedAt: now,
      };
      
      // Save the new shadow trip
      shadowData[tripId] = shadowTrip;
      await saveShadowData(shadowData);
    }

    // Merge real and shadow data
    const mergedData = mergeTripWithShadowData(realTripData, shadowTrip);

    return NextResponse.json(mergedData);
  } catch (error) {
    console.error('Error loading shadow trip data:', error);
    return NextResponse.json(
      { error: 'Failed to load shadow trip data' },
      { status: 500 }
    );
  }
}

// PUT: Update shadow trip data
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  try {
    const { tripId } = await params;

    // Check if user is admin
    const host = request.headers.get('host');
    const isAdmin = host?.includes('tt-admin') || host?.includes('localhost');
    
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Shadow trips are only accessible in admin mode' },
        { status: 403 }
      );
    }

    // Verify base trip exists
    const realTripData = await loadUnifiedTripData(tripId);
    if (!realTripData) {
      return NextResponse.json(
        { error: 'Base trip not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { shadowLocations, shadowRoutes, shadowAccommodations } = body;

    // Load existing shadow data
    const shadowData = await loadShadowData();

    // Create or update shadow trip
    const now = new Date().toISOString();
    const shadowTrip: ShadowTrip = {
      id: `shadow-${tripId}`,
      basedOn: tripId,
      shadowLocations: shadowLocations || [],
      shadowRoutes: shadowRoutes || [],
      shadowAccommodations: shadowAccommodations || [],
      createdAt: shadowData[tripId]?.createdAt || now,
      updatedAt: now,
    };

    shadowData[tripId] = shadowTrip;
    await saveShadowData(shadowData);

    return NextResponse.json(shadowTrip);
  } catch (error) {
    console.error('Error updating shadow trip data:', error);
    return NextResponse.json(
      { error: 'Failed to update shadow trip data' },
      { status: 500 }
    );
  }
}

// DELETE: Remove shadow trip data
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  try {
    const { tripId } = await params;

    // Check if user is admin
    const host = request.headers.get('host');
    const isAdmin = host?.includes('tt-admin') || host?.includes('localhost');
    
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Shadow trips are only accessible in admin mode' },
        { status: 403 }
      );
    }

    // Load existing shadow data
    const shadowData = await loadShadowData();

    if (!shadowData[tripId]) {
      return NextResponse.json(
        { error: 'Shadow trip not found' },
        { status: 404 }
      );
    }

    delete shadowData[tripId];
    await saveShadowData(shadowData);

    return NextResponse.json({ message: 'Shadow trip deleted successfully' });
  } catch (error) {
    console.error('Error deleting shadow trip data:', error);
    return NextResponse.json(
      { error: 'Failed to delete shadow trip data' },
      { status: 500 }
    );
  }
}
