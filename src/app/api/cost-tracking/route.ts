import { NextRequest, NextResponse } from 'next/server';
import { updateCostData, loadUnifiedTripData, deleteCostTrackingWithBackup } from '@/app/lib/unifiedDataService';
import { maybeSyncPendingYnabTransactions } from '@/app/lib/ynabPendingSync';
import { isAdminDomain } from '@/app/lib/server-domains';
import { validateAllTripBoundaries } from '@/app/lib/tripBoundaryValidation';
import { dateReviver } from '@/app/lib/jsonDateReviver';
import { applyCostDataDelta, isCostDataDelta, isCostDataDeltaEmpty } from '@/app/lib/costDataDelta';
import type { CostTrackingData } from '@/app/types';
import { parseDateAsLocalDay } from '@/app/lib/localDateUtils';


export async function POST(request: NextRequest) {
  try {
    // Check if request is from admin domain
    const isAdmin = await isAdminDomain();
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    
    const costData = JSON.parse(await request.text(), dateReviver);
    
    // Generate a unique ID for this cost tracking data
    const id = Date.now().toString(36) + Math.random().toString(36).substr(2);
    
    // Use unified data service to save cost data
    const unifiedData = await updateCostData(id, {
      ...costData,
      id,
      createdAt: new Date().toISOString()
    });
    
    // Return legacy format for compatibility
    const legacyData = {
      id,
      ...costData,
      reservedBudget: costData.reservedBudget || 0,
      createdAt: unifiedData.createdAt
    };
    
    return NextResponse.json({ 
      success: true, 
      id,
      data: legacyData
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
    // Check if request is from admin domain
    const isAdmin = await isAdminDomain();
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    
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
    
    // Load unified trip data
    const unifiedData = await loadUnifiedTripData(cleanId);
    const syncedData = unifiedData
      ? await maybeSyncPendingYnabTransactions(cleanId, unifiedData)
      : null;
    const costDataSource = syncedData || unifiedData;

    if (!costDataSource?.costData) {
      return NextResponse.json(
        { error: 'Cost tracking data not found' },
        { status: 404 }
      );
    }
    
    // Validate trip boundaries
    const validation = validateAllTripBoundaries(costDataSource);
    if (!validation.isValid) {
      console.warn('Trip boundary violations detected in trip %s:', cleanId, validation.errors);
      // Continue processing but log the violations
    }
    
    // Extract cost data in legacy format for backward compatibility
    // Ensure all expenses belong to this trip (they should due to unified data structure)
    const costData = {
      id: `cost-${cleanId}`,
      tripId: cleanId,
      tripTitle: costDataSource.title,
      tripStartDate: costDataSource.startDate,
      tripEndDate: costDataSource.endDate,
      overallBudget: costDataSource.costData.overallBudget,
      reservedBudget: costDataSource.costData.reservedBudget || 0,
      currency: costDataSource.costData.currency,
      customCategories: costDataSource.costData.customCategories,
      countryBudgets: costDataSource.costData.countryBudgets,
      expenses: costDataSource.costData.expenses, // These are already trip-scoped by design
      ynabImportData: costDataSource.costData.ynabImportData,
      ynabConfig: costDataSource.costData.ynabConfig, // Include YNAB API configuration
      createdAt: costDataSource.createdAt,
      updatedAt: costDataSource.updatedAt,
      // Add validation status for monitoring
      hasValidationWarnings: !validation.isValid
    };
    
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
    // Check if request is from admin domain
    const isAdmin = await isAdminDomain();
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    
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
    
    const updatedData = JSON.parse(await request.text(), dateReviver);
    
    // Use unified data service to update cost data
    const unifiedData = await updateCostData(cleanId, updatedData);
    
    // Validate trip boundaries after update
    const validation = validateAllTripBoundaries(unifiedData);
    if (!validation.isValid) {
      console.warn('Trip boundary violations detected in trip %s:', cleanId, validation.errors);
      // Log warnings but don't fail the request - this is for monitoring
    }
    
    // Extract legacy format for response
    const legacyData = {
      id: cleanId,
      ...updatedData,
      reservedBudget: updatedData.reservedBudget || 0,
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

export async function PATCH(request: NextRequest) {
  try {
    const isAdmin = await isAdminDomain();
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json(
        { error: 'ID parameter is required' },
        { status: 400 }
      );
    }

    const cleanId = id.replace(/^(cost-)+/, '');
    const updateRequest = JSON.parse(await request.text(), dateReviver);

    if (updateRequest.deltaUpdate === undefined) {
      return NextResponse.json(
        { error: 'Invalid update request' },
        { status: 400 }
      );
    }

    const delta = updateRequest.deltaUpdate;
    if (!isCostDataDelta(delta)) {
      return NextResponse.json(
        { error: 'Invalid delta payload' },
        { status: 400 }
      );
    }

    if (isCostDataDeltaEmpty(delta)) {
      return NextResponse.json({
        success: true,
        message: 'No delta changes to apply'
      });
    }

    const unifiedData = await loadUnifiedTripData(cleanId);
    if (!unifiedData || !unifiedData.costData) {
      return NextResponse.json(
        { error: 'Cost tracking data not found' },
        { status: 404 }
      );
    }

    const baseCostData: CostTrackingData = {
      id: `cost-${cleanId}`,
      tripId: cleanId,
      tripTitle: unifiedData.title,
      tripStartDate: parseDateAsLocalDay(unifiedData.startDate) ?? new Date(),
      tripEndDate: parseDateAsLocalDay(unifiedData.endDate) ?? new Date(),
      overallBudget: unifiedData.costData.overallBudget,
      reservedBudget: unifiedData.costData.reservedBudget || 0,
      currency: unifiedData.costData.currency,
      customCategories: unifiedData.costData.customCategories,
      countryBudgets: unifiedData.costData.countryBudgets,
      expenses: unifiedData.costData.expenses,
      ynabImportData: unifiedData.costData.ynabImportData,
      ynabConfig: unifiedData.costData.ynabConfig,
      createdAt: unifiedData.createdAt,
      updatedAt: unifiedData.updatedAt
    };

    // Defensive merge: omitted fields are ignored, and removals only happen via explicit removedIds.
    const merged = applyCostDataDelta(baseCostData, delta);

    const updatedUnifiedData = await updateCostData(cleanId, {
      tripTitle: merged.tripTitle,
      tripStartDate: merged.tripStartDate,
      tripEndDate: merged.tripEndDate,
      overallBudget: merged.overallBudget,
      reservedBudget: merged.reservedBudget,
      currency: merged.currency,
      countryBudgets: merged.countryBudgets,
      expenses: merged.expenses,
      customCategories: merged.customCategories,
      ynabImportData: merged.ynabImportData,
      ynabConfig: merged.ynabConfig
    });

    const validation = validateAllTripBoundaries(updatedUnifiedData);
    if (!validation.isValid) {
      console.warn('Trip boundary violations detected in trip %s:', cleanId, validation.errors);
    }

    return NextResponse.json({
      success: true,
      message: 'Delta applied successfully',
      id: cleanId
    });
  } catch (error) {
    console.error('Error patching cost tracking data:', error);
    return NextResponse.json(
      { error: 'Failed to patch cost tracking data' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const isAdmin = await isAdminDomain();
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'ID parameter is required' }, { status: 400 });
    }

    const cleanId = id.replace(/^(cost-)+/, '');
    const trip = await loadUnifiedTripData(cleanId);
    if (!trip) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
    }
    if (!trip.costData) {
      return NextResponse.json({ error: 'Cost tracking data not found' }, { status: 404 });
    }

    await deleteCostTrackingWithBackup(cleanId);
    return NextResponse.json({
      success: true,
      message: `Cost tracking data for "${trip.title}" has been deleted and backed up`
    });
  } catch (error) {
    console.error('Error deleting cost tracking data:', error);
    return NextResponse.json({ error: 'Failed to delete cost tracking data' }, { status: 500 });
  }
}
