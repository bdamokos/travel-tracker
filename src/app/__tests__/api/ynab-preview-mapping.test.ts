/** @jest-environment node */

import { readFile } from 'fs/promises';
import { NextRequest } from 'next/server';

import { POST } from '@/app/api/cost-tracking/[id]/ynab-process/route';
import { isAdminDomain } from '@/app/lib/server-domains';
import { loadUnifiedTripData, updateCostData } from '@/app/lib/unifiedDataService';
import { createTransactionHash } from '@/app/lib/ynabUtils';
import type { YnabCategoryMapping, YnabImportData, YnabTransaction } from '@/app/types';

jest.mock('fs/promises', () => ({ readFile: jest.fn() }));
jest.mock('@/app/lib/server-domains', () => ({ isAdminDomain: jest.fn() }));
jest.mock('@/app/lib/unifiedDataService', () => ({
  loadUnifiedTripData: jest.fn(),
  updateCostData: jest.fn(),
}));
jest.mock('@/app/lib/dataFilePaths', () => ({
  getTempYnabFilePath: jest.fn(() => '/synthetic/preview.json'),
}));
jest.mock('@/app/lib/ynabServerUtils', () => ({
  cleanupTempFile: jest.fn(),
  cleanupOldTempFiles: jest.fn(),
}));
jest.mock('@/app/lib/expenseLinkingService', () => ({ createExpenseLinkingService: jest.fn() }));
jest.mock('@/app/lib/tripBoundaryValidation', () => ({ validateAllTripBoundaries: jest.fn() }));

const transaction = (overrides: Partial<YnabTransaction> = {}): YnabTransaction => ({
  Account: 'Synthetic account',
  Flag: '',
  Date: '02/01/2024',
  Payee: 'Synthetic payee',
  'Category Group/Category': 'Travel/Food',
  'Category Group': 'Travel',
  Category: 'Food',
  Memo: 'Synthetic memo',
  Outflow: '€12,50',
  Inflow: '€0,00',
  Cleared: 'C',
  ...overrides,
});

async function preview(
  transactions: YnabTransaction[],
  mappings: YnabCategoryMapping[],
  options: { showAll?: boolean; importData?: Partial<YnabImportData> } = {}
) {
  jest.mocked(readFile).mockResolvedValue(JSON.stringify({ transactions }));
  jest.mocked(loadUnifiedTripData).mockResolvedValue({
    schemaVersion: 9,
    id: 'synthetic-trip',
    title: 'Synthetic trip',
    description: '',
    startDate: '2024-01-01',
    endDate: '2024-01-31',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    costData: {
      overallBudget: 0,
      currency: 'EUR',
      countryBudgets: [],
      expenses: [],
      ynabImportData: { mappings: [], importedTransactionHashes: [], ...options.importData },
    },
  });
  const request = new NextRequest('https://admin.example.test/api/cost-tracking/cost-synthetic-trip/ynab-process', {
    method: 'POST',
    body: '{}',
  });
  // Keep mapping getters intact so the test can count work at the public route boundary.
  jest.spyOn(request, 'json').mockResolvedValue({
    action: 'process', tempFileId: 'synthetic-preview', mappings, showAll: options.showAll,
  });
  return POST(request, { params: Promise.resolve({ id: 'cost-synthetic-trip' }) });
}

