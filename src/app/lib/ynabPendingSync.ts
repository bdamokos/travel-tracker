import { YnabApiClient, ynabUtils } from './ynabApiClient';
import { updateCostData } from './unifiedDataService';
import { UnifiedTripData } from './dataMigration';
import { Expense, YnabApiTransaction, YnabConfig } from '@/app/types';

const ONE_HOUR_MS = 60 * 60 * 1000;

function shouldSkipSync(ynabConfig?: YnabConfig): boolean {
  if (!ynabConfig?.apiKey || !ynabConfig?.selectedBudgetId) return true;
  if (!ynabConfig.lastTransactionImport && !ynabConfig.lastTransactionSync) return true;

  if (!ynabConfig.lastAutomaticTransactionSync) return false;

  const lastSyncTime = new Date(ynabConfig.lastAutomaticTransactionSync).getTime();
  return Date.now() - lastSyncTime < ONE_HOUR_MS;
}

function buildSinceDate(ynabConfig: YnabConfig): string | undefined {
  const baselineDate =
    ynabConfig.lastAutomaticTransactionSync ||
    ynabConfig.lastTransactionImport ||
    ynabConfig.lastTransactionSync;

  if (!baselineDate) return undefined;
  return ynabUtils.formatDate(new Date(baselineDate));
}

function buildServerKnowledge(ynabConfig: YnabConfig): number | undefined {
  return ynabConfig.automaticTransactionServerKnowledge ?? ynabConfig.transactionServerKnowledge;
}

function hasDuplicate(expense: Expense, existing: Expense[]): boolean {
  return existing.some(existingExpense =>
    existingExpense.ynabTransactionId === expense.ynabTransactionId ||
    (expense.ynabImportId && existingExpense.ynabImportId === expense.ynabImportId) ||
    (expense.hash && existingExpense.hash === expense.hash)
  );
}

function mapTransactionToExpense(
  txn: YnabApiTransaction,
  currency: string,
  mapping: { countryName?: string; mappingType?: 'country' | 'general' | 'none' }
): Expense {
  const isOutflow = txn.amount < 0;
  const absoluteAmount = Math.abs(ynabUtils.milliunitsToAmount(txn.amount));
  const amount = isOutflow ? absoluteAmount : -absoluteAmount;

  const isGeneralExpense = mapping.mappingType === 'general';
  const country = isGeneralExpense ? 'General' : mapping.countryName || 'Unassigned';

  return {
    id: Date.now().toString(36) + Math.random().toString(36).substring(2),
    date: new Date(txn.date),
    amount,
    currency,
    category: 'Pending Import',
    country,
    description: txn.payee_name || 'Unknown Payee',
    notes: txn.memo || '',
    isGeneralExpense,
    isPendingYnabImport: true,
    expenseType: 'actual',
    source: 'ynab-api-pending',
    hash: ynabUtils.generateTransactionHash(txn),
    ynabTransactionId: txn.id,
    ynabImportId: txn.import_id
  };
}

export async function maybeSyncPendingYnabTransactions(
  costTrackerId: string,
  unifiedTrip: UnifiedTripData
): Promise<UnifiedTripData | null> {
  const costData = unifiedTrip.costData;
  if (!costData || !costData.ynabConfig || shouldSkipSync(costData.ynabConfig)) {
    return null;
  }

  const mappedCategories = costData.ynabImportData?.mappings
    ?.filter(mapping => mapping.mappingType !== 'none' && mapping.ynabCategoryId)
    .map(mapping => mapping.ynabCategoryId!) || [];

  if (mappedCategories.length === 0) {
    return null;
  }

  const sinceDate = buildSinceDate(costData.ynabConfig);
  const serverKnowledge = buildServerKnowledge(costData.ynabConfig);

  const client = new YnabApiClient(costData.ynabConfig.apiKey);
  let transactionResult: { transactions: YnabApiTransaction[]; serverKnowledge: number };

  try {
    transactionResult = await client.getTransactionsByCategories(
      costData.ynabConfig.selectedBudgetId,
      mappedCategories,
      sinceDate,
      serverKnowledge
    );
    transactionResult = {
      transactions: ynabUtils.flattenTransactions(transactionResult.transactions),
      serverKnowledge: transactionResult.serverKnowledge
    };
  } catch (error) {
    console.error('YNAB hourly sync failed:', error);
    return null;
  }

  const mappingLookup = new Map(
    (costData.ynabImportData?.mappings || [])
      .filter(mapping => mapping.ynabCategoryId)
      .map(mapping => [mapping.ynabCategoryId!, mapping])
  );

  const existingExpenses = costData.expenses || [];
  const pendingExpenses: Expense[] = [];

  for (const txn of transactionResult.transactions) {
    const mapping = txn.category_id ? mappingLookup.get(txn.category_id) : undefined;
    const expense = mapTransactionToExpense(txn, costData.currency, mapping || {});

    if (!hasDuplicate(expense, [...existingExpenses, ...pendingExpenses])) {
      pendingExpenses.push(expense);
    }
  }

  const updatedExpenses = [...existingExpenses, ...pendingExpenses];

  const updatedUnifiedData = await updateCostData(costTrackerId, {
    overallBudget: costData.overallBudget,
    currency: costData.currency,
    countryBudgets: costData.countryBudgets,
    expenses: updatedExpenses,
    ynabImportData: costData.ynabImportData,
    ynabConfig: {
      ...costData.ynabConfig,
      lastAutomaticTransactionSync: new Date(),
      automaticTransactionServerKnowledge: transactionResult.serverKnowledge
    },
    tripTitle: unifiedTrip.title,
    tripStartDate: unifiedTrip.startDate,
    tripEndDate: unifiedTrip.endDate,
    ...(costData.customCategories ? { customCategories: costData.customCategories } : {}),
    createdAt: unifiedTrip.createdAt,
    updatedAt: new Date().toISOString()
  });

  return updatedUnifiedData;
}
