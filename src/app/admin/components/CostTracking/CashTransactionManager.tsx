import { useEffect, useMemo, useState } from 'react';
import { CostTrackingData, Expense } from '../../../types';
import AccessibleDatePicker from '../AccessibleDatePicker';
import AriaSelect from '../AriaSelect';
import TravelItemSelector from '../TravelItemSelector';
import { TravelLinkInfo } from '../../../lib/expenseTravelLookup';
import {
  createCashAllocationExpense,
  createCashSourceExpense,
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
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [costData.expenses]
  );

  useEffect(() => {
    setAllocationForms(prevState => {
      const nextState: Record<string, CashAllocationFormState> = { ...prevState };

      cashSources.forEach(source => {
        if (!nextState[source.id]) {
          nextState[source.id] = createInitialAllocationForm(source.country || '');
        }
      });

      Object.keys(nextState).forEach(sourceId => {
        if (!cashSources.some(source => source.id === sourceId)) {
          delete nextState[sourceId];
        }
      });

      return nextState;
    });
  }, [cashSources]);

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

  const handleAllocationChange = (sourceId: string, updates: Partial<CashAllocationFormState>) => {
    setAllocationForms(prev => ({
      ...prev,
      [sourceId]: {
        ...prev[sourceId],
        ...updates
      }
    }));
  };

  const handleAddAllocation = async (sourceId: string) => {
    const formState = allocationForms[sourceId];
    const sourceExpense = cashSources.find(source => source.id === sourceId);

    if (!formState || !sourceExpense || !isCashSource(sourceExpense)) {
      alert('Cash transaction not found. Please refresh and try again.');
      return;
    }

    if (!formState.date) {
      alert('Please select the spending date.');
      return;
    }

    const localAmount = parseFloat(formState.localAmount);
    if (Number.isNaN(localAmount) || localAmount <= 0) {
      alert('Local amount must be greater than zero.');
      return;
    }

    if (localAmount - sourceExpense.cashTransaction.remainingLocalAmount > 0.0001) {
      alert('This spending exceeds the remaining local cash for this transaction.');
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

      const allocationExpense = createCashAllocationExpense({
        id: formState.expenseId,
        parentExpense: sourceExpense,
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
        [sourceId]: {
          ...createInitialAllocationForm(sourceExpense.country || ''),
          country: formState.country,
          travelLink: undefined
        }
      }));
    } catch (error) {
      console.error('Failed to add cash spending:', error);
      alert(error instanceof Error ? error.message : 'Unable to add cash spending.');
    }
  };

  const renderCashSource = (source: Expense) => {
    if (!isCashSource(source)) return null;

    const allocationForm = allocationForms[source.id] || createInitialAllocationForm(source.country || '');
    const allocations = getAllocationsForSource(costData.expenses, source.id);
    const remainingLocal = source.cashTransaction.remainingLocalAmount;
    const remainingBase = source.cashTransaction.remainingBaseAmount;
    const originalLocal = source.cashTransaction.originalLocalAmount;
    const originalBase = source.cashTransaction.originalBaseAmount;

    const pendingLocal = parseFloat(allocationForm.localAmount);
    const estimatedBase =
      !Number.isNaN(pendingLocal) && pendingLocal > 0
        ? roundCurrency(
            pendingLocal *
              (source.cashTransaction.originalBaseAmount / source.cashTransaction.originalLocalAmount || 0)
          )
        : 0;

    const localCurrency = source.cashTransaction.localCurrency;

    return (
      <div key={source.id} className="rounded-lg border border-yellow-200 dark:border-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 p-4 space-y-4">
        <div className="flex flex-wrap justify-between gap-3">
          <div>
            <h4 className="text-lg font-semibold text-yellow-900 dark:text-yellow-100">
              {source.description || 'Cash exchange'}
            </h4>
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              Original: {originalBase.toFixed(2)} {currency} • {originalLocal.toFixed(2)} {localCurrency}
            </p>
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              Remaining: {remainingBase.toFixed(2)} {currency} • {remainingLocal.toFixed(2)} {localCurrency}
            </p>
          </div>
          <div className="text-right text-sm text-yellow-800 dark:text-yellow-200">
            <div>Exchange date: {new Date(source.date).toLocaleDateString()}</div>
            <div>Country: {source.country || 'General'}</div>
          </div>
        </div>

        {allocations.length > 0 && (
          <div className="bg-white dark:bg-gray-900/60 rounded-md border border-yellow-200 dark:border-yellow-700 p-3">
            <h5 className="text-sm font-semibold text-yellow-900 dark:text-yellow-100 mb-2">
              Cash spendings ({allocations.length})
            </h5>
            <ul className="space-y-1 text-sm text-yellow-900 dark:text-yellow-100">
              {allocations
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                .map(allocation => {
                  const details = isCashAllocation(allocation) ? allocation.cashTransaction : null;
                  return (
                    <li key={allocation.id} className="flex justify-between">
                      <span>
                        {new Date(allocation.date).toLocaleDateString()} • {allocation.category}
                        {allocation.description ? ` – ${allocation.description}` : ''}
                      </span>
                      <span>
                        {allocation.amount.toFixed(2)} {allocation.currency} ({details?.localAmount.toFixed(2)}{' '}
                        {details?.localCurrency})
                      </span>
                    </li>
                  );
                })}
            </ul>
          </div>
        )}

        <div className="rounded-md border border-yellow-200 dark:border-yellow-700 bg-white dark:bg-gray-900/60 p-3">
          <h5 className="text-sm font-semibold text-yellow-900 dark:text-yellow-100 mb-3">
            Add cash spending
          </h5>
          {remainingLocal <= 0 ? (
            <p className="text-sm text-gray-600 dark:text-gray-400">All local cash from this exchange has been allocated.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Spending date *</label>
                <AccessibleDatePicker
                  id={`cash-allocation-date-${source.id}`}
                  value={allocationForm.date}
                  onChange={date => handleAllocationChange(source.id, { date: date ?? null })}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Local amount ({localCurrency}) *
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={allocationForm.localAmount}
                  onChange={e => handleAllocationChange(source.id, { localAmount: e.target.value })}
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
                  id={`cash-allocation-category-${source.id}`}
                  value={allocationForm.category}
                  onChange={value => handleAllocationChange(source.id, { category: value })}
                  options={spendingCategories.map(category => ({ value: category, label: category }))}
                  placeholder="Select category"
                  className="w-full text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Country ({remainingLocal.toFixed(2)} {localCurrency} left)
                </label>
                <AriaSelect
                  id={`cash-allocation-country-${source.id}`}
                  value={allocationForm.country}
                  onChange={value => handleAllocationChange(source.id, { country: value })}
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
                  onChange={e => handleAllocationChange(source.id, { description: e.target.value })}
                  className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded"
                  placeholder="e.g., Dinner in Buenos Aires"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
                <input
                  type="text"
                  value={allocationForm.notes}
                  onChange={e => handleAllocationChange(source.id, { notes: e.target.value })}
                  className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded"
                  placeholder="Optional internal notes"
                />
              </div>

              <div className="md:col-span-2">
                <TravelItemSelector
                  expenseId={allocationForm.expenseId}
                  tripId={tripId}
                  onReferenceChange={travelLink => handleAllocationChange(source.id, { travelLink })}
                  className="bg-white dark:bg-gray-900/40 rounded border border-gray-200 dark:border-gray-700 p-3"
                  initialValue={allocationForm.travelLink}
                />
              </div>

              <div className="md:col-span-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => handleAddAllocation(source.id)}
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

      {cashSources.length > 0 && (
        <div className="space-y-4">
          {cashSources.map(source => renderCashSource(source))}
        </div>
      )}
    </div>
  );
}
