import { useEffect, useMemo, useState } from 'react';
import { CostTrackingData, Expense } from '../../../types';
import AccessibleDatePicker from '../AccessibleDatePicker';
import AriaSelect from '../AriaSelect';
import TravelItemSelector from '../TravelItemSelector';
import { TravelLinkInfo } from '../../../lib/expenseTravelLookup';
import {
  createCashAllocationExpense,
  createCashSourceExpense,
  getAllocationSegments,
  getAllocationsForSource,
  isCashAllocation,
  isCashSource,
  roundCurrency
} from '../../../lib/cashTransactions';
import { CASH_CATEGORY_NAME, generateId } from '../../../lib/costUtils';

interface CashTransactionManagerProps {
  costData: CostTrackingData;
  currency: string;
  categories: string[];
  countryOptions: string[];
  tripId: string;
  onExpenseAdded: (expense: Expense, travelLinkInfo?: TravelLinkInfo) => Promise<void>;
}

type CashSourceFormState = {
  date: Date | null;
  baseAmount: string;
  localAmount: string;
  localCurrency: string;
  country: string;
  description: string;
  notes: string;
};

type CashAllocationFormState = {
  expenseId: string;
  date: Date | null;
  localAmount: string;
  category: string;
  country: string;
  description: string;
  notes: string;
  travelLink?: TravelLinkInfo;
};

const INITIAL_SOURCE_FORM: CashSourceFormState = {
  date: new Date(),
  baseAmount: '',
  localAmount: '',
  localCurrency: '',
  country: '',
  description: '',
  notes: ''
};

function createInitialAllocationForm(sourceCountry: string): CashAllocationFormState {
  return {
    expenseId: generateId(),
    date: new Date(),
    localAmount: '',
    category: '',
    country: sourceCountry || '',
    description: '',
    notes: '',
    travelLink: undefined
  };
}

