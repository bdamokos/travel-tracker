import { NextResponse } from 'next/server';
import { listAllTrips, loadUnifiedTripData } from '../../../lib/unifiedDataService';
import { Expense } from '../../../types';
import { isAdminDomain } from '../../../lib/server-domains';
import { validateAllTripBoundaries } from '../../../lib/tripBoundaryValidation';


export async function GET() {
  try {
    // Check if request is from admin domain
    const isAdmin = await isAdminDomain();
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

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

              // Validate trip boundaries for this trip
              const validation = validateAllTripBoundaries(unifiedData);
              if (!validation.isValid) {
                console.warn(`Trip boundary violations detected in trip ${trip.id}:`, validation.errors);
                // Continue processing but log the violations
              }

              // Calculate totals - only include expenses that belong to this trip
              const tripExpenses = costData.expenses || [];
              const totalSpent = tripExpenses.reduce((sum: number, expense: Expense) => sum + expense.amount, 0);
              const remainingBudget = (costData.overallBudget || 0) - totalSpent;

              return {
                id: `cost-${trip.id}`,
                tripId: trip.id,
                tripTitle: unifiedData.title,
                tripStartDate: unifiedData.startDate,
                tripEndDate: unifiedData.endDate,
                overallBudget: costData.overallBudget || 0,
                currency: costData.currency || 'EUR',
                totalSpent,
                remainingBudget,
                expenseCount: tripExpenses.length,
                countryBudgetCount: costData.countryBudgets?.length || 0,
                createdAt: unifiedData.createdAt,
                updatedAt: unifiedData.updatedAt || unifiedData.createdAt,
                // Add validation status for monitoring
                hasValidationWarnings: !validation.isValid
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