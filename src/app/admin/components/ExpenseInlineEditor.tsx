'use client';

import React, { useState, useEffect } from 'react';
import { Expense, ExpenseType } from '@/app/types';
import TravelItemSelector from './TravelItemSelector';
import MultiRouteLinkManager from './MultiRouteLinkManager';
import { TravelLinkInfo, ExpenseTravelLookup } from '@/app/lib/expenseTravelLookup';
import AriaSelect from './AriaSelect';
import AccessibleDatePicker from './AccessibleDatePicker';
import { isCashAllocation, isCashSource } from '@/app/lib/cashTransactions';

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
  categories,
  countryOptions,
  travelLookup,
  tripId
}: ExpenseInlineEditorProps) {
  const [formData, setFormData] = useState<Expense>({
    ...expense
  });
  const [selectedTravelLinkInfo, setSelectedTravelLinkInfo] = useState<TravelLinkInfo | undefined>(undefined);
  const [useMultiLink, setUseMultiLink] = useState(false);
  const [multiLinks, setMultiLinks] = useState<TravelLinkInfo[]>([]);

  const isCashSourceExpense = isCashSource(expense);
  const isCashAllocationExpense = isCashAllocation(expense);
  const disableFinancialFields = isCashSourceExpense || isCashAllocationExpense;

  // Load existing links when mounting (ExpenseInlineEditor is for existing expenses only)
  useEffect(() => {
    if (!expense.id || !tripId) return;

    const abortController = new AbortController();

    fetch(`/api/travel-data/${tripId}/expense-links`, {
      signal: abortController.signal
    })
      .then(async response => {
        if (!response.ok) {
          throw new Error(`Failed to load expense links: ${response.statusText}`);
        }
        return response.json();
      })
      .then((links: Array<{
        expenseId: string;
        travelItemId: string;
        travelItemName: string;
        travelItemType: 'location' | 'accommodation' | 'route';
        splitMode?: 'equal' | 'percentage' | 'fixed';
        splitValue?: number;
      }>) => {
        const expenseLinks = links.filter(link => link.expenseId === expense.id);

        if (expenseLinks.length > 1) {
          setUseMultiLink(true);
          setMultiLinks(expenseLinks.map(link => ({
            id: link.travelItemId,
            type: link.travelItemType,
            name: link.travelItemName,
            splitMode: link.splitMode,
            splitValue: link.splitValue
          })));
        } else if (expenseLinks.length === 1) {
          setUseMultiLink(false);
          setSelectedTravelLinkInfo({
            id: expenseLinks[0].travelItemId,
            type: expenseLinks[0].travelItemType,
            name: expenseLinks[0].travelItemName,
            splitMode: expenseLinks[0].splitMode,
            splitValue: expenseLinks[0].splitValue
          });
        }
      })
      .catch(error => {
        if (error.name !== 'AbortError') {
          console.error('Error loading expense links:', error);
        }
      });

    return () => abortController.abort();
  }, [expense.id, tripId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate required fields
    if (!formData.date || !formData.amount || formData.amount === 0 || !formData.category) {
      return;
    }

    const linksToSave = useMultiLink ? multiLinks : selectedTravelLinkInfo;
    onSave(formData, linksToSave);
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
              expenseCurrency={formData.currency || 'EUR'}
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
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            className="px-3 py-1 bg-green-500 text-white text-sm rounded hover:bg-green-600 focus:outline-none focus:ring-1 focus:ring-green-500"
          >
            Save
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
