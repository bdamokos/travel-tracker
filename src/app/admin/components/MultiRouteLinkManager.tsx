'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { TravelLinkInfo } from '@/app/lib/expenseTravelLookup';
import TravelItemSelector from './TravelItemSelector';
import AriaSelect from './AriaSelect';

interface MultiRouteLinkManagerProps {
  expenseId: string;
  tripId: string;
  expenseAmount?: number;
  expenseCurrency?: string;
  transactionDate?: Date | string | null;
  initialLinks?: TravelLinkInfo[];
  onLinksChange: (links: TravelLinkInfo[]) => void;
  className?: string;
}

interface LinkWithConfig extends TravelLinkInfo {
  tempId: string; // For React key management
}

export default function MultiRouteLinkManager({
  expenseId,
  tripId,
  expenseAmount = 0,
  expenseCurrency = 'EUR',
  transactionDate,
  initialLinks = [],
  onLinksChange,
  className = ''
}: MultiRouteLinkManagerProps) {
  const [links, setLinks] = useState<LinkWithConfig[]>([]);
  const [splitMode, setSplitMode] = useState<'equal' | 'percentage' | 'fixed'>('equal');
  const [showAddSelector, setShowAddSelector] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  
  // Refs to prevent infinite loops when syncing with parent
  const isInternalUpdate = useRef(false);
  const prevExpenseId = useRef<string | undefined>(expenseId);

  // Initialize from props - only when expense actually changes
  useEffect(() => {
    // Only reset when working with a different expense
    const expenseChanged = expenseId !== prevExpenseId.current;
    
    if (expenseChanged) {
      prevExpenseId.current = expenseId;
      // If switching expenses, we always want to load the new links,
      // ignoring any pending internal update flags
      isInternalUpdate.current = false;
    } else if (isInternalUpdate.current) {
      // Skip if this is an internal update for the *same* expense
      isInternalUpdate.current = false;
      return;
    } else if (links.length > 0) {
      // Same expense, not an internal update, but we have local state.
      // Stick with local state to preserve edits (prevent loop).
      return;
    }
    
    if (initialLinks.length > 0) {
      const withTempIds = initialLinks.map((link) => ({
        ...link,
        // Use stable key based on type and id
        tempId: `${link.type}-${link.id}`
      }));
      setLinks(withTempIds);

      // Detect split mode from first link
      if (initialLinks[0]?.splitMode) {
        setSplitMode(initialLinks[0].splitMode);
      }
    } else {
      // Clear state when navigating to an expense with no links
      setLinks([]);
      setSplitMode('equal');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLinks, expenseId]);

  // Calculate split amounts based on current mode
  const linksWithSplitValues = useMemo(() => {
    if (links.length === 0) return [];

    return links.map((link) => {
      let calculatedSplitValue: number | undefined;

      switch (splitMode) {
        case 'equal':
          calculatedSplitValue = 100 / links.length;
          break;
        case 'percentage':
          calculatedSplitValue = link.splitValue ?? (100 / links.length);
          break;
        case 'fixed':
          calculatedSplitValue = link.splitValue ?? (expenseAmount / links.length);
          break;
      }

      return {
        ...link,
        splitMode,
        splitValue: calculatedSplitValue
      };
    });
  }, [links, splitMode, expenseAmount]);

  // Validation
  const validation = useMemo(() => {
    if (links.length === 0) {
      return { valid: true, errors: [] };
    }

    const errors: string[] = [];

    if (splitMode === 'percentage') {
      const totalPercentage = linksWithSplitValues.reduce(
        (sum, link) => sum + (link.splitValue || 0),
        0
      );

      if (Math.abs(totalPercentage - 100) > 0.01) {
        errors.push(`Percentages must sum to 100% (currently ${totalPercentage.toFixed(2)}%)`);
      }
    }

    if (splitMode === 'fixed') {
      const totalFixed = linksWithSplitValues.reduce(
        (sum, link) => sum + (link.splitValue || 0),
        0
      );

      if (Math.abs(totalFixed - expenseAmount) > 0.01) {
        errors.push(
          `Fixed amounts must sum to ${expenseAmount} ${expenseCurrency} (currently ${totalFixed.toFixed(2)} ${expenseCurrency})`
        );
      }
    }

    return { valid: errors.length === 0, errors };
  }, [linksWithSplitValues, splitMode, expenseAmount, expenseCurrency]);

  // Notify parent of changes - mark as internal update to prevent loop
  useEffect(() => {
    // Mark that the next prop change is a result of this update
    isInternalUpdate.current = true;
    
    if (validation.valid && links.length > 0) {
      onLinksChange(linksWithSplitValues);
    } else if (links.length === 0) {
      onLinksChange([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linksWithSplitValues, validation.valid, links.length]);

  const handleAddLink = (newLink: TravelLinkInfo | undefined) => {
    if (!newLink) return;

    // Clear any previous errors
    setAddError(null);

    // Check if already added
    const exists = links.some(link => link.id === newLink.id && link.type === newLink.type);
    if (exists) {
      setAddError('This route is already added to the list');
      return;
    }

    const linkWithTempId: LinkWithConfig = {
      ...newLink,
      // Use stable key based on type and id
      tempId: `${newLink.type}-${newLink.id}`,
      splitMode,
      splitValue: splitMode === 'equal' ? undefined : (splitMode === 'percentage' ? 0 : 0)
    };

    setLinks([...links, linkWithTempId]);
    setShowAddSelector(false);
  };

  const handleRemoveLink = (tempId: string) => {
    setLinks(links.filter(link => link.tempId !== tempId));
  };

  const handleSplitValueChange = (tempId: string, value: number) => {
    setLinks(links.map(link =>
      link.tempId === tempId
        ? { ...link, splitValue: value }
        : link
    ));
  };

  const handleSplitModeChange = (newMode: 'equal' | 'percentage' | 'fixed') => {
    setSplitMode(newMode);

    // Guard against division by zero
    if (links.length === 0) {
      return;
    }

    // Reset split values based on new mode
    const updatedLinks = links.map(link => {
      let newSplitValue: number | undefined;

      switch (newMode) {
        case 'equal':
          newSplitValue = undefined;
          break;
        case 'percentage':
          newSplitValue = 100 / links.length;
          break;
        case 'fixed':
          newSplitValue = expenseAmount / links.length;
          break;
      }

      return { ...link, splitValue: newSplitValue };
    });

    setLinks(updatedLinks);
  };

  const handleDistributeEqually = () => {
    // Guard against division by zero
    if (links.length === 0) {
      return;
    }

    if (splitMode === 'percentage') {
      const equalPercentage = 100 / links.length;
      setLinks(links.map(link => ({ ...link, splitValue: equalPercentage })));
    } else if (splitMode === 'fixed') {
      const equalAmount = expenseAmount / links.length;
      setLinks(links.map(link => ({ ...link, splitValue: equalAmount })));
    }
  };

  return (
    <div className={`space-y-4 ${className}`}>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Multi-Route Expense Linking
        </label>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Link this expense to multiple routes or segments with automatic cost distribution
        </p>

        {/* Split Mode Selection */}
        <div className="mb-3">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Distribution Mode
          </label>
          <AriaSelect
            id="split-mode-select"
            value={splitMode}
            onChange={(value) => handleSplitModeChange(value as 'equal' | 'percentage' | 'fixed')}
            options={[
              { value: 'equal', label: 'Equal split - Divide evenly across all routes' },
              { value: 'percentage', label: 'Percentage split - Specify percentage for each route' },
              { value: 'fixed', label: 'Fixed amount split - Specify exact amount for each route' }
            ]}
          />
        </div>

        {/* Current Links List */}
        {links.length > 0 && (
          <div className="space-y-2 mb-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                Linked Routes ({links.length})
              </span>
              {(splitMode === 'percentage' || splitMode === 'fixed') && (
                <button
                  type="button"
                  onClick={handleDistributeEqually}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Distribute equally
                </button>
              )}
            </div>

            {links.map((link) => {
              const calculatedAmount = splitMode === 'percentage'
                ? (expenseAmount * (link.splitValue || 0)) / 100
                : (link.splitValue || 0);

              return (
                <div
                  key={link.tempId}
                  className="flex items-start gap-2 p-2 bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {link.name}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {link.type === 'route' ? '🚗 Route' : link.type === 'location' ? '📍 Location' : '🏨 Accommodation'}
                    </div>

                    {splitMode !== 'equal' && (
                      <div className="mt-1 flex items-center gap-2">
                        <input
                          type="number"
                          step={splitMode === 'percentage' ? '0.01' : '0.01'}
                          min="0"
                          max={splitMode === 'percentage' ? 100 : expenseAmount}
                          value={link.splitValue || 0}
                          onChange={(e) => handleSplitValueChange(link.tempId, parseFloat(e.target.value) || 0)}
                          className="w-24 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                        <span className="text-xs text-gray-600 dark:text-gray-400">
                          {splitMode === 'percentage' ? '%' : expenseCurrency}
                        </span>
                        {splitMode === 'percentage' && (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            = {calculatedAmount.toFixed(2)} {expenseCurrency}
                          </span>
                        )}
                      </div>
                    )}

                    {splitMode === 'equal' && (
                      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {(100 / links.length).toFixed(2)}% = {(expenseAmount / links.length).toFixed(2)} {expenseCurrency}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveLink(link.tempId)}
                    className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 text-sm"
                    title="Remove link"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Validation Errors */}
        {!validation.valid && validation.errors.length > 0 && (
          <div className="mb-3 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
            {validation.errors.map((error, index) => (
              <div key={index} className="text-xs text-red-600 dark:text-red-400">
                ⚠️ {error}
              </div>
            ))}
          </div>
        )}

        {/* Add Link Button/Selector */}
        {!showAddSelector ? (
          <button
            type="button"
            onClick={() => setShowAddSelector(true)}
            className="w-full px-3 py-2 text-sm border-2 border-dashed border-gray-300 dark:border-gray-600 rounded hover:border-blue-500 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          >
            + Add route or segment
          </button>
        ) : (
          <div className="p-3 border border-blue-300 dark:border-blue-700 rounded bg-blue-50 dark:bg-blue-900/20">
            {addError && (
              <div className="mb-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
                <div className="text-xs text-red-600 dark:text-red-400">
                  ⚠️ {addError}
                </div>
              </div>
            )}
            <TravelItemSelector
              expenseId={expenseId}
              tripId={tripId}
              transactionDate={transactionDate}
              onReferenceChange={handleAddLink}
              className="mb-2"
            />
            <button
              type="button"
              onClick={() => {
                setShowAddSelector(false);
                setAddError(null);
              }}
              className="text-xs text-gray-600 dark:text-gray-400 hover:underline"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Summary */}
        {links.length > 0 && validation.valid && (
          <div className="mt-3 p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded">
            <div className="text-xs text-green-700 dark:text-green-300">
              ✓ Expense of {expenseAmount.toFixed(2)} {expenseCurrency} split across {links.length} route{links.length > 1 ? 's' : ''}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
