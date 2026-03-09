import { NextRequest, NextResponse } from 'next/server';
import { listAllTrips, loadUnifiedTripData } from '@/app/lib/unifiedDataService';
import { CostTrackingData, Expense } from '@/app/types';
import { isAdminDomain } from '@/app/lib/server-domains';
import { validateAllTripBoundaries } from '@/app/lib/tripBoundaryValidation';

function buildLegacyCostData(tripId: string, unifiedData: Awaited<ReturnType<typeof loadUnifiedTripData>>): CostTrackingData | null {
  if (!unifiedData?.costData) {
    return null;
  }

  return {
    id: `cost-${tripId}`,
    tripId,
    tripTitle: unifiedData.title,
    tripStartDate: unifiedData.startDate as unknown as Date,
    tripEndDate: unifiedData.endDate as unknown as Date,
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
}

export async function GET(request: NextRequest) {
  try {
    // Check if request is from admin domain
    const isAdmin = await isAdminDomain();
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const includeCostData = request.nextUrl.searchParams.get('includeCostData') === '1';
    const trips = await listAllTrips();

    // Get cost entries with actual data
    const costEntries = await Promise.all(
      trips
        .filter(trip => trip.hasCost)
        .map(async (trip) => {
          try {
            // Load the actual cost data using the unified service
            const unifiedData = await loadUnifiedTripData(trip.id);

            if (unifiedData?.costData) {
              const costData = unifiedData.costData;
              const legacyCostData = includeCostData
                ? buildLegacyCostData(trip.id, unifiedData)
                : null;
              const reservedBudget = Math.max(0, costData.reservedBudget || 0);
              const totalBudget = costData.overallBudget || 0;
              const spendableBudget = Math.max(0, totalBudget - reservedBudget);

              // Validate trip boundaries for this trip
              const validation = validateAllTripBoundaries(unifiedData);
              if (!validation.isValid) {
                console.warn(`Trip boundary violations detected in trip ${trip.id}:`, validation.errors);
                // Continue processing but log the violations
              }

              // Calculate totals - only include expenses that belong to this trip
              const tripExpenses = costData.expenses || [];
              const totalCommitted = tripExpenses.reduce((sum: number, expense: Expense) => sum + expense.amount, 0);
              const totalSpent = tripExpenses
                .filter((expense) => (expense.expenseType || 'actual') === 'actual')
                .reduce((sum, expense) => sum + expense.amount, 0);
              const remainingBudget = spendableBudget - totalCommitted;

              return {
                id: `cost-${trip.id}`,
                tripId: trip.id,
                tripTitle: unifiedData.title,
                tripStartDate: unifiedData.startDate,
                tripEndDate: unifiedData.endDate,
                overallBudget: costData.overallBudget || 0,
                reservedBudget,
                spendableBudget,
                currency: costData.currency || 'EUR',
                totalSpent,
                remainingBudget,
                expenseCount: tripExpenses.length,
                countryBudgetCount: costData.countryBudgets?.length || 0,
                createdAt: unifiedData.createdAt,
                updatedAt: unifiedData.updatedAt || unifiedData.createdAt,
                // Add validation status for monitoring
                hasValidationWarnings: !validation.isValid,
                costData: legacyCostData ?? undefined
              };
            } else {
              // Return null if no cost data found
              return null;
            }
          } catch (error) {
            console.error(`Error loading cost data for trip ${trip.id}:`, error);
            return null;
          }
        })
    );

    // Filter out null entries
    const validCostEntries = costEntries.filter(entry => entry !== null);

    return NextResponse.json(validCostEntries);
  } catch (error) {
    console.error('Error listing cost tracking data:', error);
    return NextResponse.json(
      { error: 'Failed to list cost tracking data' },
      { status: 500 }
    );
  }
} 
