'use client';

import { useState, useEffect } from 'react';
import { YnabCategoryMapping, CostTrackingData, YnabCategory } from '@/app/types';
import { extractCategoriesFromYnabFile } from '@/app/lib/ynabUtils';
import JSZip from 'jszip';
import AriaSelect from './AriaSelect';
import AccessibleModal from './AccessibleModal';

// Security constants
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB limit
const MAX_EXTRACTED_SIZE = 5 * 1024 * 1024; // 5MB limit for extracted content

async function extractYnabTsvFromZip(zipFile: File): Promise<string> {
  // Security check: file size
  if (zipFile.size > MAX_FILE_SIZE) {
    throw new Error('Zip file too large. Maximum size is 10MB.');
  }

  const arrayBuffer = await zipFile.arrayBuffer();
  const zip = new JSZip();
  const zipContents = await zip.loadAsync(arrayBuffer);

  // Look for TSV files in the zip
  const tsvFiles = Object.keys(zipContents.files).filter(filename => {
    // Security check: prevent directory traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return false;
    }
    return filename.toLowerCase().endsWith('.tsv');
  });

  if (tsvFiles.length === 0) {
    throw new Error('No TSV files found in the zip archive');
  }

  // Try to find the register file first (usually contains "register" in the name)
  let targetFile = tsvFiles.find(name =>
    name.toLowerCase().includes('register') ||
    name.toLowerCase().includes('transaction')
  );

  // If no register file found, use the first TSV file
  if (!targetFile) {
    targetFile = tsvFiles[0];
  }

  // Extract and validate the content
  const fileContent = await zipContents.files[targetFile].async('string');

  // Security check: extracted content size
  if (fileContent.length > MAX_EXTRACTED_SIZE) {
    throw new Error('Extracted file too large. Maximum size is 5MB.');
  }

  // Basic validation: should look like a TSV file
  const lines = fileContent.split('\n');
  if (lines.length < 2) {
    throw new Error('Invalid TSV file: too few lines');
  }

  // Check if it has tab-separated headers
  const headers = lines[0].split('\t');
  if (headers.length < 3) {
    throw new Error('Invalid TSV file: insufficient columns');
  }

  return fileContent;
}

interface YnabMappingManagerProps {
  isOpen: boolean;
  costData: CostTrackingData;
  onSave: (mappings: YnabCategoryMapping[]) => void;
  onClose: () => void;
}

