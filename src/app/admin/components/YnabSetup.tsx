'use client';

import { useState } from 'react';
import { YnabBudget, YnabConfig } from '@/app/types';
import AccessibleModal from './AccessibleModal';
import AriaSelect from './AriaSelect';

interface YnabSetupProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigSaved: (config: YnabConfig) => void;
  costTrackerId: string; // CRITICAL: Required for data isolation
  existingConfig?: YnabConfig;
}



export default function YnabSetup({ isOpen, onClose, onConfigSaved, costTrackerId, existingConfig }: YnabSetupProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Step 1: API Key Validation
  const [apiKey, setApiKey] = useState(existingConfig?.apiKey || '');
  const [budgets, setBudgets] = useState<YnabBudget[]>([]);
  
  // Step 2: Budget Selection
  const [selectedBudgetId, setSelectedBudgetId] = useState(existingConfig?.selectedBudgetId || '');
  const [selectedBudgetName, setSelectedBudgetName] = useState(existingConfig?.selectedBudgetName || '');
  const [currency, setCurrency] = useState(existingConfig?.currency || '');

  const handleApiKeyValidation = async () => {
    if (!apiKey.trim()) {
      setError('Please enter your YNAB Personal Access Token');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/ynab/setup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ apiKey: apiKey.trim(), costTrackerId }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to validate API key');
      }

      if (!result.budgets || result.budgets.length === 0) {
        throw new Error('No budgets found. Please check your YNAB account.');
      }

      setBudgets(result.budgets);
      setCurrentStep(2);
    } catch (err) {
      const error = err as Error;
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBudgetSelection = () => {
    if (!selectedBudgetId) {
      setError('Please select a budget');
      return;
    }

    const selectedBudget = budgets.find(b => b.id === selectedBudgetId);
    if (!selectedBudget) {
      setError('Invalid budget selection');
      return;
    }

    const config: YnabConfig = {
      costTrackerId, // CRITICAL: Scope configuration to this specific cost tracker
      apiKey: apiKey.trim(),
      selectedBudgetId,
      selectedBudgetName: selectedBudget.name,
      currency: selectedBudget.currency_format.iso_code,
      // Initialize sync timestamps
      lastCategorySync: undefined,
      categoryServerKnowledge: undefined,
      lastTransactionSync: undefined,
      lastTransactionImport: undefined,
      transactionServerKnowledge: undefined,
    };

    onConfigSaved(config);
    onClose();
    
    // Reset form for next time
    setCurrentStep(1);
    setApiKey('');
    setBudgets([]);
    setSelectedBudgetId('');
    setSelectedBudgetName('');
    setCurrency('');
    setError(null);
  };

  const handleClose = () => {
    onClose();
    setError(null);
  };

  const budgetOptions = budgets.map(budget => ({
    value: budget.id,
    label: `${budget.name} (${budget.currency_format.iso_code})`
  }));

  const getStepTitle = () => {
    switch (currentStep) {
      case 1: return 'Connect YNAB Account';
      case 2: return 'Select Budget';
      default: return 'YNAB Setup';
    }
  };

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={handleClose}
      title={getStepTitle()}
      size="lg"
      isDismissable={true}
      isKeyboardDismissDisabled={false}
    >
      {/* Progress indicator */}
      <div className="flex items-center mb-8">
        {[1, 2].map((step) => (
          <div key={step} className="flex items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              step <= currentStep ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-300'
            }`}>
              {step}
            </div>
            {step < 2 && (
              <div className={`w-16 h-1 mx-2 ${
                step < currentStep ? 'bg-blue-500' : 'bg-gray-200 dark:bg-gray-700'
              }`} />
            )}
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {currentStep === 1 && (
        <div className="space-y-6">
          <div>
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              To connect your YNAB account, you'll need to provide your Personal Access Token. 
              This allows the travel tracker to read your budget data securely.
            </p>
            
            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-700 rounded-lg p-4 mb-4">
              <h4 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">
                How to get your YNAB Personal Access Token:
              </h4>
              <ol className="text-sm text-blue-700 dark:text-blue-300 space-y-1 list-decimal list-inside">
                <li>Go to <a href="https://app.ynab.com/settings/developer" target="_blank" rel="noopener noreferrer" className="underline hover:no-underline">YNAB Developer Settings</a></li>
                <li>Click "New Token"</li>
                <li>Copy the generated token</li>
                <li>Paste it in the field below</li>
              </ol>
            </div>
          </div>

          <div>
            <label htmlFor="api-key" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              YNAB Personal Access Token
            </label>
            <input
              id="api-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter your YNAB Personal Access Token"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:text-white"
              disabled={isLoading}
              autoComplete="off"
            />
          </div>

          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApiKeyValidation}
              disabled={isLoading || !apiKey.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Validating...' : 'Continue'}
            </button>
          </div>
        </div>
      )}

      {currentStep === 2 && (
        <div className="space-y-6">
          <div>
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              Great! We found {budgets.length} budget{budgets.length !== 1 ? 's' : ''} in your YNAB account. 
              Please select which budget you'd like to use for this trip's expense tracking.
            </p>
          </div>

          <div>
            <label htmlFor="budget-select" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Select Budget
            </label>
            <AriaSelect
              id="budget-select"
              options={budgetOptions}
              value={selectedBudgetId}
              onChange={(value) => {
                setSelectedBudgetId(value);
                const selected = budgets.find(b => b.id === value);
                if (selected) {
                  setSelectedBudgetName(selected.name);
                  setCurrency(selected.currency_format.iso_code);
                }
              }}
              placeholder="Choose a budget..."
              className="w-full"
            />
          </div>

          {selectedBudgetId && (
            <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-700 rounded-lg p-4">
              <h4 className="font-semibold text-green-800 dark:text-green-200 mb-2">Selected Budget:</h4>
              <p className="text-sm text-green-700 dark:text-green-300">
                <strong>{selectedBudgetName}</strong> ({currency})
              </p>
            </div>
          )}

          <div className="flex justify-between">
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Back
            </button>
            <div className="space-x-3">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBudgetSelection}
                disabled={!selectedBudgetId}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save Configuration
              </button>
            </div>
          </div>
        </div>
      )}
    </AccessibleModal>
  );
}