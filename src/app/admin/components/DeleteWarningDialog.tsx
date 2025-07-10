'use client';

import { useState, useRef, useEffect } from 'react';
import { LinkedExpense } from '../../lib/costLinkCleanup';
import { formatCurrency, formatDate } from '../../lib/costUtils';
import { useDialog } from '@react-aria/dialog';
import { useModal, OverlayContainer, useOverlay, usePreventScroll } from '@react-aria/overlays';
import { FocusScope } from '@react-aria/focus';

interface DeleteWarningDialogProps {
  isOpen: boolean;
  itemType: 'location' | 'route';
  itemName: string;
  linkedExpenses: LinkedExpense[];
  onChoice: (choice: 'remove' | 'reassign' | 'cancel') => void;
}

export default function DeleteWarningDialog({
  isOpen,
  itemType,
  itemName,
  linkedExpenses,
  onChoice
}: DeleteWarningDialogProps) {
  const [showDetails, setShowDetails] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // React Aria overlay hooks
  const { overlayProps, underlayProps } = useOverlay({
    isOpen,
    onClose: () => onChoice('cancel'),
    isDismissable: true,
    shouldCloseOnBlur: true,
    shouldCloseOnInteractOutside: () => true,
  }, ref);
  usePreventScroll();
  useModal();
  const { dialogProps, titleProps } = useDialog({
    'aria-label': `Delete ${itemType}`
  }, ref);

  // Escape key closes dialog
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onChoice('cancel');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onChoice]);

  if (!isOpen) return null;

  const totalAmount = linkedExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const currency = linkedExpenses[0]?.currency || 'EUR';

  return (
    <OverlayContainer>
      <FocusScope contain restoreFocus autoFocus>
        <div {...underlayProps} className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div
            {...overlayProps}
            {...dialogProps}
            ref={ref}
            className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto outline-none"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-dialog-title"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.704-.833-2.464 0L4.35 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <div>
                <h3 id="delete-dialog-title" {...titleProps} className="text-lg font-semibold text-gray-900 dark:text-white">
                  Delete {itemType === 'location' ? 'Location' : 'Route'}?
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  This action cannot be undone
                </p>
              </div>
            </div>

            <div className="mb-6">
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4 mb-4">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.704-.833-2.464 0L4.35 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  <div>
                    <h4 className="font-medium text-yellow-800 dark:text-yellow-200">
                      Linked Expenses Found
                    </h4>
                    <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                      The {itemType} &quot;<strong>{itemName}</strong>&quot; has <strong>{linkedExpenses.length}</strong> linked 
                      expense{linkedExpenses.length !== 1 ? 's' : ''} totaling <strong>{formatCurrency(totalAmount, currency)}</strong>.
                    </p>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowDetails(!showDetails)}
                className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm font-medium mb-4"
              >
                {showDetails ? '▼ Hide expense details' : '▶ Show expense details'}
              </button>

              {showDetails && (
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-4">
                  <h5 className="font-medium text-gray-900 dark:text-white mb-3">Linked Expenses:</h5>
                  <div className="space-y-2">
                    {linkedExpenses.map((expense) => (
                      <div key={`${expense.costTrackerId}-${expense.id}`} className="bg-white dark:bg-gray-800 p-3 rounded border dark:border-gray-600">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-medium text-gray-900 dark:text-white">
                              {expense.description}
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-400">
                              {formatDate(expense.date)} • {expense.costTrackerTitle}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-medium text-gray-900 dark:text-white">
                              {formatCurrency(expense.amount, expense.currency)}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                What would you like to do with these linked expenses?
              </p>

              <button
                onClick={() => onChoice('remove')}
                className="w-full text-left p-4 border border-red-200 dark:border-red-700 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 bg-red-600 rounded-full flex items-center justify-center mt-0.5">
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-medium text-gray-900 dark:text-white">
                      Remove links and delete {itemType}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      The expenses will remain but lose their connection to this {itemType}
                    </div>
                  </div>
                </div>
              </button>

              <button
                onClick={() => onChoice('reassign')}
                className="w-full text-left p-4 border border-blue-200 dark:border-blue-700 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center mt-0.5">
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M7 16l-4-4m0 0l4-4m-4 4h18" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-medium text-gray-900 dark:text-white">
                      Reassign expenses to another {itemType}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      Move the expense links to a different {itemType} before deleting
                    </div>
                  </div>
                </div>
              </button>

              <button
                onClick={() => onChoice('cancel')}
                className="w-full text-left p-4 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 bg-gray-600 rounded-full flex items-center justify-center mt-0.5">
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-medium text-gray-900 dark:text-white">
                      Cancel deletion
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      Keep the {itemType} and all its linked expenses
                    </div>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      </FocusScope>
    </OverlayContainer>
  );
}