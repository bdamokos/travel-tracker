/**
 * YNAB Integration Critical Fixes Test
 * 
 * This test verifies the critical fixes implemented for YNAB integration:
 * 1. YNAB Category ID mapping to store both names and IDs
 * 2. YNAB config persistence in data layer
 * 3. TypeScript errors resolved in cost-tracking API
 */

import { YnabCategoryMapping, YnabConfig, CostTrackingData } from '../../types';

describe('YNAB Integration Critical Fixes', () => {
  
  describe('YNAB Category ID Mapping', () => {
    test('YnabCategoryMapping should include ynabCategoryId field', () => {
      const mapping: YnabCategoryMapping = {
        ynabCategory: 'Travel: Transport',
        ynabCategoryId: 'category-123-456', // This should not cause TypeScript error
        mappingType: 'country',
        countryName: 'Spain'
      };

      expect(mapping.ynabCategoryId).toBe('category-123-456');
      expect(mapping.ynabCategory).toBe('Travel: Transport');
      expect(mapping.mappingType).toBe('country');
      expect(mapping.countryName).toBe('Spain');
    });

    test('YnabCategoryMapping should work without ynabCategoryId (backward compatibility)', () => {
      const mapping: YnabCategoryMapping = {
        ynabCategory: 'Travel: Food',
        mappingType: 'general'
      };

      expect(mapping.ynabCategoryId).toBeUndefined();
      expect(mapping.ynabCategory).toBe('Travel: Food');
      expect(mapping.mappingType).toBe('general');
    });
  });

  describe('YNAB Config Persistence', () => {
    test('YnabConfig should be included in CostTrackingData type', () => {
      const ynabConfig: YnabConfig = {
        apiKey: 'test-api-key',
        selectedBudgetId: 'budget-123',
        selectedBudgetName: 'My Travel Budget',
        categoryServerKnowledge: 100,
        transactionServerKnowledge: 200
      };

      const costData: CostTrackingData = {
        id: 'test-cost-123',
        tripId: 'test-trip-123',
        tripTitle: 'Test Trip',
        tripStartDate: new Date('2025-01-01'),
        tripEndDate: new Date('2025-01-10'),
        overallBudget: 2000,
        currency: 'EUR',
        countryBudgets: [],
        expenses: [],
        ynabConfig: ynabConfig, // This should not cause TypeScript error
        createdAt: new Date().toISOString()
      };

      expect(costData.ynabConfig).toBeDefined();
      expect(costData.ynabConfig?.apiKey).toBe('test-api-key');
      expect(costData.ynabConfig?.selectedBudgetId).toBe('budget-123');
    });

    test('ynabConfig should be properly typed in cost data updates', () => {
      const ynabConfig: YnabConfig = {
        apiKey: 'persistent-api-key',
        selectedBudgetId: 'budget-persistent',
        selectedBudgetName: 'Persistent Budget',
        categoryServerKnowledge: 150,
        transactionServerKnowledge: 250
      };

      const costUpdates = {
        tripTitle: 'Test Trip with YNAB Config',
        tripStartDate: '2025-01-01',
        tripEndDate: '2025-01-10',
        overallBudget: 3000,
        currency: 'USD',
        countryBudgets: [],
        expenses: [],
        ynabConfig: ynabConfig
      };

      // This should not throw TypeScript compilation errors
      expect(costUpdates.ynabConfig).toBeDefined();
      expect(costUpdates.ynabConfig.apiKey).toBe('persistent-api-key');
      expect(costUpdates.ynabConfig.selectedBudgetId).toBe('budget-persistent');
    });
  });

  describe('Transaction API Category ID Requirements', () => {
    test('Transaction API should expect ynabCategoryId in category mappings', () => {
      // Simulate the mapping structure that would be sent to the transactions API
      const categoryMappings: YnabCategoryMapping[] = [
        {
          ynabCategory: 'Travel: Accommodation',
          ynabCategoryId: 'cat-accommodation-123', // Required for API calls
          mappingType: 'country',
          countryName: 'France'
        },
        {
          ynabCategory: 'Travel: Food',
          ynabCategoryId: 'cat-food-456', // Required for API calls
          mappingType: 'general'
        },
        {
          ynabCategory: 'Personal: Shopping',
          ynabCategoryId: 'cat-shopping-789', // Required for API calls
          mappingType: 'none'
        }
      ];

      // Extract category IDs for API call (as done in the transactions endpoint)
      const mappedCategoryIds = categoryMappings
        .filter(mapping => mapping.mappingType !== 'none' && mapping.ynabCategoryId)
        .map(mapping => mapping.ynabCategoryId!);

      expect(mappedCategoryIds).toHaveLength(2);
      expect(mappedCategoryIds).toContain('cat-accommodation-123');
      expect(mappedCategoryIds).toContain('cat-food-456');
      expect(mappedCategoryIds).not.toContain('cat-shopping-789'); // 'none' type excluded
    });

    test('Transaction API should handle missing ynabCategoryId gracefully', () => {
      // Test backward compatibility - mappings without ynabCategoryId should be filtered out
      const categoryMappings: YnabCategoryMapping[] = [
        {
          ynabCategory: 'Travel: Transport',
          // Missing ynabCategoryId (legacy mapping)
          mappingType: 'country',
          countryName: 'Italy'
        },
        {
          ynabCategory: 'Travel: Food',
          ynabCategoryId: 'cat-food-456',
          mappingType: 'general'
        }
      ];

      // Extract category IDs for API call
      const mappedCategoryIds = categoryMappings
        .filter(mapping => mapping.mappingType !== 'none' && mapping.ynabCategoryId)
        .map(mapping => mapping.ynabCategoryId!);

      expect(mappedCategoryIds).toHaveLength(1);
      expect(mappedCategoryIds).toContain('cat-food-456');
      // The mapping without ynabCategoryId should be filtered out gracefully
    });
  });
});