export default function CashTransactionManager({
  costData,
  currency,
  categories,
  countryOptions,
  tripId,
  onExpenseAdded
}: CashTransactionManagerProps) {
  const [sourceForm, setSourceForm] = useState<CashSourceFormState>(INITIAL_SOURCE_FORM);
  const [allocationForms, setAllocationForms] = useState<Record<string, CashAllocationFormState>>({});

  const spendingCategories = useMemo(
    () => categories.filter(category => category !== CASH_CATEGORY_NAME),
    [categories]
  );

  const cashSources = useMemo(
    () =>
      costData.expenses
        .filter(isCashSource)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [costData.expenses]
  );

  type CashCurrencyGroup = {
    currency: string;
    sources: Expense[];
    totalOriginalLocal: number;
    totalOriginalBase: number;
    totalRemainingLocal: number;
    totalRemainingBase: number;
    defaultCountry: string;
  };

  const cashGroups: CashCurrencyGroup[] = useMemo(() => {
    const groupMap = new Map<string, CashCurrencyGroup>();

    cashSources.forEach(source => {
      const localCurrency = source.cashTransaction.localCurrency;
      const existing = groupMap.get(localCurrency);
      const sourceInfo = {
        originalLocal: source.cashTransaction.originalLocalAmount,
        originalBase: source.cashTransaction.originalBaseAmount,
        remainingLocal: source.cashTransaction.remainingLocalAmount,
        remainingBase: source.cashTransaction.remainingBaseAmount
      };

      if (!existing) {
        groupMap.set(localCurrency, {
          currency: localCurrency,
          sources: [source],
          totalOriginalLocal: sourceInfo.originalLocal,
          totalOriginalBase: sourceInfo.originalBase,
          totalRemainingLocal: sourceInfo.remainingLocal,
          totalRemainingBase: sourceInfo.remainingBase,
          defaultCountry: source.country || ''
        });
      } else {
        existing.sources.push(source);
        existing.totalOriginalLocal += sourceInfo.originalLocal;
        existing.totalOriginalBase += sourceInfo.originalBase;
        existing.totalRemainingLocal += sourceInfo.remainingLocal;
        existing.totalRemainingBase += sourceInfo.remainingBase;
      }
    });

    return Array.from(groupMap.values()).sort((a, b) => a.currency.localeCompare(b.currency));
  }, [cashSources]);

  useEffect(() => {
    setAllocationForms(prevState => {
      const nextState: Record<string, CashAllocationFormState> = { ...prevState };

      cashGroups.forEach(group => {
        if (!nextState[group.currency]) {
          nextState[group.currency] = createInitialAllocationForm(group.defaultCountry);
        }
      });

      Object.keys(nextState).forEach(currencyKey => {
        if (!cashGroups.some(group => group.currency === currencyKey)) {
          delete nextState[currencyKey];
        }
      });

      return nextState;
    });
  }, [cashGroups]);

  const handleCreateCashSource = async () => {
    if (!sourceForm.date) {
      alert('Please select the exchange date.');
      return;
    }

    const baseAmount = parseFloat(sourceForm.baseAmount);
    const localAmount = parseFloat(sourceForm.localAmount);
    const localCurrency = sourceForm.localCurrency.trim().toUpperCase();

    if (Number.isNaN(baseAmount) || baseAmount <= 0) {
      alert('Enter the amount spent in the tracking currency (must be greater than zero).');
      return;
    }

    if (Number.isNaN(localAmount) || localAmount <= 0) {
      alert('Enter the amount received in local currency (must be greater than zero).');
      return;
    }

    if (!localCurrency) {
      alert('Please provide the local currency code (e.g., ARS).');
      return;
    }

    try {
      const expense = createCashSourceExpense({
        date: sourceForm.date,
        baseAmount,
        localAmount,
        localCurrency,
        trackingCurrency: currency,
        country: sourceForm.country,
        description: sourceForm.description || undefined,
        notes: sourceForm.notes || undefined,
        isGeneralExpense: !sourceForm.country
      });

      await onExpenseAdded(expense);
      setSourceForm({ ...INITIAL_SOURCE_FORM, country: sourceForm.country });
    } catch (error) {
      console.error('Failed to create cash transaction:', error);
      alert(error instanceof Error ? error.message : 'Unable to create cash transaction.');
    }
  };

  const handleAllocationChange = (currencyKey: string, updates: Partial<CashAllocationFormState>) => {
    setAllocationForms(prev => ({
      ...prev,
      [currencyKey]: {
        ...prev[currencyKey],
        ...updates
      }
    }));
  };

  const handleAddAllocation = async (currencyKey: string) => {
    const formState = allocationForms[currencyKey];
    const group = cashGroups.find(item => item.currency === currencyKey);

    if (!formState || !group) {
      alert('Cash transactions for this currency were not found. Please refresh and try again.');
      return;
    }

    const sources = group.sources;
    if (!formState.date) {
      alert('Please select the spending date.');
      return;
    }

    const localAmount = parseFloat(formState.localAmount);
    if (Number.isNaN(localAmount) || localAmount <= 0) {
      alert('Local amount must be greater than zero.');
      return;
    }

    if (localAmount - group.totalRemainingLocal > 0.0001) {
      alert('This spending exceeds the remaining local cash available in this currency.');
      return;
    }

    if (!formState.category) {
      alert('Select a category for this cash spending.');
      return;
    }

    try {
      const travelReference = formState.travelLink
        ? {
            type: formState.travelLink.type,
            description: formState.travelLink.name,
            locationId: formState.travelLink.type === 'location' ? formState.travelLink.id : undefined,
            accommodationId:
              formState.travelLink.type === 'accommodation' ? formState.travelLink.id : undefined,
            routeId: formState.travelLink.type === 'route' ? formState.travelLink.id : undefined
          }
        : undefined;

      const { expense: allocationExpense } = createCashAllocationExpense({
        id: formState.expenseId,
        sources,
        localAmount,
        date: formState.date,
        trackingCurrency: currency,
        category: formState.category,
        country: formState.country,
        description: formState.description || undefined,
        notes: formState.notes || undefined,
        isGeneralExpense: !formState.country,
        travelReference
      });

      await onExpenseAdded(allocationExpense, formState.travelLink);
      setAllocationForms(prev => ({
        ...prev,
        [currencyKey]: {
          ...createInitialAllocationForm(group.defaultCountry),
          category: formState.category,
          country: formState.country,
          travelLink: formState.travelLink,
          expenseId: generateId()
        }
      }));
    } catch (error) {
      console.error('Failed to add cash spending:', error);
      alert(error instanceof Error ? error.message : 'Unable to add cash spending.');
    }
  };

  const renderSourceSummary = (source: Expense) => {
    if (!isCashSource(source)) return null;

    const allocations = getAllocationsForSource(costData.expenses, source.id);
    const { cashTransaction } = source;
    const remainingLocal = cashTransaction.remainingLocalAmount;
    const remainingBase = cashTransaction.remainingBaseAmount;
    const originalLocal = cashTransaction.originalLocalAmount;
    const originalBase = cashTransaction.originalBaseAmount;
    const localCurrency = cashTransaction.localCurrency;
    const exchangeRate =
      originalBase > 0 ? roundCurrency(originalLocal / originalBase, 4) : undefined;

    return (
      <div
        key={source.id}
        className="rounded-md border border-yellow-200 dark:border-yellow-700 bg-white dark:bg-gray-900/60 p-3 space-y-3"
      >
        <div className="flex flex-wrap justify-between gap-3">
          <div>
            <h5 className="text-sm font-semibold text-yellow-900 dark:text-yellow-100">
              {source.description || 'Cash exchange'}
            </h5>
            <p className="text-xs text-yellow-800 dark:text-yellow-200">
              Original: {originalBase.toFixed(2)} {currency} • {originalLocal.toFixed(2)} {localCurrency}
            </p>
            {exchangeRate !== undefined && (
              <p className="text-xs text-yellow-800 dark:text-yellow-200">
                Exchange rate: 1 {currency} = {exchangeRate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}{' '}
                {localCurrency}
              </p>
            )}
            <p className="text-xs text-yellow-800 dark:text-yellow-200">
              Remaining: {remainingBase.toFixed(2)} {currency} • {remainingLocal.toFixed(2)} {localCurrency}
            </p>
          </div>
          <div className="text-right text-xs text-yellow-800 dark:text-yellow-200">
            <div>Exchange date: {new Date(source.date).toLocaleDateString()}</div>
            <div>Country: {source.country || 'General'}</div>
          </div>
        </div>

        {allocations.length > 0 && (
          <div className="rounded border border-yellow-100 dark:border-yellow-800 bg-yellow-50/60 dark:bg-yellow-900/20 p-2">
            <h6 className="text-xs font-semibold text-yellow-900 dark:text-yellow-100 mb-1">
              Allocations ({allocations.length})
            </h6>
            <ul className="space-y-1 text-xs text-yellow-900 dark:text-yellow-100">
              {allocations
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                .map(allocation => {
                  if (!isCashAllocation(allocation)) {
                    return null;
                  }
                  const allocationDetails = allocation.cashTransaction;
                  const segment = getAllocationSegments(allocationDetails).find(
                    item => item.sourceExpenseId === source.id
                  );
                  if (!segment) {
                    return null;
                  }

                  return (
                    <li key={`${allocation.id}-${source.id}`} className="flex justify-between gap-2">
                      <span>
                        {new Date(allocation.date).toLocaleDateString()} • {allocation.category}
                        {allocation.description ? ` – ${allocation.description}` : ''}
                      </span>
                      <span>
                        {segment.baseAmount.toFixed(2)} {allocation.currency} ({segment.localAmount.toFixed(2)}{' '}
                        {allocationDetails.localCurrency})
                      </span>
                    </li>
                  );
                })}
            </ul>
          </div>
        )}
      </div>
    );
  };

  const renderCurrencyGroup = (group: CashCurrencyGroup) => {
    const allocationForm =
      allocationForms[group.currency] || createInitialAllocationForm(group.defaultCountry);
    const totalOriginalLocal = roundCurrency(group.totalOriginalLocal);
    const totalOriginalBase = roundCurrency(group.totalOriginalBase);
    const totalRemainingLocal = roundCurrency(group.totalRemainingLocal);
    const totalRemainingBase = roundCurrency(group.totalRemainingBase);
    const pendingLocal = parseFloat(allocationForm.localAmount);

    let estimatedBase = 0;
    if (!Number.isNaN(pendingLocal) && pendingLocal > 0) {
      try {
        const preview = createCashAllocationExpense({
          id: allocationForm.expenseId,
          sources: group.sources,
          localAmount: pendingLocal,
          date: allocationForm.date || new Date(),
          trackingCurrency: currency,
          category: allocationForm.category || (spendingCategories[0] ?? CASH_CATEGORY_NAME),
          country: allocationForm.country,
          description: allocationForm.description,
          notes: allocationForm.notes,
          isGeneralExpense: !allocationForm.country
        });
        estimatedBase = preview.expense.amount;
      } catch {
        estimatedBase = 0;
      }
    }

    return (
      <div
        key={group.currency}
        className="rounded-lg border border-yellow-200 dark:border-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 p-4 space-y-4"
      >
        <div className="flex flex-wrap justify-between gap-3">
          <div>
            <h4 className="text-lg font-semibold text-yellow-900 dark:text-yellow-100">
              {group.currency} cash on hand
            </h4>
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              Total exchanged: {totalOriginalBase.toFixed(2)} {currency} • {totalOriginalLocal.toFixed(2)}
              {' '}
              {group.currency}
            </p>
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              Remaining: {totalRemainingBase.toFixed(2)} {currency} • {totalRemainingLocal.toFixed(2)} {group.currency}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {group.sources.map(source => renderSourceSummary(source))}
        </div>

        <div className="rounded-md border border-yellow-200 dark:border-yellow-700 bg-white dark:bg-gray-900/60 p-3">
          <h5 className="text-sm font-semibold text-yellow-900 dark:text-yellow-100 mb-3">
            Add cash spending
          </h5>
          {totalRemainingLocal <= 0 ? (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              All local cash for this currency has been allocated.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Spending date *
                </label>
                <AccessibleDatePicker
                  id={`cash-allocation-date-${group.currency}`}
                  value={allocationForm.date}
                  onChange={date => handleAllocationChange(group.currency, { date: date ?? null })}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Local amount ({group.currency}) *
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={allocationForm.localAmount}
                  onChange={e => handleAllocationChange(group.currency, { localAmount: e.target.value })}
                  className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded"
                  placeholder="0.00"
                />
                {pendingLocal > 0 && (
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    ≈ {estimatedBase.toFixed(2)} {currency}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Category *</label>
                <AriaSelect
                  id={`cash-allocation-category-${group.currency}`}
                  value={allocationForm.category}
                  onChange={value => handleAllocationChange(group.currency, { category: value })}
                  options={spendingCategories.map(category => ({ value: category, label: category }))}
                  placeholder="Select category"
                  className="w-full text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Country ({totalRemainingLocal.toFixed(2)} {group.currency} left)
                </label>
                <AriaSelect
                  id={`cash-allocation-country-${group.currency}`}
                  value={allocationForm.country}
                  onChange={value => handleAllocationChange(group.currency, { country: value })}
                  options={countryOptions.map(country => ({ value: country, label: country }))}
                  placeholder="General / multiple"
                  className="w-full text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                <input
                  type="text"
                  value={allocationForm.description}
                  onChange={e => handleAllocationChange(group.currency, { description: e.target.value })}
                  className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded"
                  placeholder="e.g., Dinner in Buenos Aires"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
                <input
                  type="text"
                  value={allocationForm.notes}
                  onChange={e => handleAllocationChange(group.currency, { notes: e.target.value })}
                  className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded"
                  placeholder="Optional internal notes"
                />
              </div>

              <div className="md:col-span-2">
                <TravelItemSelector
                  expenseId={allocationForm.expenseId}
                  tripId={tripId}
                  onReferenceChange={travelLink => handleAllocationChange(group.currency, { travelLink })}
                  className="bg-white dark:bg-gray-900/40 rounded border border-gray-200 dark:border-gray-700 p-3"
                  initialValue={allocationForm.travelLink}
                  transactionDate={allocationForm.date}
                />
              </div>

              <div className="md:col-span-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => handleAddAllocation(group.currency)}
                  className="px-4 py-2 bg-green-500 text-white text-sm rounded hover:bg-green-600"
                >
                  Add cash spending
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="border border-yellow-200 dark:border-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4">
        <h3 className="text-xl font-semibold text-yellow-900 dark:text-yellow-100 mb-3">
          Cash handling
        </h3>
        <p className="text-sm text-yellow-900 dark:text-yellow-100 mb-4">
          Track cash exchanges and allocate spending later. Remaining balances stay under the
          "{CASH_CATEGORY_NAME}" category until assigned.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Exchange date *
            </label>
            <AccessibleDatePicker
              id="cash-source-date"
              value={sourceForm.date}
              onChange={date => setSourceForm(prev => ({ ...prev, date: date ?? null }))}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Amount in {currency} *
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={sourceForm.baseAmount}
              onChange={e => setSourceForm(prev => ({ ...prev, baseAmount: e.target.value }))}
              className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded"
              placeholder="0.00"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Local amount *
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={sourceForm.localAmount}
              onChange={e => setSourceForm(prev => ({ ...prev, localAmount: e.target.value }))}
              className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded"
              placeholder="0.00"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Local currency code *
            </label>
            <input
              type="text"
              value={sourceForm.localCurrency}
              onChange={e => setSourceForm(prev => ({ ...prev, localCurrency: e.target.value }))}
              className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded uppercase"
              placeholder="e.g., ARS"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Country
            </label>
            <AriaSelect
              id="cash-source-country"
              value={sourceForm.country}
              onChange={value => setSourceForm(prev => ({ ...prev, country: value }))}
              options={countryOptions.map(country => ({ value: country, label: country }))}
              placeholder="General / multiple"
              className="w-full text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description
            </label>
            <input
              type="text"
              value={sourceForm.description}
              onChange={e => setSourceForm(prev => ({ ...prev, description: e.target.value }))}
              className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded"
              placeholder="e.g., Euros to pesos exchange"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Notes
            </label>
            <input
              type="text"
              value={sourceForm.notes}
              onChange={e => setSourceForm(prev => ({ ...prev, notes: e.target.value }))}
              className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded"
              placeholder="Optional internal notes"
            />
          </div>

          <div className="md:col-span-2 flex justify-end">
            <button
              type="button"
              onClick={handleCreateCashSource}
              className="px-4 py-2 bg-blue-500 text-white text-sm rounded hover:bg-blue-600"
            >
              Add cash transaction
            </button>
          </div>
        </div>
      </div>

      {cashGroups.length > 0 && (
        <div className="space-y-4">
          {cashGroups.map(group => renderCurrencyGroup(group))}
        </div>
      )}
    </div>
  );
}
