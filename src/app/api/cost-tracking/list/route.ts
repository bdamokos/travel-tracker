import { NextResponse } from 'next/server';
import { readdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';

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
    const dataDir = join(process.cwd(), 'data');
    
    // Get all JSON files in the data directory
    let files: string[] = [];
    try {
      files = await readdir(dataDir);
    } catch (error) {
      // Data directory might not exist yet
      return NextResponse.json([]);
    }
    
    const costFiles = files.filter(file => file.startsWith('cost-') && file.endsWith('.json'));
    
    const costEntries = await Promise.all(
      costFiles.map(async (file) => {
        try {
          const filePath = join(dataDir, file);
          const fileContent = await readFile(filePath, 'utf-8');
          let costData = JSON.parse(fileContent);
          
          // Fix empty ID if needed
          costData = await fixEmptyId(filePath, costData);
          
          // Calculate basic totals for listing
          const totalBudget = costData.overallBudget || 0;
          const totalSpent = costData.expenses?.reduce((sum: number, expense: any) => sum + expense.amount, 0) || 0;
          const remainingBudget = totalBudget - totalSpent;
          
          // Return metadata for listing
          return {
            id: costData.id,
            tripId: costData.tripId,
            tripTitle: costData.tripTitle || 'Untitled Trip',
            tripStartDate: costData.tripStartDate,
            tripEndDate: costData.tripEndDate,
            overallBudget: totalBudget,
            currency: costData.currency || 'EUR',
            totalSpent,
            remainingBudget,
            expenseCount: costData.expenses?.length || 0,
            countryBudgetCount: costData.countryBudgets?.length || 0,
            createdAt: costData.createdAt,
            updatedAt: costData.updatedAt || costData.createdAt
          };
        } catch (error) {
          console.error(`Error reading cost file ${file}:`, error);
          return null;
        }
      })
    );
    
    // Filter out any null results and sort by creation date (newest first)
    const validCostEntries = costEntries
      .filter(entry => entry !== null)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    return NextResponse.json(validCostEntries);
  } catch (error) {
    console.error('Error listing cost tracking data:', error);
    return NextResponse.json(
      { error: 'Failed to list cost tracking data' },
      { status: 500 }
    );
  }
} 