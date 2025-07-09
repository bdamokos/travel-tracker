import { NextRequest, NextResponse } from 'next/server';
import { loadUnifiedTripData } from '../../../../lib/unifiedDataService';
import { Accommodation } from '../../../../types';

// GET - Get single accommodation by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const tripId = searchParams.get('tripId');
    
    if (!tripId) {
      return NextResponse.json({ error: 'tripId is required' }, { status: 400 });
    }
    
    const tripData = await loadUnifiedTripData(tripId);
    if (!tripData) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
    }
    
    const accommodation = tripData.accommodations?.find(acc => acc.id === id);
    if (!accommodation) {
      return NextResponse.json({ error: 'Accommodation not found' }, { status: 404 });
    }
    
    return NextResponse.json(accommodation);
  } catch (error) {
    console.error('Error loading accommodation:', error);
    return NextResponse.json({ error: 'Failed to load accommodation' }, { status: 500 });
  }
}