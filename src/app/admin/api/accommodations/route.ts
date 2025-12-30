import { NextRequest, NextResponse } from 'next/server';
import { loadUnifiedTripData, saveUnifiedTripData } from '../../../lib/unifiedDataService';
import { Accommodation } from '../../../types';
import { isAdminDomain } from '../../../lib/server-domains';


// Generate unique ID
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

// GET - List accommodations for a specific trip
export async function GET(request: NextRequest) {
  try {
    // Check if request is from admin domain
    const isAdmin = await isAdminDomain();
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    
    const { searchParams } = new URL(request.url);
    const tripId = searchParams.get('tripId');
    const locationId = searchParams.get('locationId');
    
    if (!tripId) {
      return NextResponse.json({ error: 'tripId is required' }, { status: 400 });
    }
    
    const tripData = await loadUnifiedTripData(tripId);
    if (!tripData) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
    }
    
    const accommodations = tripData.accommodations || [];
    
    if (locationId) {
      // Filter by location
      const filtered = accommodations.filter(acc => acc.locationId === locationId);
      return NextResponse.json(filtered);
    }
    
    // Return all accommodations for this trip
    return NextResponse.json(accommodations);
  } catch (error) {
    console.error('Error loading accommodations:', error);
    return NextResponse.json({ error: 'Failed to load accommodations' }, { status: 500 });
  }
}

// POST - Create new accommodation in a trip
export async function POST(request: NextRequest) {
  try {
    // Check if request is from admin domain
    const isAdmin = await isAdminDomain();
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    
    const body = await request.json();
    const { tripId } = body;
    
    if (!tripId) {
      return NextResponse.json({ error: 'tripId is required' }, { status: 400 });
    }
    
    if (!body.name || !body.locationId) {
      return NextResponse.json({ error: 'Name and locationId are required' }, { status: 400 });
    }
    
    const tripData = await loadUnifiedTripData(tripId);
    if (!tripData) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
    }
    
    const newAccommodation: Accommodation = {
      id: generateId(),
      name: body.name,
      locationId: body.locationId,
      accommodationData: body.accommodationData || '',
      isAccommodationPublic: body.isAccommodationPublic || false,
      costTrackingLinks: body.costTrackingLinks || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    if (!tripData.accommodations) {
      tripData.accommodations = [];
    }
    tripData.accommodations.push(newAccommodation);
    
    await saveUnifiedTripData(tripData);
    
    return NextResponse.json(newAccommodation);
  } catch (error) {
    console.error('Error creating accommodation:', error);
    return NextResponse.json({ error: 'Failed to create accommodation' }, { status: 500 });
  }
}

// PUT - Update existing accommodation
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { tripId } = body;
    
    if (!tripId || !body.id) {
      return NextResponse.json({ error: 'tripId and id are required' }, { status: 400 });
    }
    
    const tripData = await loadUnifiedTripData(tripId);
    if (!tripData) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
    }
    
    if (!tripData.accommodations) {
      return NextResponse.json({ error: 'Accommodation not found' }, { status: 404 });
    }
    
    const index = tripData.accommodations.findIndex(acc => acc.id === body.id);
    if (index === -1) {
      return NextResponse.json({ error: 'Accommodation not found' }, { status: 404 });
    }
    
    // Update accommodation - exclude costTrackingLinks as they're managed by the new SWR system
    const { costTrackingLinks, ...accommodationData } = body;
    tripData.accommodations[index] = {
      ...tripData.accommodations[index],
      ...accommodationData,
      updatedAt: new Date().toISOString()
    };
    
    await saveUnifiedTripData(tripData);
    
    return NextResponse.json(tripData.accommodations[index]);
  } catch (error) {
    console.error('Error updating accommodation:', error);
    return NextResponse.json({ error: 'Failed to update accommodation' }, { status: 500 });
  }
}

// DELETE - Delete accommodation
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const tripId = searchParams.get('tripId');
    
    if (!id || !tripId) {
      return NextResponse.json({ error: 'ID and tripId are required' }, { status: 400 });
    }
    
    const tripData = await loadUnifiedTripData(tripId);
    if (!tripData) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
    }
    
    if (!tripData.accommodations) {
      return NextResponse.json({ error: 'Accommodation not found' }, { status: 404 });
    }
    
    const index = tripData.accommodations.findIndex(acc => acc.id === id);
    if (index === -1) {
      return NextResponse.json({ error: 'Accommodation not found' }, { status: 404 });
    }
    
    tripData.accommodations.splice(index, 1);

    // Remove dangling references from locations (prevents "needs migration" warnings)
    if (tripData.travelData?.locations) {
      tripData.travelData.locations = tripData.travelData.locations.map(location => ({
        ...location,
        accommodationIds: (location.accommodationIds || []).filter(accId => accId !== id)
      }));
    }

    await saveUnifiedTripData(tripData);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting accommodation:', error);
    return NextResponse.json({ error: 'Failed to delete accommodation' }, { status: 500 });
  }
}
