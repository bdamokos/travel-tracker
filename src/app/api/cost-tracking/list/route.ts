import { NextResponse } from 'next/server';
import { listAllTrips, getLegacyCostData } from '../../../lib/unifiedDataService';
import { Expense } from '../../../types';


export async function GET() {
  try {
    const trips = await listAllTrips();
    
    // Get cost entries with actual data
    const costEntries = await Promise.all(
      trips
        .filter(trip => trip.hasCost)
        .map(async (trip) => {
          try {
            // Load the actual cost data using the unified service
            const costData = await getLegacyCostData(trip.id);
            
            if (costData) {
              // Calculate totals
              const totalSpent = costData.expenses?.reduce((sum: number, expense: Expense) => sum + expense.amount, 0) || 0;
              const remainingBudget = (costData.overallBudget || 0) - totalSpent;
              
              return {
                id: costData.id,
                tripId: costData.tripId,
                tripTitle: costData.tripTitle,
                tripStartDate: costData.tripStartDate,
                tripEndDate: costData.tripEndDate,
                overallBudget: costData.overallBudget || 0,
                currency: costData.currency || 'EUR',
                totalSpent,
                remainingBudget,
                expenseCount: costData.expenses?.length || 0,
                countryBudgetCount: costData.countryBudgets?.length || 0,
                createdAt: costData.createdAt,
                updatedAt: costData.updatedAt || costData.createdAt
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