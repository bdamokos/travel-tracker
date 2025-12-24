import { describe, it, expect } from '@jest/globals';
import { filterNewTransactions, updateLastImportedTransaction, findLatestTransaction } from '@/app/lib/ynabUtils';
import { ProcessedYnabTransaction, YnabImportData } from '@/app/types';

// Mock data helpers
const createMockTransaction = (id: number, date: string, hash: string): ProcessedYnabTransaction => ({
  originalTransaction: {
    Account: 'Test Account',
    Flag: '',
    Date: date,
    Payee: `Test Payee ${id}`,
    'Category Group/Category': 'Test Category',
    'Category Group': 'Test Group',
    Category: 'Test Category',
    Memo: `Test memo ${id}`,
    Outflow: '10.00',
    Inflow: '0.00',
    Cleared: 'C'
  },
  amount: 10.00,
  date: date,
  description: `Test Payee ${id}`,
  memo: `Test memo ${id}`,
  mappedCountry: 'Test Country',
  isGeneralExpense: false,
  hash: hash
});

const createMockTransactions = (): ProcessedYnabTransaction[] => [
  createMockTransaction(1, '2023-01-01', 'hash1'),
  createMockTransaction(2, '2023-01-02', 'hash2'),
  createMockTransaction(3, '2023-01-03', 'hash3'),
  createMockTransaction(4, '2023-01-04', 'hash4'),
  createMockTransaction(5, '2023-01-05', 'hash5')
];

