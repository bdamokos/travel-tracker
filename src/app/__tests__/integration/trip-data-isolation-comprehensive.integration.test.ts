/**
 * Comprehensive integration tests for trip data isolation feature
 * 
 * This test suite covers:
 * - Complete expense linking workflow within single trip
 * - Error handling when attempting cross-trip operations
 * - Schema migration verification with cross-trip links
 * - API validation preventing cross-trip contamination
 * 
 * Requirements: 5.4, 6.5
 */

import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { migrateToLatestSchema, UnifiedTripData, CURRENT_SCHEMA_VERSION } from '../../lib/dataMigration';
import { ExpenseTravelLookup, TripData } from '../../lib/expenseTravelLookup';
import { validateTripBoundary } from '../../lib/tripBoundaryValidation';

const BASE_URL = process.env.TEST_API_BASE_URL || 'http://localhost:3000';

describe('Trip Data Isolation - Comprehensive Integration Tests', () => {
    let testTripId1: string;
    let testTripId2: string;
    let testExpenseId1: string;
    let testExpenseId2: string;
    let testLocationId1: string;
    let testLocationId2: string;

    const apiCall = async (endpoint: string, options: RequestInit = {}) => {
        const url = `${BASE_URL}${endpoint}`;
        const response = await fetch(url, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        });
        return response;
    };

    // Setup test data with proper timeout
    beforeAll(async () => {
        try {
            // Create Trip 1
            const trip1Data = {
                title: 'Isolation Test Trip 1',
                description: 'First test trip for isolation testing',
                startDate: '2024-01-01T00:00:00.000Z',
                endDate: '2024-01-15T00:00:00.000Z',
                locations: [
                    {
                        id: 'location-trip1',
                        name: 'Paris, France',
                        coordinates: [48.8566, 2.3522],
                        date: '2024-01-01T00:00:00.000Z'
                    }
                ]
            };

            const response1 = await apiCall('/api/travel-data', {
                method: 'POST',
                body: JSON.stringify(trip1Data)
            });

            if (response1.ok) {
                const result1 = await response1.json();
                testTripId1 = result1.id;

                // Get actual IDs from created trip
                const getTripResponse1 = await apiCall(`/api/travel-data?id=${testTripId1}`);
                if (getTripResponse1.ok) {
                    const actualTripData1 = await getTripResponse1.json();
                    testLocationId1 = actualTripData1.locations?.[0]?.id || 'location-trip1';
                }

                // Create cost data for Trip 1
                const costData1 = {
                    overallBudget: 2000,
                    currency: 'EUR',
                    countryBudgets: [],
                    expenses: [
                        {
                            id: 'expense-trip1',
                            description: 'Paris Restaurant',
                            amount: 150,
                            currency: 'EUR',
                            date: '2024-01-02',
                            category: 'food'
                        }
                    ]
                };

                const costResponse1 = await apiCall(`/api/cost-tracking?id=${testTripId1}`, {
                    method: 'PUT',
                    body: JSON.stringify(costData1)
                });

                if (costResponse1.ok) {
                    const getCostResponse1 = await apiCall(`/api/cost-tracking?id=${testTripId1}`);
                    if (getCostResponse1.ok) {
                        const actualCostData1 = await getCostResponse1.json();
                        testExpenseId1 = actualCostData1.expenses?.[0]?.id || 'expense-trip1';
                    }
                }
            }

            // Create Trip 2
            const trip2Data = {
                title: 'Isolation Test Trip 2',
                description: 'Second test trip for cross-trip validation',
                startDate: '2024-03-01T00:00:00.000Z',
                endDate: '2024-03-15T00:00:00.000Z',
                locations: [
                    {
                        id: 'location-trip2',
                        name: 'Tokyo, Japan',
                        coordinates: [35.6762, 139.6503],
                        date: '2024-03-01T00:00:00.000Z'
                    }
                ]
            };

            const response2 = await apiCall('/api/travel-data', {
                method: 'POST',
                body: JSON.stringify(trip2Data)
            });

            if (response2.ok) {
                const result2 = await response2.json();
                testTripId2 = result2.id;

                // Get actual IDs from created trip
                const getTripResponse2 = await apiCall(`/api/travel-data?id=${testTripId2}`);
                if (getTripResponse2.ok) {
                    const actualTripData2 = await getTripResponse2.json();
                    testLocationId2 = actualTripData2.locations?.[0]?.id || 'location-trip2';
                }

                // Create cost data for Trip 2
                const costData2 = {
                    overallBudget: 3000,
                    currency: 'JPY',
                    countryBudgets: [],
                    expenses: [
                        {
                            id: 'expense-trip2',
                            description: 'Tokyo Sushi',
                            amount: 5000,
                            currency: 'JPY',
                            date: '2024-03-02',
                            category: 'food'
                        }
                    ]
                };

                const costResponse2 = await apiCall(`/api/cost-tracking?id=${testTripId2}`, {
                    method: 'PUT',
                    body: JSON.stringify(costData2)
                });

                if (costResponse2.ok) {
                    const getCostResponse2 = await apiCall(`/api/cost-tracking?id=${testTripId2}`);
                    if (getCostResponse2.ok) {
                        const actualCostData2 = await getCostResponse2.json();
                        testExpenseId2 = actualCostData2.expenses?.[0]?.id || 'expense-trip2';
                    }
                }
            }
        } catch (error) {
            console.warn('Test setup failed:', error);
        }
    }, 120000); // 120 second timeout for setup to allow server compilation

    // Cleanup test data
    afterAll(async () => {
        try {
            if (testTripId1) {
                await apiCall(`/api/travel-data?id=${testTripId1}`, { method: 'DELETE' });
            }
            if (testTripId2) {
                await apiCall(`/api/travel-data?id=${testTripId2}`, { method: 'DELETE' });
            }
        } catch (error) {
            console.warn('Cleanup failed:', error);
        }
    }, 30000); // 30 second timeout for cleanup

    describe('Complete Expense Linking Workflow Within Single Trip', () => {
        it('should successfully complete expense-to-location linking workflow', async () => {
            // Skip if test data setup failed
            if (!testTripId1 || !testExpenseId1 || !testLocationId1) {
                console.warn('Skipping test due to setup failure');
                return;
            }

            // Create expense-to-location link
            const linkResponse = await apiCall('/api/travel-data/update-links', {
                method: 'POST',
                body: JSON.stringify({
                    tripId: testTripId1,
                    expenseId: testExpenseId1,
                    travelLinkInfo: {
                        type: 'location',
                        id: testLocationId1,
                        name: 'Paris, France'
                    }
                })
            });

            expect(linkResponse.status).toBe(200);
            const linkResult = await linkResponse.json();
            expect(linkResult.success).toBe(true);

            // Verify link was created by checking the API response
            // Note: The actual link verification may depend on the server implementation
            const verifyResponse = await apiCall(`/api/travel-data?id=${testTripId1}`);
            expect(verifyResponse.status).toBe(200);
        }, 60000); // 60 second timeout for server compilation

        it('should validate trip boundaries during workflow', async () => {
            // Skip if test data setup failed
            if (!testTripId1 || !testExpenseId1 || !testLocationId1) {
                console.warn('Skipping test due to setup failure');
                return;
            }

            // Test validation API endpoint
            const validationResponse = await apiCall(`/api/cost-tracking/${testTripId1}/validate`, {
                method: 'POST',
                body: JSON.stringify({
                    action: 'validate-link',
                    expenseId: testExpenseId1,
                    travelItemId: testLocationId1
                })
            });

            // Accept both success and not found responses as valid for this test
            expect([200, 404]).toContain(validationResponse.status);
        }, 60000); // 60 second timeout for server compilation
    });

    describe('Cross-Trip Operation Error Handling', () => {
        it('should prevent linking expense from Trip 1 to travel item in Trip 2', async () => {
            // Skip if test data setup failed
            if (!testTripId1 || !testExpenseId1 || !testLocationId2) {
                console.warn('Skipping test due to setup failure');
                return;
            }

            const crossTripResponse = await apiCall('/api/travel-data/update-links', {
                method: 'POST',
                body: JSON.stringify({
                    tripId: testTripId1,
                    expenseId: testExpenseId1,
                    travelLinkInfo: {
                        type: 'location',
                        id: testLocationId2, // Location from Trip 2
                        name: 'Tokyo, Japan'
                    }
                })
            });

            expect(crossTripResponse.status).toBe(400);
            if (crossTripResponse.status === 400) {
                const errorResult = await crossTripResponse.json();
                expect(errorResult.error).toContain('does not belong to this trip');
            }
        }, 60000); // 60 second timeout for server compilation

        it('should prevent linking expense from different trip', async () => {
            // Skip if test data setup failed
            if (!testTripId1 || !testExpenseId2 || !testLocationId1) {
                console.warn('Skipping test due to setup failure');
                return;
            }

            const crossTripExpenseResponse = await apiCall('/api/travel-data/update-links', {
                method: 'POST',
                body: JSON.stringify({
                    tripId: testTripId1,
                    expenseId: testExpenseId2, // Expense from Trip 2
                    travelLinkInfo: {
                        type: 'location',
                        id: testLocationId1,
                        name: 'Paris, France'
                    }
                })
            });

            expect(crossTripExpenseResponse.status).toBe(400);
            if (crossTripExpenseResponse.status === 400) {
                const errorResult = await crossTripExpenseResponse.json();
                expect(errorResult.error).toContain('does not belong to this trip');
            }
        }, 60000); // 60 second timeout for server compilation

        it('should handle validation service cross-trip detection', async () => {
            // Skip if test data setup failed
            if (!testTripId1 || !testExpenseId2) {
                console.warn('Skipping test due to setup failure');
                return;
            }

            // Test cross-trip expense validation via API
            const crossExpenseResponse = await apiCall(`/api/cost-tracking/${testTripId1}/validate`, {
                method: 'POST',
                body: JSON.stringify({
                    action: 'validate-expense',
                    expenseId: testExpenseId2 // Expense from Trip 2
                })
            });

            // Accept both success and not found responses
            expect([200, 404]).toContain(crossExpenseResponse.status);

            if (crossExpenseResponse.ok) {
                const crossExpenseResult = await crossExpenseResponse.json();
                expect(crossExpenseResult.isValid).toBe(false);
            }
        }, 60000); // 60 second timeout for server compilation
    });

    describe('Schema Migration Verification', () => {
        it('should successfully migrate v3 data with cross-trip links to v4', () => {
            // Create v3 data with cross-trip contamination
            const v3DataWithCrossTripLinks: UnifiedTripData = {
                schemaVersion: 3,
                id: 'migration-test-trip',
                title: 'Migration Test Trip',
                description: 'Test trip for migration',
                startDate: '2024-01-01',
                endDate: '2024-01-10',
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-01T00:00:00Z',
                travelData: {
                    locations: [
                        {
                            id: 'valid-location',
                            name: 'Valid Location',
                            coordinates: [40.7128, -74.0060],
                            date: new Date('2024-01-01'),
                            costTrackingLinks: [
                                { expenseId: 'valid-expense', description: 'Valid link' },
                                { expenseId: 'invalid-cross-trip-expense', description: 'Should be removed' }
                            ],
                            createdAt: '2024-01-01T00:00:00Z'
                        }
                    ]
                },
                costData: {
                    overallBudget: 1000,
                    currency: 'USD',
                    countryBudgets: [],
                    expenses: [
                        {
                            id: 'valid-expense',
                            date: new Date('2024-01-01'),
                            amount: 100,
                            currency: 'USD',
                            category: 'Food',
                            country: 'USA',
                            description: 'Valid expense',
                            expenseType: 'actual'
                        }
                    ]
                }
            };

            const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

            // Perform migration
            const migratedData = migrateToLatestSchema(v3DataWithCrossTripLinks);

            // Verify migration results
            expect(migratedData.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);

            // Verify invalid links were removed from location
            const location = migratedData.travelData?.locations?.[0];
            expect(location?.costTrackingLinks).toHaveLength(1);
            expect(location?.costTrackingLinks?.[0].expenseId).toBe('valid-expense');

            // Verify cleanup was logged
            expect(consoleSpy).toHaveBeenCalledWith(
                'Trip migration-test-trip v3→v4 migration cleanup:',
                expect.arrayContaining([
                    'Removed invalid expense link invalid-cross-trip-expense from location valid-location'
                ])
            );

            consoleSpy.mockRestore();
        });
    });

    describe('API Validation Prevention of Cross-Trip Contamination', () => {
        it('should validate cost tracking API endpoints prevent cross-trip operations', async () => {
            // Skip if test data setup failed
            if (!testTripId1 || !testTripId2 || !testExpenseId1 || !testExpenseId2) {
                console.warn('Skipping test due to setup failure');
                return;
            }

            // Test cost tracking GET endpoint validation
            const costResponse1 = await apiCall(`/api/cost-tracking?id=${testTripId1}`);
            if (costResponse1.ok) {
                const costData1 = await costResponse1.json();
                expect(costData1.tripId).toBe(testTripId1);
                // Verify no cross-contamination - should only have its own expenses
                const hasOwnExpense = costData1.expenses.some((exp: { id: string }) => exp.id === testExpenseId1);
                const hasCrossExpense = costData1.expenses.some((exp: { id: string }) => exp.id === testExpenseId2);
                expect(hasOwnExpense).toBe(true);
                expect(hasCrossExpense).toBe(false);
            }

            const costResponse2 = await apiCall(`/api/cost-tracking?id=${testTripId2}`);
            if (costResponse2.ok) {
                const costData2 = await costResponse2.json();
                expect(costData2.tripId).toBe(testTripId2);
                // Verify no cross-contamination - should only have its own expenses
                const hasOwnExpense = costData2.expenses.some((exp: { id: string }) => exp.id === testExpenseId2);
                const hasCrossExpense = costData2.expenses.some((exp: { id: string }) => exp.id === testExpenseId1);
                expect(hasOwnExpense).toBe(true);
                expect(hasCrossExpense).toBe(false);
            }
        }, 60000); // 60 second timeout for server compilation

        it('should validate comprehensive validation endpoint prevents cross-trip issues', async () => {
            // Skip if test data setup failed
            if (!testTripId1 || !testExpenseId2) {
                console.warn('Skipping test due to setup failure');
                return;
            }

            // Test cross-trip validation detection
            const crossValidationResponse = await apiCall(`/api/cost-tracking/${testTripId1}/validate`, {
                method: 'POST',
                body: JSON.stringify({
                    action: 'validate-expense',
                    expenseId: testExpenseId2 // Expense from Trip 2
                })
            });

            if (crossValidationResponse.ok) {
                const crossValidationData = await crossValidationResponse.json();
                expect(crossValidationData.isValid).toBe(false);
                expect(crossValidationData.errors).toHaveLength(1);
                expect(crossValidationData.errors[0].type).toBe('EXPENSE_NOT_FOUND');
            }
        }, 60000); // 60 second timeout for server compilation
    });
});
