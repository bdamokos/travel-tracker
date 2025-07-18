/**
 * Manual test to verify cost tracking validation functionality
 * This test creates real trip data and tests the validation
 */

import { validateAllTripBoundaries } from '../../lib/tripBoundaryValidation';
import { loadUnifiedTripData, updateCostData, saveUnifiedTripData } from '../../lib/unifiedDataService';
import { UnifiedTripData } from '../../lib/dataMigration';
import { Expense } from '../../types';

describe('Cost Tracking Validation Manual Test', () => {
  const testTripId = `test-validation-${Date.now()}`;
  
  const createTestTripData = async (): Promise<UnifiedTripData> => {
    const tripData: UnifiedTripData = {
      schemaVersion: 4,
      id: testTripId,
      title: 'Validation Test Trip',
      description: 'Trip for testing validation',
      startDate: '2024-01-01',
      endDate: '2024-01-10',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      costData: {
        overallBudget: 1000,
        currency: 'EUR',
        countryBudgets: [],
        expenses: [{
          id: 'test-expense-1',
          date: new Date('2024-01-05'),
          amount: 100,
          currency: 'EUR',
          category: 'Food',
          country: 'Germany',
          description: 'Test restaurant',
          notes: 'Validation test expense',
          isGeneralExpense: false,
          expenseType: 'actual'
        }],
        ynabImportData: {
          mappings: [],
          importedTransactionHashes: []
        }
      },
      travelData: {
        locations: [{
          id: 'test-location-1',
          name: 'Test Restaurant',
          coordinates: { lat: 52.5, lng: 13.4 },
          country: 'Germany',
          costTrackingLinks: [{
            expenseId: 'test-expense-1',
            linkType: 'manual',
            notes: 'Valid test link'
          }]
        }],
        routes: [],
        days: []
      },
      accommodations: []
    };

    // Save the test trip data
    await saveUnifiedTripData(tripData);

    return tripData;
  };

  afterAll(async () => {
    // Clean up test data
    try {
      const fs = require('fs/promises');
      const path = require('path');
      const dataPath = path.join(process.cwd(), 'data', `trip-${testTripId}.json`);
      await fs.unlink(dataPath);
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it('should validate trip boundaries correctly with real data', async () => {
    const tripData = await createTestTripData();
    
    // Test validation with the created data
    const validation = validateAllTripBoundaries(tripData);
    
    expect(validation.isValid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it('should detect validation issues when expense links are invalid', async () => {
    const tripData = await createTestTripData();
    
    // Modify the trip data to have an invalid expense link
    tripData.travelData!.locations[0].costTrackingLinks = [{
      expenseId: 'non-existent-expense',
      linkType: 'manual',
      notes: 'Invalid link for testing'
    }];
    
    const validation = validateAllTripBoundaries(tripData);
    
    expect(validation.isValid).toBe(false);
    expect(validation.errors).toHaveLength(1);
    expect(validation.errors[0].type).toBe('EXPENSE_NOT_FOUND');
    expect(validation.errors[0].expenseId).toBe('non-existent-expense');
  });

  it('should handle cost data updates with validation', async () => {
    await createTestTripData();
    
    // Load the trip data
    const loadedData = await loadUnifiedTripData(testTripId);
    expect(loadedData).toBeTruthy();
    expect(loadedData!.id).toBe(testTripId);
    
    // Validate the loaded data
    const validation = validateAllTripBoundaries(loadedData!);
    expect(validation.isValid).toBe(true);
    
    // Add a new expense
    const newExpense: Expense = {
      id: 'test-expense-2',
      date: new Date('2024-01-06'),
      amount: 50,
      currency: 'EUR',
      category: 'Transport',
      country: 'Germany',
      description: 'Bus ticket',
      notes: 'Second test expense',
      isGeneralExpense: false,
      expenseType: 'actual'
    };

    const updatedExpenses = [...loadedData!.costData!.expenses, newExpense];
    
    // Update the cost data
    const updatedData = await updateCostData(testTripId, {
      overallBudget: loadedData!.costData!.overallBudget,
      currency: loadedData!.costData!.currency,
      countryBudgets: loadedData!.costData!.countryBudgets,
      expenses: updatedExpenses,
      ynabImportData: loadedData!.costData!.ynabImportData,
      tripTitle: loadedData!.title,
      tripStartDate: loadedData!.startDate,
      tripEndDate: loadedData!.endDate,
      createdAt: loadedData!.createdAt,
      updatedAt: new Date().toISOString()
    });
    
    // Validate the updated data
    const updatedValidation = validateAllTripBoundaries(updatedData);
    expect(updatedValidation.isValid).toBe(true);
    expect(updatedData.costData!.expenses).toHaveLength(2);
  });

  it('should maintain trip isolation when multiple trips exist', async () => {
    // Create first trip
    const trip1Data = await createTestTripData();
    
    // Create second trip with different ID
    const trip2Id = `test-validation-2-${Date.now()}`;
    const trip2Data: UnifiedTripData = {
      ...trip1Data,
      id: trip2Id,
      title: 'Second Validation Test Trip',
      costData: {
        ...trip1Data.costData!,
        expenses: [{
          id: 'test-expense-trip2',
          date: new Date('2024-01-07'),
          amount: 75,
          currency: 'EUR',
          category: 'Accommodation',
          country: 'France',
          description: 'Hotel in Paris',
          notes: 'Trip 2 expense',
          isGeneralExpense: false,
          expenseType: 'actual'
        }]
      },
      travelData: {
        locations: [{
          id: 'test-location-trip2',
          name: 'Paris Hotel',
          coordinates: { lat: 48.8566, lng: 2.3522 },
          country: 'France',
          costTrackingLinks: [{
            expenseId: 'test-expense-trip2',
            linkType: 'manual',
            notes: 'Trip 2 valid link'
          }]
        }],
        routes: [],
        days: []
      }
    };

    // Save second trip
    await saveUnifiedTripData(trip2Data);

    try {
      // Load both trips and validate they are isolated
      const loadedTrip1 = await loadUnifiedTripData(testTripId);
      const loadedTrip2 = await loadUnifiedTripData(trip2Id);
      
      expect(loadedTrip1).toBeTruthy();
      expect(loadedTrip2).toBeTruthy();
      
      // Validate both trips independently
      const validation1 = validateAllTripBoundaries(loadedTrip1!);
      const validation2 = validateAllTripBoundaries(loadedTrip2!);
      
      expect(validation1.isValid).toBe(true);
      expect(validation2.isValid).toBe(true);
      
      // Ensure expenses are isolated to their respective trips
      expect(loadedTrip1!.costData!.expenses[0].id).toBe('test-expense-1');
      expect(loadedTrip2!.costData!.expenses[0].id).toBe('test-expense-trip2');
      
      // Ensure travel items are isolated
      expect(loadedTrip1!.travelData!.locations[0].id).toBe('test-location-1');
      expect(loadedTrip2!.travelData!.locations[0].id).toBe('test-location-trip2');
      
    } finally {
      // Clean up second trip
      try {
        const fs = require('fs/promises');
        const path = require('path');
        const dataPath = path.join(process.cwd(), 'data', `trip-${trip2Id}.json`);
        await fs.unlink(dataPath);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });
});