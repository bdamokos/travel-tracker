import { NextRequest, NextResponse } from 'next/server';
import { syncLegacyTravelReferences } from '../../../lib/expenseLinkingService';
import { isAdminDomain } from '../../../lib/server-domains';

export async function POST(request: NextRequest) {
  try {
    // Check if request is from admin domain
    const isAdmin = await isAdminDomain();
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { tripId } = await request.json();

    if (!tripId) {
      return NextResponse.json({ error: 'tripId is required' }, { status: 400 });
    }

    const result = await syncLegacyTravelReferences(tripId);

    return NextResponse.json({
      success: true,
      synced: result.synced,
      errors: result.errors,
      message: `Synced ${result.synced} legacy travel references to costTrackingLinks`
    });

  } catch (error) {
    console.error('Error syncing legacy travel references:', error);
    return NextResponse.json(
      { error: 'Failed to sync legacy travel references' },
      { status: 500 }
    );
  }
}