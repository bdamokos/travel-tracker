import { NextRequest, NextResponse } from 'next/server';
import { updateCostData, loadUnifiedTripData } from '@/app/lib/unifiedDataService';
import { maybeSyncPendingYnabTransactions } from '@/app/lib/ynabPendingSync';
import { isAdminDomain } from '@/app/lib/server-domains';
import { validateAllTripBoundaries } from '@/app/lib/tripBoundaryValidation';
import { dateReviver } from '@/app/lib/jsonDateReviver';


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