describe('YNAB Transaction Filtering', () => {
  describe('filterNewTransactions', () => {
    it('should return all transactions when no last imported hash provided', () => {
      const transactions = createMockTransactions();
      const result = filterNewTransactions(transactions);
      
      expect(result.newTransactions).toHaveLength(transactions.length);
      expect(result.filteredCount).toBe(0);
      expect(result.lastTransactionFound).toBe(false);
    });

    it('should return all transactions when last imported hash is undefined', () => {
      const transactions = createMockTransactions();
      const result = filterNewTransactions(transactions, undefined);
      
      expect(result.newTransactions).toHaveLength(transactions.length);
      expect(result.filteredCount).toBe(0);
      expect(result.lastTransactionFound).toBe(false);
    });

    it('should filter transactions after last imported when hash is found', () => {
      const transactions = createMockTransactions();
      const lastImportedHash = transactions[2].hash; // hash3
      const result = filterNewTransactions(transactions, lastImportedHash);
      
      expect(result.newTransactions).toHaveLength(2); // hash4 and hash5
      expect(result.filteredCount).toBe(3); // hash1, hash2, hash3
      expect(result.lastTransactionFound).toBe(true);
      expect(result.newTransactions[0].hash).toBe('hash4');
      expect(result.newTransactions[1].hash).toBe('hash5');
    });

    it('should handle last imported transaction at the end', () => {
      const transactions = createMockTransactions();
      const lastImportedHash = transactions[4].hash; // hash5 (last one)
      const result = filterNewTransactions(transactions, lastImportedHash);
      
      expect(result.newTransactions).toHaveLength(0);
      expect(result.filteredCount).toBe(5); // All transactions filtered
      expect(result.lastTransactionFound).toBe(true);
    });

    it('should handle last imported transaction at the beginning', () => {
      const transactions = createMockTransactions();
      const lastImportedHash = transactions[0].hash; // hash1 (first one)
      const result = filterNewTransactions(transactions, lastImportedHash);
      
      expect(result.newTransactions).toHaveLength(4); // hash2, hash3, hash4, hash5
      expect(result.filteredCount).toBe(1); // hash1
      expect(result.lastTransactionFound).toBe(true);
    });

    it('should handle last imported transaction not found', () => {
      const transactions = createMockTransactions();
      const result = filterNewTransactions(transactions, 'nonexistent-hash');
      
      expect(result.newTransactions).toHaveLength(transactions.length);
      expect(result.filteredCount).toBe(0);
      expect(result.lastTransactionFound).toBe(false);
    });

    it('should handle empty transaction list', () => {
      const result = filterNewTransactions([], 'some-hash');
      
      expect(result.newTransactions).toHaveLength(0);
      expect(result.filteredCount).toBe(0);
      expect(result.lastTransactionFound).toBe(false);
    });

    it('should sort transactions chronologically before filtering', () => {
      const transactions = [
        createMockTransaction(1, '2023-01-05', 'hash5'),
        createMockTransaction(2, '2023-01-01', 'hash1'),
        createMockTransaction(3, '2023-01-03', 'hash3'),
        createMockTransaction(4, '2023-01-02', 'hash2'),
        createMockTransaction(5, '2023-01-04', 'hash4')
      ];
      
      const result = filterNewTransactions(transactions, 'hash3');
      
      expect(result.newTransactions).toHaveLength(2);
      expect(result.filteredCount).toBe(3);
      expect(result.lastTransactionFound).toBe(true);
      // Should return hash4 and hash5 (after hash3 chronologically)
      expect(result.newTransactions[0].hash).toBe('hash4');
      expect(result.newTransactions[1].hash).toBe('hash5');
    });
  });

  describe('updateLastImportedTransaction', () => {
    it('should update last imported transaction data', () => {
      const transactions = createMockTransactions();
      const existingData: YnabImportData = {
        mappings: [],
        importedTransactionHashes: ['existing-hash']
      };
      
      const result = updateLastImportedTransaction(transactions, existingData);
      
      expect(result.lastImportedTransactionHash).toBe('hash5'); // Latest transaction
      expect(result.lastImportedTransactionDate).toBe('2023-01-05');
      expect(result.importedTransactionHashes).toHaveLength(6); // 1 existing + 5 new
      expect(result.importedTransactionHashes).toContain('existing-hash');
      expect(result.importedTransactionHashes).toContain('hash1');
      expect(result.importedTransactionHashes).toContain('hash5');
    });

    it('should store both base hash and instance key when sourceIndex is present', () => {
      const transactions: ProcessedYnabTransaction[] = [
        { ...createMockTransaction(1, '2023-01-01', 'hash1'), sourceIndex: 7 },
        { ...createMockTransaction(2, '2023-01-02', 'hash2'), sourceIndex: 8 }
      ];

      const existingData: YnabImportData = {
        mappings: [],
        importedTransactionHashes: []
      };

      const result = updateLastImportedTransaction(transactions, existingData);

      expect(result.importedTransactionHashes).toContain('hash1');
      expect(result.importedTransactionHashes).toContain('hash1-7');
      expect(result.importedTransactionHashes).toContain('hash2');
      expect(result.importedTransactionHashes).toContain('hash2-8');
    });

    it('should not duplicate imported transaction tracking keys', () => {
      const transactions: ProcessedYnabTransaction[] = [
        { ...createMockTransaction(1, '2023-01-01', 'hash1'), sourceIndex: 7 }
      ];

      const existingData: YnabImportData = {
        mappings: [],
        importedTransactionHashes: ['hash1', 'hash1-7']
      };

      const result = updateLastImportedTransaction(transactions, existingData);

      expect(result.importedTransactionHashes).toEqual(['hash1', 'hash1-7']);
    });

    it('should handle empty imported transactions', () => {
      const existingData: YnabImportData = {
        mappings: [],
        importedTransactionHashes: ['existing-hash']
      };
      
      const result = updateLastImportedTransaction([], existingData);
      
      expect(result).toEqual(existingData);
    });

    it('should find chronologically latest transaction', () => {
      const transactions = [
        createMockTransaction(1, '2023-01-05', 'hash5'),
        createMockTransaction(2, '2023-01-01', 'hash1'),
        createMockTransaction(3, '2023-01-10', 'hash10'), // Latest
        createMockTransaction(4, '2023-01-03', 'hash3')
      ];
      
      const existingData: YnabImportData = {
        mappings: [],
        importedTransactionHashes: []
      };
      
      const result = updateLastImportedTransaction(transactions, existingData);
      
      expect(result.lastImportedTransactionHash).toBe('hash10');
      expect(result.lastImportedTransactionDate).toBe('2023-01-10');
    });

    it('should preserve existing mappings', () => {
      const transactions = [createMockTransaction(1, '2023-01-01', 'hash1')];
      const existingData: YnabImportData = {
        mappings: [
          {
            ynabCategory: 'Test Category',
            mappingType: 'country',
            countryName: 'Test Country'
          }
        ],
        importedTransactionHashes: [],
        lastImportedTransactionHash: 'old-hash',
        lastImportedTransactionDate: '2023-01-01'
      };
      
      const result = updateLastImportedTransaction(transactions, existingData);
      
      expect(result.mappings).toHaveLength(1);
      expect(result.mappings[0].ynabCategory).toBe('Test Category');
      expect(result.lastImportedTransactionHash).toBe('hash1');
    });
  });

  describe('findLatestTransaction', () => {
    it('should find the latest transaction by date', () => {
      const transactions = [
        createMockTransaction(1, '2023-01-01', 'hash1'),
        createMockTransaction(2, '2023-01-05', 'hash5'),
        createMockTransaction(3, '2023-01-03', 'hash3'),
        createMockTransaction(4, '2023-01-10', 'hash10') // Latest
      ];
      
      const result = findLatestTransaction(transactions);
      
      expect(result).not.toBeNull();
      expect(result?.hash).toBe('hash10');
      expect(result?.date).toBe('2023-01-10');
    });

    it('should return null for empty transaction list', () => {
      const result = findLatestTransaction([]);
      
      expect(result).toBeNull();
    });

    it('should handle single transaction', () => {
      const transactions = [createMockTransaction(1, '2023-01-01', 'hash1')];
      
      const result = findLatestTransaction(transactions);
      
      expect(result).not.toBeNull();
      expect(result?.hash).toBe('hash1');
    });

    it('should handle transactions with same date', () => {
      const transactions = [
        createMockTransaction(1, '2023-01-01', 'hash1'),
        createMockTransaction(2, '2023-01-01', 'hash2'),
        createMockTransaction(3, '2023-01-01', 'hash3')
      ];
      
      const result = findLatestTransaction(transactions);
      
      expect(result).not.toBeNull();
      // Should return one of the transactions (the last one processed)
      expect(['hash1', 'hash2', 'hash3']).toContain(result?.hash);
    });
  });
});
