'use client';

import { useState, useRef } from 'react';
import { 
  YnabCategoryMapping, 
  ProcessedYnabTransaction, 
  CostTrackingData,
  YnabCategory
} from '@/app/types';
import { EXPENSE_CATEGORIES } from '@/app/lib/costUtils';
import AriaSelect from './AriaSelect';
import AccessibleModal from './AccessibleModal';

interface YnabImportFormProps {
  isOpen: boolean;
  costData: CostTrackingData;
  onImportComplete: () => void;
  onClose: () => void;
}

interface UploadResult {
  success: boolean;
  transactionCount: number;
  categories: string[];
  tempFileId: string;
}

interface TransactionSelection {
  transactionHash: string;
  expenseCategory: string;
}

export default function YnabImportForm({ isOpen, costData, onImportComplete, onClose }: YnabImportFormProps) {
  const [currentStep, setCurrentStep] = useState(0); // Start with method selection
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Step 0: Method Selection
  const [importMethod, setImportMethod] = useState<'file' | 'api' | null>(null);
  const [syncMode, setSyncMode] = useState<'last-sync' | 'last-import' | 'all'>('last-sync');
  
  // Step 1: Upload (file method) or API Category Loading
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [, setYnabCategories] = useState<YnabCategory[]>([]);
  
  // Step 2: Category Mapping
  const [categoryMappings, setCategoryMappings] = useState<YnabCategoryMapping[]>([]);
  
  // Step 3: Transaction Selection
  const [processedTransactions, setProcessedTransactions] = useState<ProcessedYnabTransaction[]>([]);
  const [selectedTransactions, setSelectedTransactions] = useState<TransactionSelection[]>([]);
  const [filteredCount, setFilteredCount] = useState(0);
  const [lastTransactionFound, setLastTransactionFound] = useState(false);
  const [showAllTransactions, setShowAllTransactions] = useState(false);
  const [totalTransactions, setTotalTransactions] = useState(0);
  const [lastServerKnowledge, setLastServerKnowledge] = useState<number>(0);

  const availableCountries = costData.countryBudgets.map(b => b.country);
  
  // Use the app's standard categories - either custom or the default EXPENSE_CATEGORIES
  const availableCategories = costData.customCategories || [...EXPENSE_CATEGORIES];

  // Helper function to determine sinceDate based on sync mode
  const getSinceDateForSyncMode = (mode: 'last-sync' | 'last-import' | 'all', ynabConfig?: { lastTransactionSync?: Date; lastTransactionImport?: Date }) => {
    if (mode === 'all') return undefined;
    if (mode === 'last-sync' && ynabConfig?.lastTransactionSync) {
      return ynabConfig.lastTransactionSync;
    }
    if (mode === 'last-import' && ynabConfig?.lastTransactionImport) {
      return ynabConfig.lastTransactionImport;
    }
    return undefined; // No date filtering if no previous sync/import found
  };

  // Load categories from YNAB API for mapping
  const handleLoadCategoriesFromApi = async () => {
    if (!costData.ynabConfig?.apiKey || !costData.ynabConfig?.selectedBudgetId) {
      setError('YNAB API configuration not found. Please setup YNAB API first.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
      const params = new URLSearchParams({
        apiKey: costData.ynabConfig.apiKey,
        budgetId: costData.ynabConfig.selectedBudgetId,
        ...(costData.ynabConfig.categoryServerKnowledge && {
          serverKnowledge: costData.ynabConfig.categoryServerKnowledge.toString()
        })
      });
      
      const response = await fetch(`${baseUrl}/api/ynab/categories?${params}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to load categories' }));
        throw new Error(errorData.error || `HTTP ${response.status}: Failed to load categories`);
      }

      const result = await response.json();
      
      if (result.success && result.categories) {
        setYnabCategories(result.categories);
        
        // Initialize category mappings with existing ones if available
        const existingMappings = costData.ynabImportData?.mappings || [];
        const newMappings: YnabCategoryMapping[] = result.categories.map((category: YnabCategory) => {
          const categoryName = `${category.category_group_name}: ${category.name}`;
          const existing = existingMappings.find(m => m.ynabCategory === categoryName);
          return existing || {
            ynabCategory: categoryName,
            ynabCategoryId: category.id,
            mappingType: 'none',
            countryName: undefined
          };
        });

        setCategoryMappings(newMappings);
        setCurrentStep(2); // Skip to mapping step
      } else {
        throw new Error('Invalid response format from YNAB API');
      }
    } catch (error) {
      console.error('Error loading YNAB categories:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to load categories from YNAB API';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`/api/cost-tracking/${costData.id}/ynab-upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to upload file');
      }

      const result: UploadResult = await response.json();
      setUploadResult(result);

      // Initialize category mappings with existing ones if available
      const existingMappings = costData.ynabImportData?.mappings || [];
      const newMappings: YnabCategoryMapping[] = result.categories.map(category => {
        const existing = existingMappings.find(m => m.ynabCategory === category);
        return existing || {
          ynabCategory: category,
          mappingType: 'none',
          countryName: undefined
        };
      });

      setCategoryMappings(newMappings);
      setCurrentStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload file');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCategoryMappingChange = (index: number, field: keyof YnabCategoryMapping, value: string) => {
    const newMappings = [...categoryMappings];
    if (field === 'mappingType') {
      newMappings[index].mappingType = value as 'country' | 'general' | 'none';
      if (value === 'general' || value === 'none') {
        newMappings[index].countryName = undefined;
      }
    } else if (field === 'countryName') {
      newMappings[index].countryName = value;
    }
    setCategoryMappings(newMappings);
  };

  // Load transactions from API directly
  const loadTransactionsFromApi = async () => {
    if (!costData.ynabConfig?.apiKey || !costData.ynabConfig?.selectedBudgetId) {
      setError('YNAB API configuration not found. Please setup YNAB API first.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
      
      const response = await fetch(`${baseUrl}/api/ynab/transactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apiKey: costData.ynabConfig.apiKey,
          budgetId: costData.ynabConfig.selectedBudgetId,
          categoryMappings: categoryMappings.map(mapping => ({
            ynabCategoryId: mapping.ynabCategoryId,
            mappingType: mapping.mappingType,
            countryName: mapping.countryName
          })),
          sinceDate: getSinceDateForSyncMode(syncMode, costData.ynabConfig),
          serverKnowledge: syncMode === 'all' ? undefined : costData.ynabConfig.transactionServerKnowledge
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to load transactions' }));
        throw new Error(errorData.error || `HTTP ${response.status}: Failed to load transactions`);
      }

      const result = await response.json();
      
      if (result.success) {
        setProcessedTransactions(result.transactions);
        setTotalTransactions(result.totalCount || result.transactions.length);
        setLastServerKnowledge(result.serverKnowledge || 0);

        // Handle case where no transactions are available for import
        if (result.transactions.length === 0) {
          const message = result.message || 'No transactions available for import.';
          
          // If the message indicates no categories are mapped, provide helpful guidance
          if (message.includes('No categories mapped')) {
            alert(`${message}\n\nTo fix this:\n1. Go back and open "YNAB Category Mappings"\n2. Load categories from YNAB API\n3. Set up your category mappings\n4. Click "Save Mappings"\n5. Then return to import transactions`);
            // Go back to method selection to start over
            setCurrentStep(0);
          } else {
            alert(message);
          }
          return;
        }

        // Initialize selected transactions with all available ones
        const initialSelections: TransactionSelection[] = result.transactions.map((txn: ProcessedYnabTransaction) => ({
          transactionHash: txn.hash,
          expenseCategory: availableCategories[0] // Default to first available category
        }));

        setSelectedTransactions(initialSelections);
        setCurrentStep(3);
      } else {
        throw new Error('Invalid response format from YNAB API');
      }
    } catch (error) {
      console.error('Error loading YNAB transactions:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to load transactions from YNAB API';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const loadTransactions = async (showAll: boolean = false) => {
    if (importMethod === 'api') {
      await loadTransactionsFromApi();
      return;
    }

    if (!uploadResult) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/cost-tracking/${costData.id}/ynab-process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'process',
          tempFileId: uploadResult.tempFileId,
          mappings: categoryMappings,
          showAll: showAll
        })
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to process transactions');
      }

      const result = await response.json();
      setProcessedTransactions(result.transactions);
      setFilteredCount(result.filteredCount || 0);
      setLastTransactionFound(result.lastImportedTransactionFound || false);
      setTotalTransactions(result.totalTransactions || result.transactions.length);

      // Handle case where no transactions are available for import
      if (result.transactions.length === 0) {
        const message = result.message || 'No transactions available for import.';
        alert(message);
        return;
      }

      // Initialize selected transactions with all available ones
      const initialSelections: TransactionSelection[] = result.transactions.map((txn: ProcessedYnabTransaction) => ({
        transactionHash: txn.hash,
        expenseCategory: availableCategories[0] // Default to first available category
      }));

      setSelectedTransactions(initialSelections);
      setCurrentStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process transactions');
    } finally {
      setIsLoading(false);
    }
  };

  const handleProceedToTransactions = async () => {
    await loadTransactions(false);
  };

  const handleTransactionToggle = (hash: string) => {
    const exists = selectedTransactions.find(s => s.transactionHash === hash);
    if (exists) {
      setSelectedTransactions(prev => prev.filter(s => s.transactionHash !== hash));
    } else {
      setSelectedTransactions(prev => [...prev, {
        transactionHash: hash,
        expenseCategory: availableCategories[0]
      }]);
    }
  };

  const handleCategoryChange = (hash: string, category: string) => {
    setSelectedTransactions(prev => 
      prev.map(s => 
        s.transactionHash === hash 
          ? { ...s, expenseCategory: category }
          : s
      )
    );
  };

  const handleFinalImport = async () => {
    setIsLoading(true);
    setError(null);

    try {
      let response: Response;

      if (importMethod === 'api') {
        // API-based import: send transactions directly to cost tracking API
        const expensesToAdd = selectedTransactions.map(selection => {
          const transaction = processedTransactions.find(t => t.hash === selection.transactionHash);
          if (!transaction) throw new Error(`Transaction not found: ${selection.transactionHash}`);

          return {
            id: Date.now().toString(36) + Math.random().toString(36).substring(2),
            date: new Date(transaction.date),
            amount: transaction.amount,
            currency: costData.currency, // Use the trip's currency
            category: selection.expenseCategory,
            description: transaction.description,
            country: transaction.isGeneralExpense ? 'General' : transaction.mappedCountry,
            notes: transaction.memo || '',
            isGeneralExpense: transaction.isGeneralExpense,
            expenseType: 'actual',
            source: 'ynab-api',
            hash: transaction.hash
          };
        });

        response = await fetch(`/api/cost-tracking?id=${costData.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            expenses: [...(costData.expenses || []), ...expensesToAdd],
            ynabImportData: {
              ...costData.ynabImportData,
              mappings: categoryMappings,
              lastImportDate: new Date().toISOString(),
              lastImportedTransactionHashes: selectedTransactions.map(s => s.transactionHash)
            },
            ynabConfig: {
              ...costData.ynabConfig,
              lastTransactionImport: new Date(),
              transactionServerKnowledge: lastServerKnowledge
            }
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to import transactions');
        }

        alert(`Successfully imported ${expensesToAdd.length} transactions!`);
        onImportComplete();
        onClose();

      } else {
        // File-based import: use existing ynab-process endpoint
        if (!uploadResult) {
          throw new Error('Upload result not found for file-based import');
        }

        response = await fetch(`/api/cost-tracking/${costData.id}/ynab-process`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'import',
            tempFileId: uploadResult.tempFileId,
            mappings: categoryMappings,
            selectedTransactions: selectedTransactions
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to import transactions');
        }

        const result = await response.json();
        alert(`Successfully imported ${result.importedCount} transactions!`);
        onImportComplete();
        onClose();
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import transactions');
    } finally {
      setIsLoading(false);
    }
  };

  const getStepTitle = () => {
    switch (currentStep) {
      case 0: return 'Choose Import Method';
      case 1: return importMethod === 'file' ? 'Upload YNAB Export' : 'Load from YNAB API';
      case 2: return 'Map Categories';
      case 3: return 'Select Transactions';
      default: return 'YNAB Import';
    }
  };

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={onClose}
      title={getStepTitle()}
      size="xl"
      isDismissable={true}
      isKeyboardDismissDisabled={false}
    >

          {/* Progress indicator */}
          <div className="flex items-center mb-8">
            {[0, 1, 2, 3].map((step) => (
              <div key={step} className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  step <= currentStep ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-300'
                }`}>
                  {step + 1}
                </div>
                {step < 3 && (
                  <div className={`w-16 h-1 mx-2 ${
                    step < currentStep ? 'bg-blue-500' : 'bg-gray-200 dark:bg-gray-700'
                  }`} />
                )}
              </div>
            ))}
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-sm">
              {error}
            </div>
          )}

          {/* Step 0: Method Selection */}
          {currentStep === 0 && (
            <div className="space-y-6">
              <p className="text-gray-600 dark:text-gray-300 mb-6">
                Choose how you'd like to import transactions from YNAB. You can either upload a file export or load transactions directly from your YNAB account via the API.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* File Upload Method */}
                <div 
                  className={`border-2 rounded-lg p-6 cursor-pointer transition-all duration-200 ${
                    importMethod === 'file' 
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950' 
                      : 'border-gray-300 dark:border-gray-600 hover:border-blue-300 dark:hover:border-blue-700'
                  }`}
                  onClick={() => setImportMethod('file')}
                >
                  <div className="flex items-center mb-4">
                    <input
                      type="radio"
                      name="import-method"
                      value="file"
                      checked={importMethod === 'file'}
                      onChange={() => setImportMethod('file')}
                      className="mr-3"
                    />
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Upload YNAB Export File</h3>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
                    Upload a .tsv or .zip export file from YNAB. This method works offline and gives you full control over which transactions to import.
                  </p>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    ✓ Works without API setup<br />
                    ✓ Process historical data<br />
                    ✓ Full transaction control
                  </div>
                </div>

                {/* API Method */}
                <div 
                  className={`border-2 rounded-lg p-6 cursor-pointer transition-all duration-200 ${
                    importMethod === 'api' 
                      ? 'border-purple-500 bg-purple-50 dark:bg-purple-950' 
                      : costData.ynabConfig?.apiKey
                        ? 'border-gray-300 dark:border-gray-600 hover:border-purple-300 dark:hover:border-purple-700'
                        : 'border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 cursor-not-allowed'
                  }`}
                  onClick={() => costData.ynabConfig?.apiKey && setImportMethod('api')}
                >
                  <div className="flex items-center mb-4">
                    <input
                      type="radio"
                      name="import-method"
                      value="api"
                      checked={importMethod === 'api'}
                      onChange={() => setImportMethod('api')}
                      disabled={!costData.ynabConfig?.apiKey}
                      className="mr-3"
                    />
                    <h3 className={`text-lg font-semibold ${
                      costData.ynabConfig?.apiKey 
                        ? 'text-gray-800 dark:text-gray-100' 
                        : 'text-gray-400 dark:text-gray-500'
                    }`}>
                      Load from YNAB API
                    </h3>
                  </div>
                  {costData.ynabConfig?.apiKey ? (
                    <>
                      <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
                        Load transactions directly from your connected YNAB budget: <strong>{costData.ynabConfig.selectedBudgetName}</strong>
                      </p>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        ✓ Real-time data sync<br />
                        ✓ Automatic categorization<br />
                        ✓ Delta sync support
                      </div>
                      {importMethod === 'api' && (
                        <div className="mt-4 pt-3 border-t border-purple-200 dark:border-purple-700">
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Sync Mode
                          </label>
                          <AriaSelect
                            id="sync-mode-select"
                            value={syncMode}
                            onChange={(value) => setSyncMode(value as 'last-sync' | 'last-import' | 'all')}
                            options={[
                              { value: 'last-sync', label: 'Since Last Sync (Recommended)' },
                              { value: 'last-import', label: 'Since Last Import (Error Recovery)' },
                              { value: 'all', label: 'All Transactions (Full Sync)' }
                            ]}
                            placeholder="Select sync mode"
                            className="text-sm"
                          />
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {syncMode === 'last-sync' && 'Load only new transactions since the last API sync'}
                            {syncMode === 'last-import' && 'Load transactions since the last successful import (for error recovery)'}
                            {syncMode === 'all' && 'Load all transactions (may include previously imported items)'}
                          </p>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-gray-400 dark:text-gray-500 mb-3">
                        API access not configured. Please set up your YNAB API connection first.
                      </p>
                      <div className="text-sm text-gray-400 dark:text-gray-500">
                        ⚠ Requires YNAB API setup<br />
                        ⚠ Configure in cost tracker settings
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <button
                  onClick={() => {
                    if (importMethod === 'file') {
                      setCurrentStep(1);
                    } else if (importMethod === 'api') {
                      handleLoadCategoriesFromApi();
                    }
                  }}
                  disabled={!importMethod}
                  className="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* Step 1: Upload/API Loading */}
          {currentStep === 1 && importMethod === 'file' && (
            <div className="space-y-4">
              <p className="text-gray-600 dark:text-gray-300 mb-4">
                Upload your YNAB export file (.tsv format) or YNAB export zip file (.zip format). The system will automatically extract the transaction register from zip files.
              </p>
              
              <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".tsv,.zip"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading}
                  className="bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600 disabled:opacity-50"
                >
                  {isLoading ? 'Uploading...' : 'Choose TSV or ZIP File'}
                </button>
                                  <p className="text-gray-500 dark:text-gray-400 mt-2">
                    Select your YNAB export file (.tsv or .zip) to continue
                  </p>
              </div>
            </div>
          )}

          {/* Step 2: Category Mapping */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-700 rounded-lg p-4 mb-4">
                <h3 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">Review and Adjust Category Mappings</h3>
                <p className="text-sm text-blue-700 dark:text-blue-300 mb-2">
                  Found {categoryMappings.length} categories in your YNAB file. 
                  Configure how each category should be mapped to countries or general expenses.
                </p>
                <div className="flex gap-4 text-sm">
                  <span className="text-blue-700 dark:text-blue-300">
                    ✓ {categoryMappings.filter(m => m.mappingType !== 'general' || m.mappingType === 'general').length} mapped
                  </span>
                  <span className="text-orange-700 dark:text-orange-300">
                    ⚠ {categoryMappings.filter(m => m.mappingType === 'country' && !m.countryName).length} need country selection
                  </span>
                </div>
              </div>
              
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {categoryMappings.map((mapping, index) => {
                  const existingMapping = costData.ynabImportData?.mappings?.find(m => m.ynabCategory === mapping.ynabCategory);
                  const isExisting = !!existingMapping;
                  const isComplete = mapping.mappingType === 'general' || (mapping.mappingType === 'country' && mapping.countryName);
                  
                  return (
                    <div key={mapping.ynabCategory} className={`flex items-center space-x-4 p-3 rounded-lg border ${
                      isComplete ? 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-700' : 'bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-700'
                    }`}>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-800 dark:text-gray-100">{mapping.ynabCategory}</span>
                          {isExisting && (
                            <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded-sm">
                              Previously mapped
                            </span>
                          )}
                          {!isComplete && (
                            <span className="px-2 py-1 text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 rounded-sm">
                              Needs country
                            </span>
                          )}
                        </div>
                      </div>
                    
                    <AriaSelect
                      id={`mapping-type-${index}`}
                      value={mapping.mappingType}
                      onChange={(value) => handleCategoryMappingChange(index, 'mappingType', value)}
                      options={[
                        { value: 'none', label: 'None (Not Travel-Related)' },
                        { value: 'general', label: 'General Expenses' },
                        { value: 'country', label: 'Country-Specific' }
                      ]}
                      placeholder="Select Mapping Type"
                    />
                    
                    {mapping.mappingType === 'country' && (
                      <div className="flex gap-2">
                        <AriaSelect
                          id={`country-${index}`}
                          value={mapping.countryName || ''}
                          onChange={(value) => handleCategoryMappingChange(index, 'countryName', value)}
                          options={[
                            ...availableCountries.map(country => ({ value: country, label: country })),
                            { value: '__new__', label: '+ Create New Country' }
                          ]}
                          placeholder="Select Country"
                        />
                        {mapping.countryName === '__new__' && (
                          <input
                            type="text"
                            placeholder="Enter country name"
                            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                            onBlur={(e) => {
                              if (e.target.value.trim()) {
                                handleCategoryMappingChange(index, 'countryName', e.target.value.trim());
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                                handleCategoryMappingChange(index, 'countryName', e.currentTarget.value.trim());
                              }
                            }}
                          />
                        )}
                      </div>
                    )}
                  </div>
                );
                })}
              </div>
              
              {/* Quick Actions */}
              <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <h4 className="font-medium text-gray-800 dark:text-gray-100 mb-3">Quick Actions</h4>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => {
                      const newMappings = categoryMappings.map(m => ({ ...m, mappingType: 'none' as const, countryName: undefined }));
                      setCategoryMappings(newMappings);
                    }}
                    className="px-3 py-2 bg-gray-500 text-white rounded-sm text-sm hover:bg-gray-600"
                  >
                    Map All as None
                  </button>
                  <button
                    onClick={() => {
                      const newMappings = categoryMappings.map(m => ({ ...m, mappingType: 'general' as const, countryName: undefined }));
                      setCategoryMappings(newMappings);
                    }}
                    className="px-3 py-2 bg-blue-500 text-white rounded-sm text-sm hover:bg-blue-600"
                  >
                    Map All as General
                  </button>
                  {availableCountries.map(country => (
                    <button
                      key={country}
                      onClick={() => {
                        const newMappings = categoryMappings.map(m => 
                          m.mappingType === 'country' && !m.countryName 
                            ? { ...m, countryName: country }
                            : m
                        );
                        setCategoryMappings(newMappings);
                      }}
                      className="px-3 py-2 bg-blue-500 text-white rounded-sm text-sm hover:bg-blue-600"
                    >
                      Map Unmapped to {country}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-300 mt-2">
                  Use these buttons to quickly apply mappings to multiple categories at once.
                </p>
              </div>

              <div className="flex justify-between pt-4">
                <button
                  onClick={() => setCurrentStep(importMethod === 'file' ? 1 : 0)}
                  className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100"
                >
                  Back
                </button>
                <button
                  onClick={handleProceedToTransactions}
                  disabled={isLoading || categoryMappings.some(m => m.mappingType === 'country' && !m.countryName)}
                  className="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600 disabled:opacity-50"
                >
                  {isLoading ? 'Processing...' : 'Continue to Transactions'}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Transaction Selection */}
          {currentStep === 3 && (
            <div className="space-y-4">
              <p className="text-gray-600 dark:text-gray-300 mb-4">
                Select which transactions to import and assign categories. 
                Only new transactions (not previously imported) are shown.
              </p>

              {/* Filtering Indicator */}
              {lastTransactionFound && filteredCount > 0 && (
                <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
                        Showing {processedTransactions.length} new transactions
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        setShowAllTransactions(!showAllTransactions);
                        loadTransactions(!showAllTransactions);
                      }}
                      className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 underline"
                    >
                      {showAllTransactions ? 'Hide previously imported' : `Show all ${totalTransactions} transactions`}
                    </button>
                  </div>
                  <p className="text-sm text-blue-600 dark:text-blue-300 mt-1">
                    {filteredCount} previously imported transactions are hidden
                  </p>
                </div>
              )}

              {/* Empty State for No New Transactions */}
              {processedTransactions.length === 0 && lastTransactionFound && (
                <div className="text-center py-8">
                  <svg className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">No new transactions</h3>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    All transactions in this file have already been imported.
                  </p>
                  <button
                    onClick={() => {
                      setShowAllTransactions(true);
                      loadTransactions(true);
                    }}
                    className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-blue-600 bg-blue-100 hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-200 dark:hover:bg-blue-800"
                  >
                    Show all transactions
                  </button>
                </div>
              )}
              
              {/* Transaction Selection Controls - Only show when there are transactions */}
              {processedTransactions.length > 0 && (
                <>
                  <div className="mb-4">
                    <button
                      onClick={() => {
                        if (selectedTransactions.length === processedTransactions.length) {
                          setSelectedTransactions([]);
                        } else {
                          setSelectedTransactions(processedTransactions.map(txn => ({
                            transactionHash: txn.hash,
                            expenseCategory: availableCategories[0]
                          })));
                        }
                      }}
                      className="text-blue-500 hover:text-blue-700 text-sm"
                    >
                      {selectedTransactions.length === processedTransactions.length ? 'Deselect All' : 'Select All'}
                    </button>
                    <span className="text-gray-500 dark:text-gray-400 text-sm ml-4">
                      {selectedTransactions.length} of {processedTransactions.length} selected
                    </span>
                  </div>
              
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {processedTransactions.map((txn) => {
                  const isSelected = selectedTransactions.some(s => s.transactionHash === txn.hash);
                  const selection = selectedTransactions.find(s => s.transactionHash === txn.hash);
                  
                  return (
                    <div key={txn.hash} className={`p-3 rounded-lg border ${
                      isSelected ? 'border-blue-300 bg-blue-50 dark:bg-blue-950 dark:border-blue-700' : 'border-gray-200 bg-white dark:bg-gray-800 dark:border-gray-700'
                    }`}>
                      <div className="flex items-center space-x-4">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleTransactionToggle(txn.hash)}
                          className="w-4 h-4 text-blue-600"
                        />
                        
                        <div className="flex-1">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-medium text-gray-800 dark:text-gray-100">{txn.description}</p>
                              <p className="text-sm text-gray-600 dark:text-gray-300">{txn.date}</p>
                              {txn.memo && <p className="text-sm text-gray-500 dark:text-gray-400">{txn.memo}</p>}
                            </div>
                            <div className="text-right">
                              <p className="font-medium text-gray-800 dark:text-gray-100">€{txn.amount.toFixed(2)}</p>
                              <p className="text-sm text-gray-600 dark:text-gray-300">
                                {txn.isGeneralExpense ? 'General' : txn.mappedCountry}
                              </p>
                            </div>
                          </div>
                        </div>
                        
                        {isSelected && (
                          <AriaSelect
                            id={`expense-category-${txn.hash}`}
                            value={selection?.expenseCategory || availableCategories[0]}
                            onChange={(value) => handleCategoryChange(txn.hash, value)}
                            className="px-3 py-1 text-sm"
                            options={availableCategories.map(category => ({ value: category, label: category }))}
                            placeholder="Select Category"
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              
                  <div className="flex justify-between pt-4">
                    <button
                      onClick={() => setCurrentStep(2)}
                      className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleFinalImport}
                      disabled={isLoading || selectedTransactions.length === 0}
                      className="bg-green-500 text-white px-6 py-2 rounded-lg hover:bg-green-600 disabled:opacity-50"
                    >
                      {isLoading ? 'Importing...' : `Import ${selectedTransactions.length} Transactions`}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
    </AccessibleModal>
  );
} 