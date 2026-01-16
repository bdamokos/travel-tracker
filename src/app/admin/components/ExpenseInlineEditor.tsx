'use client';

import React, { useState } from 'react';
import { Expense, ExpenseType } from '@/app/types';
import TravelItemSelector from './TravelItemSelector';
import MultiRouteLinkManager from './MultiRouteLinkManager';
import { TravelLinkInfo, ExpenseTravelLookup } from '@/app/lib/expenseTravelLookup';
import AriaSelect from './AriaSelect';
import AccessibleDatePicker from './AccessibleDatePicker';
import { isCashAllocation, isCashSource } from '@/app/lib/cashTransactions';
import { useMultiRouteLinks } from '@/app/hooks/useMultiRouteLinks';
import { useLoadExpenseLinks } from '@/app/hooks/useLoadExpenseLinks';

interface ExpenseInlineEditorProps {
  expense: Expense;
  onSave: (expense: Expense, travelLinkInfo?: TravelLinkInfo | TravelLinkInfo[]) => void;
  onCancel: () => void;
  currency: string;
  categories: string[];
  countryOptions: string[];
  travelLookup: ExpenseTravelLookup | null;
  tripId: string;
}

export default function ExpenseInlineEditor({
  expense,
  onSave,
  onCancel,
  currency,
  categories,
  countryOptions,
  travelLookup,
  tripId
}: ExpenseInlineEditorProps) {
  const [formData, setFormData] = useState<Expense>({
    ...expense
  });
  const [formError, setFormError] = useState<string | null>(null);
  const { error: linkError, saving: linkSaving, saveLinks, clearError } = useMultiRouteLinks();

  // Load existing links for this expense
  const {
    isLoading: linksLoading,
    error: linksLoadError,
    singleLink: selectedTravelLinkInfo,
    multiLinks,
    isMultiLinkMode: useMultiLink,
    setSingleLink: setSelectedTravelLinkInfo,
    setMultiLinks,
    setIsMultiLinkMode: setUseMultiLink
  } = useLoadExpenseLinks(expense.id, tripId);

  const isSubmitting = linkSaving || linksLoading;

  const isCashSourceExpense = isCashSource(expense);
  const isCashAllocationExpense = isCashAllocation(expense);
  const disableFinancialFields = isCashSourceExpense || isCashAllocationExpense;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Validate required fields
    if (!formData.date || !formData.amount || formData.amount === 0 || !formData.category) {
      const missing = [];
      if (!formData.date) missing.push('Date');
      if (!formData.amount || formData.amount === 0) missing.push('Amount');
      if (!formData.category) missing.push('Category');
      setFormError(`Please fill in required fields: ${missing.join(', ')}`);
      return;
    }

    try {
      // Save expense links first if needed
      // InPlaceEditor's onSave doesn't handle links, so we always save via hook
      if (formData.id && tripId) {
        const linksToSave = useMultiLink ? multiLinks : selectedTravelLinkInfo;

        if (linksToSave && (Array.isArray(linksToSave) ? linksToSave.length > 0 : true)) {
          const linkSuccess = await saveLinks({
            expenseId: formData.id,
            tripId,
            links: linksToSave
          });
          if (!linkSuccess) {
            // Error is already set in linkError state, just return to show it
            return;
          }
        }
      }

      // Clear any previous errors
      clearError();
      setFormError(null);

      // Save the expense data (links already saved above)
      onSave(formData);
    } catch (error) {
      console.error('Error saving expense:', error);
      setFormError(error instanceof Error ? error.message : 'Failed to save expense');
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg p-4 shadow-sm">
      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Date and Amount */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Date *
            </label>
            <AccessibleDatePicker
              id="expense-inline-date"
              value={
                formData.date instanceof Date
                  ? formData.date
                  : typeof formData.date === 'string' && formData.date
                    ? new Date(formData.date)
                    : null
              }
              onChange={(d) => d && setFormData(prev => ({ ...prev, date: d }))}
              required
              className="text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Amount *
            </label>
            <input
              type="number"
              step="0.01"
              value={formData.amount}
              onChange={(e) => setFormData(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))}
              className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              placeholder="0.00"
              required
              disabled={disableFinancialFields}
            />
            {disableFinancialFields && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Amount is calculated from the associated cash transaction.
              </p>
            )}
          </div>
        </div>

        {/* Currency and Category */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Currency
            </label>
            <AriaSelect
              id="currency-select"
              value={formData.currency}
              onChange={(value) => setFormData(prev => ({ ...prev, currency: value }))}
              className="w-full px-2 py-1 text-sm"
              disabled={disableFinancialFields}
              options={[
                { value: 'EUR', label: 'EUR' },
                { value: 'USD', label: 'USD' },
                { value: 'GBP', label: 'GBP' }
              ]}
              placeholder="Select Currency"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Category *
            </label>
            <AriaSelect
              id="category-select"
              value={formData.category}
              onChange={(value) => setFormData(prev => ({ ...prev, category: value }))}
              className="w-full px-2 py-1 text-sm"
              required
              options={categories.map(cat => ({ value: cat, label: cat }))}
              placeholder="Select Category"
            />
          </div>
        </div>

        {/* Country and Expense Type */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Country
            </label>
            <AriaSelect
              id="country-select"
              value={formData.country || ''}
              onChange={(value) => setFormData(prev => ({ ...prev, country: value }))}
              className="w-full px-2 py-1 text-sm"
              options={countryOptions.map(country => ({ value: country, label: country }))}
              placeholder="General/Multiple"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Type
            </label>
            <AriaSelect
              id="expense-type-select"
              value={formData.expenseType}
              onChange={(value) => setFormData(prev => ({ ...prev, expenseType: value as ExpenseType }))}
              className="w-full px-2 py-1 text-sm"
              disabled={disableFinancialFields}
              options={[
                { value: 'actual', label: 'Actual' },
                { value: 'planned', label: 'Planned' }
              ]}
              placeholder="Select Type"
            />
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Description
          </label>
          <input
            type="text"
            value={formData.description || ''}
            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
            className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
            placeholder="e.g., Lunch at restaurant"
          />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Notes
          </label>
          <textarea
            value={formData.notes || ''}
            onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
            className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
            rows={2}
          />
        </div>

        {/* General Expense Checkbox */}
        <div>
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={formData.isGeneralExpense || false}
              onChange={(e) => setFormData(prev => ({ ...prev, isGeneralExpense: e.target.checked }))}
              className="mr-2 text-sm"
            />
            <span className="text-xs text-gray-700 dark:text-gray-300">
              General expense (not tied to specific country)
            </span>
          </label>
        </div>

        {/* Travel Item Selector */}
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
            Link to Travel Item
          </label>

          <label className="flex items-center mb-2">
            <input
              type="checkbox"
              checked={useMultiLink}
              onChange={(e) => {
                setUseMultiLink(e.target.checked);
                if (e.target.checked) {
                  setSelectedTravelLinkInfo(undefined);
                } else {
                  setMultiLinks([]);
                }
              }}
              className="mr-2 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-xs text-gray-700 dark:text-gray-300">
              Link to multiple routes (split cost)
            </span>
          </label>

          {useMultiLink ? (
            <MultiRouteLinkManager
              expenseId={formData.id}
              tripId={tripId}
              expenseAmount={formData.amount || 0}
              expenseCurrency={formData.currency || currency}
              transactionDate={formData.date}
              initialLinks={multiLinks}
              onLinksChange={setMultiLinks}
              className="mt-2"
            />
          ) : (
            <TravelItemSelector
              expenseId={formData.id}
              tripId={tripId}
              travelLookup={travelLookup}
              transactionDate={formData.date}
              initialValue={selectedTravelLinkInfo}
              onReferenceChange={(travelLinkInfo) => {
                setSelectedTravelLinkInfo(travelLinkInfo);
                setFormData(prev => ({
                  ...prev,
                  travelReference: travelLinkInfo ? {
                    type: travelLinkInfo.type,
                    locationId: travelLinkInfo.type === 'location' ? travelLinkInfo.id : undefined,
                    accommodationId: travelLinkInfo.type === 'accommodation' ? travelLinkInfo.id : undefined,
                    routeId: travelLinkInfo.type === 'route' ? travelLinkInfo.id : undefined,
                    description: travelLinkInfo.name,
                  } : undefined,
                }));
              }}
            />
          )}

          {(linkError || formError || linksLoadError) && (
            <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
              <p className="text-sm text-red-600 dark:text-red-400">
                {linksLoadError ? `Error loading links: ${linksLoadError}` :
                 linkError ? `Error saving links: ${linkError}` : formError}
              </p>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-3 py-1 bg-green-500 text-white text-sm rounded hover:bg-green-600 focus:outline-none focus:ring-1 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {linkSaving ? 'Saving...' : 'Save'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1 bg-gray-500 text-white text-sm rounded hover:bg-gray-600 focus:outline-none focus:ring-1 focus:ring-gray-500"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
