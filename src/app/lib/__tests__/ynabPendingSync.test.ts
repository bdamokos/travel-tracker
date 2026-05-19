import { YnabApiClient, ynabUtils } from '@/app/lib/ynabApiClient';
import { maybeSyncPendingYnabTransactions } from '@/app/lib/ynabPendingSync';
import { updateCostData } from '@/app/lib/unifiedDataService';
import { UnifiedTripData } from '@/app/lib/dataMigration';

jest.mock('@/app/lib/unifiedDataService', () => ({
  updateCostData: jest.fn()
}));

jest.mock('@/app/lib/ynabApiClient', () => {
  const actual = jest.requireActual('@/app/lib/ynabApiClient');
  return {
    ...actual,
    YnabApiClient: jest.fn()
  };
});

const mockUpdateCostData = updateCostData as jest.MockedFunction<typeof updateCostData>;
const mockYnabApiClient = YnabApiClient as jest.MockedClass<typeof YnabApiClient>;

describe('maybeSyncPendingYnabTransactions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps split YNAB siblings distinct when they share a parent import id', async () => {
    const trip: UnifiedTripData = {
      schemaVersion: 9,
      id: 'trip-1',
      title: 'Trip',
      description: '',
      startDate: '2024-01-01',
      endDate: '2024-01-10',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      costData: {
        overallBudget: 1000,
        currency: 'EUR',
        countryBudgets: [],
        expenses: [],
        ynabImportData: {
          mappings: [
            { ynabCategory: 'Food', ynabCategoryId: 'cat-1', mappingType: 'general' },
            { ynabCategory: 'Transit', ynabCategoryId: 'cat-2', mappingType: 'country', countryName: 'Belgium' }
          ],
          importedTransactionHashes: []
        },
        ynabConfig: {
          costTrackerId: 'trip-1',
          apiKey: 'secret-token',
          selectedBudgetId: 'budget-1',
          selectedBudgetName: 'Budget',
          currency: 'EUR',
          lastTransactionImport: new Date('2024-01-01T00:00:00.000Z')
        }
      }
    };

    const getTransactionsByCategories = jest.fn().mockResolvedValue({
      serverKnowledge: 42,
      transactions: [
        {
          id: 'txn-1',
          date: '2024-01-02',
          amount: -5000,
          memo: 'Parent memo',
          cleared: 'cleared',
          approved: true,
          account_id: 'acct-1',
          account_name: 'Checking',
          payee_id: 'payee-1',
          payee_name: 'Market',
          category_id: undefined,
          category_name: undefined,
          transfer_account_id: undefined,
          transfer_transaction_id: undefined,
          matched_transaction_id: undefined,
          import_id: 'import-1',
          import_payee_name: undefined,
          import_payee_name_original: undefined,
          debt_transaction_type: undefined,
          deleted: false,
          subtransactions: [
            {
              id: 'sub-1',
              transaction_id: 'txn-1',
              amount: -2000,
              memo: null,
              payee_id: null,
              payee_name: null,
              category_id: 'cat-1',
              category_name: 'Food',
              transfer_account_id: null,
              transfer_transaction_id: null,
              deleted: false
            },
            {
              id: 'sub-2',
              transaction_id: 'txn-1',
              amount: -3000,
              memo: null,
              payee_id: null,
              payee_name: null,
              category_id: 'cat-2',
              category_name: 'Transit',
              transfer_account_id: null,
              transfer_transaction_id: null,
              deleted: false
            }
          ]
        }
      ]
    });

    mockYnabApiClient.mockImplementation(() => ({
      getTransactionsByCategories
    } as unknown as YnabApiClient));

    mockUpdateCostData.mockImplementation(async (_id, updates) => ({
      ...trip,
      costData: {
        ...trip.costData!,
        expenses: updates.expenses || []
      }
    }));

    await maybeSyncPendingYnabTransactions('trip-1', trip);

    const updates = mockUpdateCostData.mock.calls[0][1];
    expect(updates.expenses).toHaveLength(2);
    expect(updates.expenses?.map(expense => expense.ynabTransactionId)).toEqual(['sub-1', 'sub-2']);
    expect(updates.expenses?.map(expense => expense.ynabImportId)).toEqual([
      'import-1:split:sub-1',
      'import-1:split:sub-2'
    ]);
    expect(new Set(updates.expenses?.map(expense => expense.hash)).size).toBe(2);
    expect(ynabUtils.flattenTransactions).toBeDefined();
  });
});
