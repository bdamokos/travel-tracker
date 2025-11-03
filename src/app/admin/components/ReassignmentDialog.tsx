'use client';

import { useState, useRef, useEffect } from 'react';
import { LinkedExpense } from '../../lib/costLinkCleanup';
import { formatCurrency } from '../../lib/costUtils';
import { useDialog } from '@react-aria/dialog';
import { useModal, OverlayContainer, useOverlay, usePreventScroll } from '@react-aria/overlays';
import { FocusScope } from '@react-aria/focus';

interface ReassignmentDialogProps {
  isOpen: boolean;
  itemType: 'location' | 'route';
  fromItemName: string;
  linkedExpenses: LinkedExpense[];
  availableItems: Array<{ id: string; name: string; }>;
  onReassign: (toItemId: string, toItemName: string) => void;
  onCancel: () => void;
}


export default function ReassignmentDialog({
  isOpen,
  itemType,
  fromItemName,
  linkedExpenses,
  availableItems,
  onReassign,
  onCancel
}: ReassignmentDialogProps) {
  const [selectedItemId, setSelectedItemId] = useState<string>('');
  const ref = useRef<HTMLDivElement>(null);

  // React Aria overlay hooks
  const { overlayProps, underlayProps } = useOverlay({
    isOpen,
    onClose: onCancel,
    isDismissable: true,
    shouldCloseOnBlur: true,
    shouldCloseOnInteractOutside: () => true,
  }, ref);
  usePreventScroll();
  useModal();
  const { dialogProps, titleProps } = useDialog({
    'aria-label': `Reassign Linked Expenses`
  }, ref);

  // Escape key closes dialog
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const totalAmount = linkedExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const currency = linkedExpenses[0]?.currency || 'EUR';
  const selectedItem = availableItems.find(item => item.id === selectedItemId);

  const handleSubmit = () => {
    if (selectedItem) {
      onReassign(selectedItem.id, selectedItem.name);
    }
  };

  return (
    <OverlayContainer>
      <FocusScope contain restoreFocus autoFocus>
        <div {...underlayProps} className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div
            {...overlayProps}
            {...dialogProps}
            ref={ref}
            className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto outline-none"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reassign-dialog-title"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16l-4-4m0 0l4-4m-4 4h18" />
                </svg>
              </div>
              <div>
                <h3 id="reassign-dialog-title" {...titleProps} className="text-lg font-semibold text-gray-900 dark:text-white">
                  Reassign Linked Expenses
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Choose a new {itemType} for the linked expenses
                </p>
              </div>
            </div>

            <div className="mb-6">
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4 mb-4">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <h4 className="font-medium text-blue-800 dark:text-blue-200">
                      Moving {linkedExpenses.length} expense{linkedExpenses.length !== 1 ? 's' : ''}
                    </h4>
                    <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                      These expenses (totaling <strong>{formatCurrency(totalAmount, currency)}</strong>) will be moved 
                      from &quot;<strong>{fromItemName}</strong>&quot; to the {itemType} you select below.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Select target {itemType}:
                </label>
                
                {availableItems.length === 0 ? (
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4">
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.704-.833-2.464 0L4.35 16.5c-.77.833.192 2.5 1.732 2.5z" />
                      </svg>
                      <span className="text-yellow-800 dark:text-yellow-200 font-medium">
                        No other {itemType}s available
                      </span>
                    </div>
                    <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                      You need to have at least one other {itemType} to reassign the expenses. 
                      Consider adding a new {itemType} first, or choose to remove the links instead.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto border border-gray-200 dark:border-gray-600 rounded-lg">
                    {availableItems.map((item) => (
                      <label
                        key={item.id}
                        className={`flex items-center p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 ${
                          selectedItemId === item.id ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700' : ''
                        }`}
                      >
                        <input
                          type="radio"
                          name="targetItem"
                          value={item.id}
                          checked={selectedItemId === item.id}
                          onChange={(e) => setSelectedItemId(e.target.value)}
                          className="mr-3 text-blue-600 focus:ring-blue-500"
                        />
                        <div className="flex-1">
                          <div className="font-medium text-gray-900 dark:text-white">
                            {item.name}
                          </div>
                          {/* Add additional item info if needed */}
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {selectedItem && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-sm text-green-800 dark:text-green-200">
                      Ready to move {linkedExpenses.length} expense{linkedExpenses.length !== 1 ? 's' : ''} to &quot;{selectedItem.name}&quot;
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={onCancel}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!selectedItemId || availableItems.length === 0}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                Reassign Expenses
              </button>
            </div>
          </div>
        </div>
      </FocusScope>
    </OverlayContainer>
  );
}