describe('YNAB file preview category mapping', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(isAdminDomain).mockResolvedValue(true);
  });

  afterEach(() => {
    expect(updateCostData).not.toHaveBeenCalled();
  });

  it.each(['none', 'general'] as const)('uses linear lookup work for many distinct %s mappings', async mappingType => {
    const reads: number[] = [];
    for (const size of [256, 512]) {
      let categoryReads = 0;
      const mappings: YnabCategoryMapping[] = Array.from({ length: size }, (_, index) => ({
        get ynabCategory() {
          categoryReads += 1;
          return `Category ${index}`;
        },
        mappingType,
      }));
      const transactions = Array.from({ length: size }, (_, index) => transaction({ Category: `Category ${index}` }));
      const response = await preview(transactions, mappings);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.totalCount).toBe(mappingType === 'none' ? 0 : size);
      expect(result.totalTransactions).toBe(mappingType === 'none' ? 0 : size);
      expect(categoryReads).toBeLessThanOrEqual(4 * (mappings.length + transactions.length));
      reads.push(categoryReads);
    }
    expect(reads[0]).toBeGreaterThan(0);
    expect(reads[1]).toBeLessThanOrEqual(2 * reads[0]);
  });

  it.each([
    ['country', 'general'],
    ['general', 'country'],
    ['none', 'country'],
    ['country', 'none'],
  ] as const)('keeps the first duplicate mapping (%s before %s)', async (first, second) => {
    const response = await preview([transaction()], [
      { ynabCategory: 'Food', mappingType: first, countryName: 'First country' },
      { ynabCategory: 'Food', mappingType: second, countryName: 'Second country' },
    ]);
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.totalCount).toBe(first === 'none' ? 0 : 1);
    if (first !== 'none') {
      expect(result.transactions[0]).toMatchObject({
        mappedCountry: first === 'general' ? '' : 'First country',
        isGeneralExpense: first === 'general',
      });
    }
  });

  it('matches exact category strings, including empty and prototype-looking names', async () => {
    const categories = ['__proto__', 'constructor', 'toString', '', 'Food', 'food', ' Food '];
    const response = await preview(
      categories.map(Category => transaction({ Category })),
      categories.map((ynabCategory, index) => ({ ynabCategory, mappingType: 'country', countryName: `Country ${index}` }))
    );
    const result = await response.json();

    expect(result.transactions.map((item: { mappedCountry: string }) => item.mappedCountry))
      .toEqual(categories.map((_, index) => `Country ${index}`));
  });

  it('skips unmapped and none categories before validating dates, and preserves source indices', async () => {
    const valid = transaction();
    const response = await preview([
      transaction({ Category: 'Unmapped', Date: 'bad' }),
      transaction({ Category: 'Excluded', Date: 'bad' }),
      transaction({ Date: '31/02/2024' }),
      valid,
      transaction({ Payee: 'Refund', Outflow: '€0,00', Inflow: '€3,25' }),
    ], [
      { ynabCategory: 'Food', mappingType: 'country' },
      { ynabCategory: 'Excluded', mappingType: 'none' },
    ]);
    const result = await response.json();
    const hash = createTransactionHash(valid);

    expect(result).toMatchObject({ totalCount: 2, totalTransactions: 2, invalidDateCount: 1, alreadyImportedCount: 0 });
    expect(result.transactions[0]).toEqual({
      originalTransaction: valid, amount: 12.5, date: '2024-01-02', description: valid.Payee,
      memo: valid.Memo, mappedCountry: '', isGeneralExpense: false, hash, instanceId: `${hash}-3`, sourceIndex: 3,
    });
    expect(result.transactions[1]).toMatchObject({ amount: -3.25, sourceIndex: 4 });
    expect(readFile).toHaveBeenCalledWith('/synthetic/preview.json', 'utf-8');
    expect(loadUnifiedTripData).toHaveBeenCalledWith('synthetic-trip');
  });

  it.each([false, true])('preserves duplicate instance identities and legacy consumption with showAll=%s', async showAll => {
    const original = transaction();
    const hash = createTransactionHash(original);
    const response = await preview([original, original, original], [{ ynabCategory: 'Food', mappingType: 'general' }], {
      showAll,
      importData: { importedTransactionHashes: [hash, `${hash}-0`] },
    });
    const result = await response.json();

    expect(result).toMatchObject({
      totalCount: showAll ? 3 : 2, totalTransactions: 3, alreadyImportedCount: 1,
      filteredCount: showAll ? 0 : 1, invalidDateCount: 0, lastImportedTransactionFound: false,
    });
    expect(result.transactions.map((item: { instanceId: string }) => item.instanceId))
      .toEqual((showAll ? [0, 1, 2] : [1, 2]).map(index => `${hash}-${index}`));
  });

  it.each([false, true])('preserves last-import filtering with showAll=%s', async showAll => {
    const transactions = [1, 2, 3].map(day => transaction({ Date: `0${day}/01/2024` }));
    const anchor = createTransactionHash(transactions[1]);
    const response = await preview(transactions, [{ ynabCategory: 'Food', mappingType: 'general' }], {
      showAll,
      importData: { importedTransactionHashes: [`${anchor}-1`], lastImportedTransactionHash: anchor },
    });
    const result = await response.json();

    expect(result).toMatchObject({
      totalCount: showAll ? 3 : 1, totalTransactions: 3, alreadyImportedCount: 1,
      filteredCount: showAll ? 0 : 2, lastImportedTransactionFound: !showAll,
    });
    expect(result.transactions.map((item: { sourceIndex: number }) => item.sourceIndex)).toEqual(showAll ? [0, 1, 2] : [2]);
  });

  it('keeps available transactions when the last-import anchor is absent', async () => {
    const response = await preview([transaction()], [{ ynabCategory: 'Food', mappingType: 'general' }], {
      importData: { lastImportedTransactionHash: 'a'.repeat(64) },
    });
    expect(await response.json()).toMatchObject({ totalCount: 1, filteredCount: 0, lastImportedTransactionFound: false });
  });

  it('retains the empty-preview response for empty mappings', async () => {
    const response = await preview([transaction()], []);
    expect(await response.json()).toEqual({
      transactions: [], totalCount: 0, alreadyImportedCount: 0, filteredCount: 0, invalidDateCount: 0,
      lastImportedTransactionFound: false, totalTransactions: 0,
      message: 'No transactions available for import. This may be because all categories are mapped to "None" or all transactions have already been imported.',
    });
  });

  it('retains the error response for a non-array mappings payload', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const response = await preview([transaction()], 'Food' as unknown as YnabCategoryMapping[]);
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: 'Failed to process YNAB request' });
    } finally {
      consoleError.mockRestore();
    }
  });
});
