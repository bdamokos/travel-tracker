import { NextRequest, NextResponse } from 'next/server';
import { loadUnifiedTripData } from '@/app/lib/unifiedDataService';
import { isAdminDomain } from '@/app/lib/server-domains';

const PRIVATE_NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' } as const;

// GET - Get single accommodation by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Check if request is from admin domain
    const isAdmin = await isAdminDomain();
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { headers: PRIVATE_NO_STORE_HEADERS, status: 403 });
    }
    
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const tripId = searchParams.get('tripId');
    
    if (!tripId) {
      return NextResponse.json({ error: 'tripId is required' }, { headers: PRIVATE_NO_STORE_HEADERS, status: 400 });
    }
    
    const tripData = await loadUnifiedTripData(tripId);
    if (!tripData) {
      return NextResponse.json({ error: 'Trip not found' }, { headers: PRIVATE_NO_STORE_HEADERS, status: 404 });
    }
    
    const accommodation = tripData.accommodations?.find(acc => acc.id === id);
    if (!accommodation) {
      return NextResponse.json({ error: 'Accommodation not found' }, { headers: PRIVATE_NO_STORE_HEADERS, status: 404 });
    }
    
    return NextResponse.json(accommodation, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Error loading accommodation:', error);
    return NextResponse.json({ error: 'Failed to load accommodation' }, { headers: PRIVATE_NO_STORE_HEADERS, status: 500 });
  }
}