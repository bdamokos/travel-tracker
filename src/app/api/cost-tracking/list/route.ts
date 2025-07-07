import { NextResponse } from 'next/server';
import { readdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { listAllTrips, getLegacyCostData } from '../../../lib/unifiedDataService';

// Helper function to generate unique ID
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Helper function to extract ID from filename
function extractIdFromFilename(filename: string): string {
  return filename.replace('cost-', '').replace('.json', '');
}

// Helper function to fix cost tracking file with empty ID
async function fixEmptyId(filePath: string, costData: any): Promise<any> {
  if (!costData.id || costData.id.trim() === '') {
    console.log(`Fixing empty ID for file: ${filePath}`);
    
    // Try to use the ID from the filename first
    const filename = filePath.split('/').pop() || '';
    let newId = extractIdFromFilename(filename);
    
    // If filename doesn't have a proper ID, generate a new one
    if (!newId || newId === '' || newId === 'undefined') {
      newId = generateId();
      console.log(`Generated new ID: ${newId}`);
    } else {
      console.log(`Using ID from filename: ${newId}`);
    }
    
    // Update the data with the new ID
    const updatedData = {
      ...costData,
      id: newId,
      updatedAt: new Date().toISOString()
    };
    
    // Save the fixed data back to the file
    await writeFile(filePath, JSON.stringify(updatedData, null, 2));
    console.log(`Fixed and saved cost tracking file with ID: ${newId}`);
    
    return updatedData;
  }
  
  return costData;
}

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
              const totalSpent = costData.expenses?.reduce((sum: number, expense: any) => sum + expense.amount, 0) || 0;
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