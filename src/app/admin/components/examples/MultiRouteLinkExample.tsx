'use client';

/**
 * Example: Multi-Route Expense Linking Integration
 *
 * This file demonstrates how to integrate the MultiRouteLinkManager component
 * into an expense form. Use this as a reference for implementation.
 *
 * Key features demonstrated:
 * - Toggle between single-link and multi-link mode
 * - Load existing multi-links when editing
 * - Save links using the useMultiRouteLinks hook
 * - Handle validation and error states
 * - Maintain backward compatibility
 */

import { useState, useEffect } from 'react';
import TravelItemSelector from '../TravelItemSelector';
import MultiRouteLinkManager from '../MultiRouteLinkManager';
import { useMultiRouteLinks } from '@/app/hooks/useMultiRouteLinks';
import { TravelLinkInfo } from '@/app/lib/expenseTravelLookup';
import { Expense } from '@/app/types';

interface MultiRouteLinkExampleProps {
  expense: Partial<Expense>;
  tripId: string;
  onSave: (expense: Expense, links?: TravelLinkInfo[]) => void;
}

export default function MultiRouteLinkExample({
  expense,
  tripId,
  onSave
}: MultiRouteLinkExampleProps) {
  // State management
  const [useMultiLink, setUseMultiLink] = useState(false);
  const [singleLink, setSingleLink] = useState<TravelLinkInfo | undefined>();
  const [multiLinks, setMultiLinks] = useState<TravelLinkInfo[]>([]);

  // API integration
  const { saving, error, saveLinks, clearError } = useMultiRouteLinks();

  /**
   * Type guard to validate that partial expense has all required fields
   */
  const isValidExpense = (exp: Partial<Expense>): exp is Expense => {
    return !!(
      exp.id &&
      exp.date &&
      exp.amount !== undefined &&
      exp.currency &&
      exp.category &&
      exp.country &&
      exp.description &&
      exp.expenseType
    );
  };

  /**
   * Load existing links when editing an expense
   * Automatically detects single vs. multi-link mode
   */
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
      .then((allLinks: Array<{
        expenseId: string;
        travelItemId: string;
        travelItemName: string;
        travelItemType: 'location' | 'accommodation' | 'route';
        description?: string;
        splitMode?: 'equal' | 'percentage' | 'fixed';
        splitValue?: number;
      }>) => {
        // Filter links for this specific expense
        const expenseLinks = allLinks.filter(
          link => link.expenseId === expense.id
        );

        if (expenseLinks.length > 1) {
          // Multiple links found - enable multi-link mode
          setUseMultiLink(true);
          setMultiLinks(expenseLinks.map(link => ({
            id: link.travelItemId,
            type: link.travelItemType,
            name: link.travelItemName,
            splitMode: link.splitMode,
            splitValue: link.splitValue
          })));
        } else if (expenseLinks.length === 1) {
          // Single link - use traditional mode
          setUseMultiLink(false);
          setSingleLink({
            id: expenseLinks[0].travelItemId,
            type: expenseLinks[0].travelItemType,
            name: expenseLinks[0].travelItemName,
            splitMode: expenseLinks[0].splitMode,
            splitValue: expenseLinks[0].splitValue
          });
        }
      })
      .catch(error => {
        // Ignore abort errors
        if (error.name !== 'AbortError') {
          console.error('Error loading expense links:', error);
        }
      });

    // Cleanup: abort fetch if component unmounts
    return () => abortController.abort();
  }, [expense.id, tripId]);

  /**
   * Handle save with proper link management
   */
  const handleSaveExpense = async () => {
    if (!expense.id) {
      console.error('Expense ID required');
      return;
    }

    let result;

    // Save expense links based on mode
    if (useMultiLink) {
      // Multi-link mode: save array of links
      if (multiLinks.length > 0) {
        result = await saveLinks({
          expenseId: expense.id,
          tripId,
          links: multiLinks
        });
      } else {
        // No links selected - remove any existing links
        result = await saveLinks({
          expenseId: expense.id,
          tripId,
          links: undefined
        });
      }
    } else {
      // Single-link mode: save single link
      result = await saveLinks({
        expenseId: expense.id,
        tripId,
        links: singleLink
      });
    }

    if (result.success) {
      // Validate expense has all required fields before calling parent handler
      if (!isValidExpense(expense)) {
        console.error('Expense missing required fields');
        return;
      }
      // Call parent save handler
      onSave(
        expense,
        useMultiLink ? multiLinks : (singleLink ? [singleLink] : undefined)
      );
    }
  };

  /**
   * Handle mode toggle with state clearing
   */
  const handleModeToggle = (enabled: boolean) => {
    setUseMultiLink(enabled);

    // Clear opposite mode's state
    if (enabled) {
      setSingleLink(undefined);
    } else {
      setMultiLinks([]);
    }

    // Clear any previous errors
    clearError();
  };

  return (
    <div className="space-y-4">
      {/* Mode Toggle */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="multi-link-toggle"
          checked={useMultiLink}
          onChange={(e) => handleModeToggle(e.target.checked)}
          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <label
          htmlFor="multi-link-toggle"
          className="text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Link to multiple routes (split cost)
        </label>
      </div>

      {/* Conditional Rendering: Single vs Multi-Link */}
      {useMultiLink ? (
        <MultiRouteLinkManager
          expenseId={expense.id || 'new-expense'}
          tripId={tripId}
          expenseAmount={expense.amount || 0}
          expenseCurrency={expense.currency || 'EUR'}
          transactionDate={expense.date}
          initialLinks={multiLinks}
          onLinksChange={setMultiLinks}
        />
      ) : (
        <TravelItemSelector
          expenseId={expense.id || 'new-expense'}
          tripId={tripId}
          transactionDate={expense.date}
          initialValue={singleLink}
          onReferenceChange={setSingleLink}
        />
      )}

      {/* Error Display */}
      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
          <p className="text-sm text-red-600 dark:text-red-400">
            Error: {error}
          </p>
          <button
            onClick={clearError}
            className="mt-1 text-xs text-red-700 dark:text-red-300 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Save Button */}
      <button
        onClick={handleSaveExpense}
        disabled={saving}
        className={`px-4 py-2 rounded-md font-medium ${
          saving
            ? 'bg-gray-400 cursor-not-allowed'
            : 'bg-blue-600 hover:bg-blue-700 text-white'
        }`}
      >
        {saving ? 'Saving...' : 'Save Expense'}
      </button>

      {/* Debug Info (remove in production) */}
      {process.env.NODE_ENV === 'development' && (
        <details className="mt-4 text-xs">
          <summary className="cursor-pointer text-gray-500">
            Debug Info
          </summary>
          <pre className="mt-2 p-2 bg-gray-100 dark:bg-gray-800 rounded overflow-auto">
            {JSON.stringify({
              mode: useMultiLink ? 'multi' : 'single',
              singleLink,
              multiLinks,
              linkCount: useMultiLink ? multiLinks.length : (singleLink ? 1 : 0)
            }, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
