'use client';

import { useState, useEffect } from 'react';
import { YnabCategoryMapping, CostTrackingData } from '@/app/types';
import { extractCategoriesFromYnabFile } from '@/app/lib/ynabUtils';
import JSZip from 'jszip';

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
  costData: CostTrackingData;
  onSave: (mappings: YnabCategoryMapping[]) => void;
  onClose: () => void;
}

export default function YnabMappingManager({ costData, onSave, onClose }: YnabMappingManagerProps) {
  const [mappings, setMappings] = useState<YnabCategoryMapping[]>([]);
  const [extractedCategories, setExtractedCategories] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [newMapping, setNewMapping] = useState({
    ynabCategory: '',
    mappingType: 'none' as 'country' | 'general' | 'none',
    countryName: ''
  });

  const availableCountries = costData.countryBudgets.map(b => b.country);

  useEffect(() => {
    // Load existing mappings
    if (costData.ynabImportData?.mappings) {
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

      // Create mappings for categories that don't already exist
      const existingCategoryNames = new Set(mappings.map(m => m.ynabCategory));
      const newMappings = categoryList
        .filter(category => !existingCategoryNames.has(category))
        .map(category => ({
          ynabCategory: category,
          mappingType: 'none' as 'country' | 'general' | 'none',
          countryName: undefined
        }));

      setMappings(prev => [...prev, ...newMappings]);
      
      alert(`Extracted ${categoryList.length} categories from YNAB file. ${newMappings.length} new mappings added.`);
    } catch (error) {
      console.error('Error processing file:', error);
      alert('Error processing file. Please make sure it\'s a valid YNAB export.');
    } finally {
      setIsUploading(false);
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

    const mapping: YnabCategoryMapping = {
      ynabCategory: newMapping.ynabCategory.trim(),
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

    const newMappings = unmappedCategories.map(category => ({
      ynabCategory: category,
      mappingType: mappingType,
      countryName: mappingType === 'country' ? defaultCountry : undefined
    }));

    setMappings(prev => [...prev, ...newMappings]);
    alert(`Added ${newMappings.length} new mappings as ${mappingType === 'none' ? 'non-travel' : mappingType} expenses.`);
  };

  const handleSave = () => {
    onSave(mappings);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-800">YNAB Category Mappings</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 text-xl"
            >
              ×
            </button>
          </div>

          <p className="text-gray-600 mb-6">
            Configure how YNAB categories should be mapped to countries or general expenses. 
            This will speed up future imports by remembering your preferences.
          </p>

          {/* File Upload */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <h3 className="text-lg font-semibold mb-3 text-blue-800">Extract Categories from YNAB File</h3>
            <p className="text-sm text-blue-700 mb-4">
              Upload your YNAB export file (.tsv or .zip) to automatically extract all categories and create mappings.
            </p>
            <div className="flex items-center gap-4">
              <input
                type="file"
                accept=".tsv,.zip"
                onChange={handleFileUpload}
                disabled={isUploading}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-500 file:text-white hover:file:bg-blue-600 disabled:opacity-50"
              />
              {isUploading && <span className="text-sm text-blue-600">Processing...</span>}
            </div>
            {extractedCategories.length > 0 && (
              <div className="mt-3 space-y-3">
                <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                  <p className="text-sm text-green-800 font-medium">
                    ✓ Extracted {extractedCategories.length} categories from your YNAB file
                  </p>
                  <p className="text-xs text-green-700 mt-1">
                    Categories: {extractedCategories.slice(0, 5).join(', ')}
                    {extractedCategories.length > 5 && ` and ${extractedCategories.length - 5} more...`}
                  </p>
                </div>
                
                {extractedCategories.filter(cat => !mappings.some(m => m.ynabCategory === cat)).length > 0 && (
                  <div className="p-3 bg-gray-50 border border-gray-200 rounded-md">
                    <p className="text-sm font-medium text-gray-800 mb-2">Quick Map All Remaining Categories:</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleQuickMapAll('none')}
                        className="px-3 py-1 bg-gray-500 text-white rounded text-sm hover:bg-gray-600"
                      >
                        All as None
                      </button>
                      <button
                        onClick={() => handleQuickMapAll('general')}
                        className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
                      >
                        All as General
                      </button>
                      {availableCountries.length > 0 && (
                        <select
                          onChange={(e) => {
                            if (e.target.value) {
                              handleQuickMapAll('country', e.target.value);
                              e.target.value = '';
                            }
                          }}
                          className="px-3 py-1 text-sm border border-gray-300 rounded"
                        >
                          <option value="">All to Country...</option>
                          {availableCountries.map(country => (
                            <option key={country} value={country}>All to {country}</option>
                          ))}
                        </select>
                      )}
                    </div>
                    <p className="text-xs text-gray-600 mt-1">
                      {extractedCategories.filter(cat => !mappings.some(m => m.ynabCategory === cat)).length} categories remaining to map
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Add New Mapping */}
          <div className="bg-gray-50 p-4 rounded-lg mb-6">
            <h3 className="text-lg font-semibold mb-4">Add New Mapping</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  YNAB Category
                </label>
                {extractedCategories.length > 0 ? (
                  <div className="space-y-2">
                    <select
                      value={newMapping.ynabCategory}
                      onChange={(e) => setNewMapping(prev => ({ ...prev, ynabCategory: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select from extracted categories</option>
                      {extractedCategories
                        .filter(cat => !mappings.some(m => m.ynabCategory === cat))
                        .map(category => (
                          <option key={category} value={category}>{category}</option>
                        ))}
                    </select>
                    <input
                      type="text"
                      value={newMapping.ynabCategory}
                      onChange={(e) => setNewMapping(prev => ({ ...prev, ynabCategory: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Or type a custom category name"
                    />
                  </div>
                ) : (
                  <input
                    type="text"
                    value={newMapping.ynabCategory}
                    onChange={(e) => setNewMapping(prev => ({ ...prev, ynabCategory: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., Travel - Transport"
                  />
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Mapping Type
                </label>
                <select
                  value={newMapping.mappingType}
                  onChange={(e) => setNewMapping(prev => ({ 
                    ...prev, 
                    mappingType: e.target.value as 'country' | 'general' | 'none',
                    countryName: e.target.value === 'general' || e.target.value === 'none' ? '' : prev.countryName
                  }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="none">None (Not Travel-Related)</option>
                  <option value="general">General Expenses</option>
                  <option value="country">Country-Specific</option>
                </select>
              </div>

              {newMapping.mappingType === 'country' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Country
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={newMapping.countryName === '__new__' ? '__new__' : newMapping.countryName}
                      onChange={(e) => setNewMapping(prev => ({ ...prev, countryName: e.target.value }))}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select Country</option>
                      {availableCountries.map(country => (
                        <option key={country} value={country}>{country}</option>
                      ))}
                      <option value="__new__">+ Create New Country</option>
                    </select>
                    {newMapping.countryName === '__new__' && (
                      <input
                        type="text"
                        placeholder="Enter country name"
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  className="w-full px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
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
              <p className="text-gray-500 text-center py-8">
                No mappings configured yet. Add mappings above to speed up future imports.
              </p>
            ) : (
              <div className="space-y-3">
                {mappings.map((mapping, index) => (
                  <div key={index} className="flex items-center space-x-4 p-3 bg-gray-50 rounded-lg">
                    <div className="flex-1">
                      <input
                        type="text"
                        value={mapping.ynabCategory}
                        onChange={(e) => handleUpdateMapping(index, 'ynabCategory', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    
                    <select
                      value={mapping.mappingType}
                      onChange={(e) => handleUpdateMapping(index, 'mappingType', e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="none">None (Not Travel-Related)</option>
                      <option value="general">General Expenses</option>
                      <option value="country">Country-Specific</option>
                    </select>
                    
                    {mapping.mappingType === 'country' && (
                      <div className="flex gap-2">
                        <select
                          value={mapping.countryName === '__new__' ? '__new__' : (mapping.countryName || '')}
                          onChange={(e) => handleUpdateMapping(index, 'countryName', e.target.value)}
                          className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                      className="px-3 py-2 text-red-500 hover:text-red-700"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-6 py-2 bg-green-500 text-white rounded-md hover:bg-green-600"
            >
              Save Mappings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
} 