export default function YnabMappingManager({ isOpen, costData, onSave, onClose }: YnabMappingManagerProps) {
  const [mappings, setMappings] = useState<YnabCategoryMapping[]>([]);
  const [extractedCategories, setExtractedCategories] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [newMapping, setNewMapping] = useState({
    ynabCategory: '',
    mappingType: 'none' as 'country' | 'general' | 'none',
    countryName: ''
  });

  // YNAB API integration state
  const [ynabCategories, setYnabCategories] = useState<YnabCategory[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const [categoryLoadError, setCategoryLoadError] = useState<string | null>(null);
  const [lastCategorySync, setLastCategorySync] = useState<Date | null>(null);

  const availableCountries = costData.countryBudgets.map(b => b.country);

  useEffect(() => {
    // Load existing mappings
    if (costData.ynabImportData?.mappings) {
      console.log('DEBUG: Loading existing mappings:', costData.ynabImportData.mappings);
      setMappings(costData.ynabImportData.mappings);
    }
  }, [costData]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const isZipFile = file.name.toLowerCase().endsWith('.zip');
    const isTsvFile = file.name.toLowerCase().endsWith('.tsv');

    if (!isZipFile && !isTsvFile) {
      alert('Please upload a .tsv or .zip file');
      return;
    }

    setIsUploading(true);

    try {
      // Extract TSV content based on file type
      let tsvContent: string;
      if (isZipFile) {
        tsvContent = await extractYnabTsvFromZip(file);
      } else {
        tsvContent = await file.text();
      }

      const categoryList = extractCategoriesFromYnabFile(tsvContent);
      setExtractedCategories(categoryList);

      // Don't automatically create mappings! Just track what's unmapped
      console.log('DEBUG: Current mappings:', mappings);
      console.log('DEBUG: Extracted categories:', categoryList);
      
      const existingCategoryNames = new Set(mappings.map(m => m.ynabCategory?.trim()));
      console.log('DEBUG: Existing category names:', existingCategoryNames);
      
      const unmappedCategories = categoryList.filter(category => !existingCategoryNames.has(category?.trim()));
      console.log('DEBUG: Unmapped categories found:', unmappedCategories);

      const alreadyMappedCount = categoryList.length - unmappedCategories.length;
      alert(`Extracted ${categoryList.length} categories from YNAB file. ${alreadyMappedCount} already mapped, ${unmappedCategories.length} unmapped categories found.`);
    } catch (error) {
      console.error('Error processing file:', error);
      alert('Error processing file. Please make sure it\'s a valid YNAB export.');
    } finally {
      setIsUploading(false);
    }
  };

  // Load categories from YNAB API
  const handleLoadCategoriesFromApi = async () => {
    if (!costData.ynabConfig?.apiKey || !costData.ynabConfig?.selectedBudgetId) {
      alert('YNAB API configuration not found. Please setup YNAB API first.');
      return;
    }

    setIsLoadingCategories(true);
    setCategoryLoadError(null);

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
        setLastCategorySync(new Date());
        
        // Extract category names for the extracted categories list
        const categoryNames = result.categories.map((cat: YnabCategory) => `${cat.category_group_name}: ${cat.name}`);
        setExtractedCategories(categoryNames);
        
        // Show success message with sync info
        const existingCategoryNames = new Set(mappings.map(m => m.ynabCategory?.trim()));
        const unmappedCategories = categoryNames.filter((category: string) => !existingCategoryNames.has(category?.trim()));
        const alreadyMappedCount = categoryNames.length - unmappedCategories.length;
        
        alert(`Loaded ${categoryNames.length} categories from YNAB API. ${alreadyMappedCount} already mapped, ${unmappedCategories.length} unmapped categories found.\n\nIMPORTANT: Click "Save Mappings" to save these mappings before importing transactions.`);
      } else {
        throw new Error('Invalid response format from YNAB API');
      }
    } catch (error) {
      console.error('Error loading YNAB categories:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to load categories from YNAB API';
      setCategoryLoadError(errorMessage);
      alert(`Error loading categories: ${errorMessage}`);
    } finally {
      setIsLoadingCategories(false);
    }
  };

  const handleAddMapping = () => {
    if (!newMapping.ynabCategory.trim()) {
      alert('Please enter a YNAB category name');
      return;
    }

    if (newMapping.mappingType === 'country' && !newMapping.countryName.trim()) {
      alert('Please select or enter a country name');
      return;
    }

    // Find the corresponding YNAB category ID if we have API-loaded categories
    let ynabCategoryId: string | undefined;
    if (ynabCategories.length > 0) {
      const selectedCategory = ynabCategories.find(cat => 
        `${cat.category_group_name}: ${cat.name}` === newMapping.ynabCategory.trim()
      );
      ynabCategoryId = selectedCategory?.id;
    }

    const mapping: YnabCategoryMapping = {
      ynabCategory: newMapping.ynabCategory.trim(),
      ynabCategoryId: ynabCategoryId, // Include the YNAB category ID for API calls
      mappingType: newMapping.mappingType,
      countryName: newMapping.mappingType === 'country' ? newMapping.countryName.trim() : undefined
    };

    setMappings(prev => [...prev, mapping]);
    setNewMapping({
      ynabCategory: '',
      mappingType: 'none',
      countryName: ''
    });
  };

  const handleUpdateMapping = (index: number, field: keyof YnabCategoryMapping, value: string) => {
    const newMappings = [...mappings];
    if (field === 'mappingType') {
      newMappings[index].mappingType = value as 'country' | 'general' | 'none';
      if (value === 'general' || value === 'none') {
        newMappings[index].countryName = undefined;
      }
    } else if (field === 'countryName') {
      newMappings[index].countryName = value;
    } else if (field === 'ynabCategory') {
      newMappings[index].ynabCategory = value;
      
      // Update the corresponding YNAB category ID if we have API-loaded categories
      if (ynabCategories.length > 0) {
        const selectedCategory = ynabCategories.find(cat => 
          `${cat.category_group_name}: ${cat.name}` === value
        );
        newMappings[index].ynabCategoryId = selectedCategory?.id;
      }
    }
    setMappings(newMappings);
  };

  const handleDeleteMapping = (index: number) => {
    setMappings(prev => prev.filter((_, i) => i !== index));
  };

  const handleQuickMapAll = (mappingType: 'general' | 'country' | 'none', defaultCountry?: string) => {
    const unmappedCategories = extractedCategories.filter(
      cat => !mappings.some(m => m.ynabCategory === cat)
    );

    const newMappings = unmappedCategories.map(category => {
      // Find the corresponding YNAB category ID if we have API-loaded categories
      let ynabCategoryId: string | undefined;
      if (ynabCategories.length > 0) {
        const selectedCategory = ynabCategories.find(cat => 
          `${cat.category_group_name}: ${cat.name}` === category
        );
        ynabCategoryId = selectedCategory?.id;
      }

      return {
        ynabCategory: category,
        ynabCategoryId: ynabCategoryId, // Include the YNAB category ID for API calls
        mappingType: mappingType,
        countryName: mappingType === 'country' ? defaultCountry : undefined
      };
    });

    setMappings(prev => [...prev, ...newMappings]);
    alert(`Added ${newMappings.length} new mappings as ${mappingType === 'none' ? 'non-travel' : mappingType} expenses.`);
  };

  const handleSave = () => {
    onSave(mappings);
    onClose();
  };

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={onClose}
      title="YNAB Category Mappings"
      size="xl"
    >
      <p className="text-gray-600 dark:text-gray-300 mb-6">
        Configure how YNAB categories should be mapped to countries or general expenses.
        This will speed up future imports by remembering your preferences.
      </p>

      {/* File Upload */}
      <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-700 rounded-lg p-4 mb-6">
        <h3 className="text-lg font-semibold mb-3 text-blue-800 dark:text-blue-200">Extract Categories from YNAB File</h3>
        <p className="text-sm text-blue-700 dark:text-blue-300 mb-4">
          Upload your YNAB export file (.tsv or .zip) to automatically extract all categories and create mappings.
        </p>
        <div className="flex items-center gap-4">
          <input
            type="file"
            accept=".tsv,.zip"
            onChange={handleFileUpload}
            disabled={isUploading}
            className="block w-full text-sm text-gray-500 dark:text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-500 file:text-white hover:file:bg-blue-600 disabled:opacity-50 dark:file:bg-blue-700 dark:file:hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          />
          {isUploading && <span className="text-sm text-blue-600 dark:text-blue-300">Processing...</span>}
        </div>
        {extractedCategories.length > 0 && (
          <div className="mt-3 space-y-3">
            <div className="p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-700 rounded-md">
              <p className="text-sm text-green-800 dark:text-green-200 font-medium">
                ✓ Extracted {extractedCategories.length} categories from your YNAB file
              </p>
              <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                Categories: {extractedCategories.slice(0, 5).join(', ')}
                {extractedCategories.length > 5 && ` and ${extractedCategories.length - 5} more...`}
              </p>
            </div>

            {extractedCategories.filter(cat => !mappings.some(m => m.ynabCategory === cat)).length > 0 && (
              <div className="p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-100 mb-2">
                  Unmapped Categories ({extractedCategories.filter(cat => !mappings.some(m => m.ynabCategory === cat)).length}):
                </p>
                <div className="mb-3 p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded text-sm">
                  <div className="flex flex-wrap gap-1">
                    {extractedCategories
                      .filter(cat => !mappings.some(m => m.ynabCategory === cat))
                      .map(cat => (
                        <span key={cat} className="px-2 py-1 bg-yellow-200 dark:bg-yellow-700 text-yellow-800 dark:text-yellow-200 rounded text-xs">
                          {cat}
                        </span>
                      ))}
                  </div>
                </div>
                <p className="text-sm font-medium text-gray-800 dark:text-gray-100 mb-2">Quick Map All Remaining Categories:</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleQuickMapAll('none')}
                    className="px-3 py-1 bg-gray-500 text-white rounded-sm text-sm hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                  >
                    All as None
                  </button>
                  <button
                    onClick={() => handleQuickMapAll('general')}
                    className="px-3 py-1 bg-blue-500 text-white rounded-sm text-sm hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  >
                    All as General
                  </button>
                  {availableCountries.length > 0 && (
                    <AriaSelect
                      id="quick-map-country"
                      onChange={(value) => {
                        if (value) {
                          handleQuickMapAll('country', value);
                        }
                      }}
                      className="px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      options={availableCountries.map(country => ({ value: country, label: country }))}
                      placeholder="All to Country..."
                    />
                  )}
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                  {extractedCategories.filter(cat => !mappings.some(m => m.ynabCategory === cat)).length} categories remaining to map
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* YNAB API Category Loading */}
      {costData.ynabConfig?.apiKey && (
        <div className="bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-700 rounded-lg p-4 mb-6">
          <h3 className="text-lg font-semibold mb-3 text-purple-800 dark:text-purple-200">Load Categories from YNAB API</h3>
          <p className="text-sm text-purple-700 dark:text-purple-300 mb-4">
            Load categories directly from your connected YNAB budget: <strong>{costData.ynabConfig.selectedBudgetName}</strong>
          </p>
          
          <div className="flex items-center gap-4 mb-3">
            <button
              onClick={handleLoadCategoriesFromApi}
              disabled={isLoadingCategories}
              className="px-4 py-2 bg-purple-500 text-white rounded-md hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
            >
              {isLoadingCategories ? 'Loading Categories...' : 'Load from YNAB API'}
            </button>
            
            {lastCategorySync && (
              <>
                <button
                  onClick={handleLoadCategoriesFromApi}
                  disabled={isLoadingCategories}
                  className="px-3 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 text-sm"
                >
                  {isLoadingCategories ? 'Refreshing...' : 'Refresh Categories'}
                </button>
                <span className="text-sm text-purple-600 dark:text-purple-300">
                  Last sync: {lastCategorySync.toLocaleTimeString()}
                </span>
              </>
            )}
          </div>

          {categoryLoadError && (
            <div className="mb-3 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-700 rounded-md">
              <p className="text-sm text-red-800 dark:text-red-200 font-medium">
                ❌ Error loading categories
              </p>
              <p className="text-xs text-red-700 dark:text-red-300 mt-1">
                {categoryLoadError}
              </p>
            </div>
          )}

          {ynabCategories.length > 0 && (
            <div className="p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-700 rounded-md">
              <p className="text-sm text-green-800 dark:text-green-200 font-medium">
                ✓ Loaded {ynabCategories.length} categories from YNAB API
              </p>
              <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                Categories include: {ynabCategories.slice(0, 3).map(cat => `${cat.category_group_name}: ${cat.name}`).join(', ')}
                {ynabCategories.length > 3 && ` and ${ynabCategories.length - 3} more...`}
              </p>
            </div>
          )}
        </div>
      )}

      {!costData.ynabConfig?.apiKey && (
        <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4 mb-6">
          <h3 className="text-lg font-semibold mb-2 text-yellow-800 dark:text-yellow-200">YNAB API Not Configured</h3>
          <p className="text-sm text-yellow-700 dark:text-yellow-300">
            To load categories directly from YNAB, please setup your YNAB API connection first using the "Setup YNAB API" button in the cost tracker.
          </p>
        </div>
      )}

      {/* Add New Mapping */}
      <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg mb-6">
        <h3 className="text-lg font-semibold mb-4">Add New Mapping</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              YNAB Category
            </label>
            {extractedCategories.length > 0 ? (
              <div className="space-y-2">
                {(() => {
                  const unmappedCats = extractedCategories.filter(cat => !mappings.some(m => m.ynabCategory === cat));
                  console.log('DEBUG: Unmapped categories for dropdown:', unmappedCats);
                  return (
                    <AriaSelect
                      id="ynab-category-select"
                      value=""
                      onChange={(value) => setNewMapping(prev => ({ ...prev, ynabCategory: value }))}
                      options={unmappedCats.map(category => ({ value: category, label: category }))}
                      placeholder="Select from extracted categories"
                      className="focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  );
                })()}
                <input
                  type="text"
                  value={newMapping.ynabCategory}
                  onChange={(e) => setNewMapping(prev => ({ ...prev, ynabCategory: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400"
                  placeholder="Or type a custom category name"
                />
              </div>
            ) : (
              <input
                type="text"
                value={newMapping.ynabCategory}
                onChange={(e) => setNewMapping(prev => ({ ...prev, ynabCategory: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                placeholder="e.g., Travel - Transport"
              />
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Mapping Type
            </label>
            <AriaSelect
              id="mapping-type-select"
              value={newMapping.mappingType}
              onChange={(value) => setNewMapping(prev => ({
                ...prev,
                mappingType: value as 'country' | 'general' | 'none',
                countryName: value === 'general' || value === 'none' ? '' : prev.countryName
              }))}
              options={[
                { value: 'none', label: 'None (Not Travel-Related)' },
                { value: 'general', label: 'General Expenses' },
                { value: 'country', label: 'Country-Specific' }
              ]}
              placeholder="Select Mapping Type"
              className="focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {newMapping.mappingType === 'country' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Country
              </label>
              <div className="flex gap-2">
                <AriaSelect
                  id="country-select"
                  value={newMapping.countryName === '__new__' ? '__new__' : newMapping.countryName}
                  onChange={(value) => setNewMapping(prev => ({ ...prev, countryName: value }))}
                  className="flex-1 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  options={[
                    ...availableCountries.map(country => ({ value: country, label: country })),
                    { value: '__new__', label: '+ Create New Country' }
                  ]}
                  placeholder="Select Country"
                />
                {newMapping.countryName === '__new__' && (
                  <input
                    type="text"
                    placeholder="Enter country name"
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                    onBlur={(e) => {
                      if (e.target.value.trim()) {
                        setNewMapping(prev => ({ ...prev, countryName: e.target.value.trim() }));
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                        setNewMapping(prev => ({ ...prev, countryName: e.currentTarget.value.trim() }));
                      }
                    }}
                  />
                )}
              </div>
            </div>
          )}

          <div className="flex items-end">
            <button
              onClick={handleAddMapping}
              className="w-full px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Add Mapping
            </button>
          </div>
        </div>
      </div>

      {/* Existing Mappings */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Existing Mappings ({mappings.length})</h3>
        {mappings.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-center py-8">
            No mappings configured yet. Add mappings above to speed up future imports.
          </p>
        ) : (
          <div className="space-y-3">
            {mappings.map((mapping, index) => (
              <div key={index} className="flex items-center space-x-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border dark:border-gray-700">
                <div className="flex-1 min-w-0">
                  <input
                    type="text"
                    value={mapping.ynabCategory || ''}
                    onChange={(e) => handleUpdateMapping(index, 'ynabCategory', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400"
                    placeholder="Enter YNAB category name"
                  />
                  {/* DEBUG INFO
                  <div className="text-xs text-red-500 mt-1">
                    DEBUG: "{mapping.ynabCategory}" (type: {typeof mapping.ynabCategory}) (empty: {!mapping.ynabCategory})
                  </div> */}
                </div>

                <div className="min-w-[200px]">
                  <AriaSelect
                    id={`mapping-type-${index}`}
                    value={mapping.mappingType}
                    onChange={(value) => handleUpdateMapping(index, 'mappingType', value)}
                    options={[
                      { value: 'none', label: 'None (Not Travel-Related)' },
                      { value: 'general', label: 'General Expenses' },
                      { value: 'country', label: 'Country-Specific' }
                    ]}
                    placeholder="Select Mapping Type"
                    className="focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {mapping.mappingType === 'country' && (
                  <div className="flex gap-2">
                    <AriaSelect
                      id={`country-${index}`}
                      value={mapping.countryName === '__new__' ? '__new__' : (mapping.countryName || '')}
                      onChange={(value) => handleUpdateMapping(index, 'countryName', value)}
                      options={[
                        ...availableCountries.map(country => ({ value: country, label: country })),
                        { value: '__new__', label: '+ Create New Country' }
                      ]}
                      placeholder="Select Country"
                      className="focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    {mapping.countryName === '__new__' && (
                      <input
                        type="text"
                        placeholder="Enter country name"
                        className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                        onBlur={(e) => {
                          if (e.target.value.trim()) {
                            handleUpdateMapping(index, 'countryName', e.target.value.trim());
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                            handleUpdateMapping(index, 'countryName', e.currentTarget.value.trim());
                          }
                        }}
                      />
                    )}
                  </div>
                )}

                <button
                  onClick={() => handleDeleteMapping(index)}
                  className="px-3 py-2 text-red-500 hover:text-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex justify-end gap-3 mt-6 pt-4 border-t dark:border-gray-700">
        <button
          onClick={onClose}
          className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="px-6 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
        >
          Save Mappings
        </button>
      </div>
    </AccessibleModal>
  );
} 