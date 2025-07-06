'use client';

import { useState, useRef } from 'react';
import { 
  YnabCategoryMapping, 
  ProcessedYnabTransaction, 
  CostTrackingData 
} from '@/app/types';
import { EXPENSE_CATEGORIES } from '@/app/lib/costUtils';

interface YnabImportFormProps {
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

export default function YnabImportForm({ costData, onImportComplete, onClose }: YnabImportFormProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Step 1: Upload
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Step 2: Category Mapping
  const [categoryMappings, setCategoryMappings] = useState<YnabCategoryMapping[]>([]);
  
  // Step 3: Transaction Selection
  const [processedTransactions, setProcessedTransactions] = useState<ProcessedYnabTransaction[]>([]);
  const [selectedTransactions, setSelectedTransactions] = useState<TransactionSelection[]>([]);

  const availableCountries = costData.countryBudgets.map(b => b.country);
  
  // Use the app's standard categories - either custom or the default EXPENSE_CATEGORIES
  const availableCategories = costData.customCategories || [...EXPENSE_CATEGORIES];

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

  const handleProceedToTransactions = async () => {
    if (!uploadResult) return;

    setIsLoading(true);
    setError(null);

    try {
      const mappingsParam = encodeURIComponent(JSON.stringify(categoryMappings));
      const response = await fetch(
        `/api/cost-tracking/${costData.id}/ynab-process?tempFileId=${uploadResult.tempFileId}&mappings=${mappingsParam}`
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to process transactions');
      }

      const result = await response.json();
      setProcessedTransactions(result.transactions);

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
    if (!uploadResult) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/cost-tracking/${costData.id}/ynab-process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import transactions');
    } finally {
      setIsLoading(false);
    }
  };

  const getStepTitle = () => {
    switch (currentStep) {
      case 1: return 'Upload YNAB Export';
      case 2: return 'Map Categories';
      case 3: return 'Select Transactions';
      default: return 'YNAB Import';
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-800 dark:text-white">{getStepTitle()}</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-xl"
            >
              ×
            </button>
          </div>

          {/* Progress indicator */}
          <div className="flex items-center mb-8">
            {[1, 2, 3].map((step) => (
              <div key={step} className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  step <= currentStep ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-300'
                }`}>
                  {step}
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

          {/* Step 1: Upload */}
          {currentStep === 1 && (
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
                    
                    <select
                      value={mapping.mappingType}
                      onChange={(e) => handleCategoryMappingChange(index, 'mappingType', e.target.value)}
                      className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                    >
                      <option value="none">None (Not Travel-Related)</option>
                      <option value="general">General Expenses</option>
                      <option value="country">Country-Specific</option>
                    </select>
                    
                    {mapping.mappingType === 'country' && (
                      <div className="flex gap-2">
                        <select
                          value={mapping.countryName || ''}
                          onChange={(e) => handleCategoryMappingChange(index, 'countryName', e.target.value)}
                          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                        >
                          <option value="">Select Country</option>
                          {availableCountries.map(country => (
                            <option key={country} value={country}>{country}</option>
                          ))}
                          <option value="__new__">+ Create New Country</option>
                        </select>
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
                  onClick={() => setCurrentStep(1)}
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
                          <select
                            value={selection?.expenseCategory || availableCategories[0]}
                            onChange={(e) => handleCategoryChange(txn.hash, e.target.value)}
                            className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md text-sm dark:bg-gray-700 dark:text-white"
                          >
                            {availableCategories.map(category => (
                              <option key={category} value={category}>{category}</option>
                            ))}
                          </select>
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 