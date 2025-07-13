'use client';

import { CostTrackingData } from '../../../types';

interface CategoryManagerProps {
  costData: CostTrackingData;
  setCostData: React.Dispatch<React.SetStateAction<CostTrackingData>>;
  newCategory: string;
  setNewCategory: React.Dispatch<React.SetStateAction<string>>;
  editingCategoryIndex: number | null;
  setEditingCategoryIndex: React.Dispatch<React.SetStateAction<number | null>>;
  getCategories: () => string[];
  ensureCategoriesInitialized: () => void;
}

export default function CategoryManager({
  costData,
  setCostData,
  newCategory,
  setNewCategory,
  editingCategoryIndex,
  setEditingCategoryIndex,
  getCategories,
  ensureCategoriesInitialized,
}: CategoryManagerProps) {

  const addCategory = () => {
    if (!newCategory.trim()) {
      alert('Please enter a category name.');
      return;
    }

    ensureCategoriesInitialized();
    const currentCategories = getCategories();

    if (currentCategories.includes(newCategory.trim())) {
      alert('This category already exists.');
      return;
    }

    if (editingCategoryIndex !== null) {
      // Edit existing category
      const updatedCategories = [...currentCategories];
      updatedCategories[editingCategoryIndex] = newCategory.trim();
      setCostData(prev => ({ ...prev, customCategories: updatedCategories }));
      setEditingCategoryIndex(null);
    } else {
      // Add new category
      setCostData(prev => ({
        ...prev,
        customCategories: [...currentCategories, newCategory.trim()]
      }));
    }

    setNewCategory('');
  };

  const editCategory = (index: number) => {
    const currentCategories = getCategories();
    setNewCategory(currentCategories[index]);
    setEditingCategoryIndex(index);
  };

  const deleteCategory = (index: number) => {
    const currentCategories = getCategories();
    const categoryToDelete = currentCategories[index];
    
    // Check if the category is used in any expenses
    const isUsed = costData.expenses.some(expense => expense.category === categoryToDelete);
    if (isUsed) {
      alert('Cannot delete this category as it is used in existing expenses.');
      return;
    }

    const updatedCategories = currentCategories.filter((_, i) => i !== index);
    setCostData(prev => ({ ...prev, customCategories: updatedCategories }));
  };

  const cancelCategoryEdit = () => {
    setNewCategory('');
    setEditingCategoryIndex(null);
  };

  return (
    <div>
      <h3 className="text-xl font-semibold mb-4">Expense Categories</h3>
      <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-md mb-4">
        <h4 className="font-medium mb-3">Manage Categories</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {editingCategoryIndex !== null ? 'Edit Category' : 'Add New Category'}
            </label>
            <input
              type="text"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-hidden focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              placeholder="e.g., Local Transport, Souvenirs"
            />
          </div>
          <div className="flex items-end gap-2">
            <button
              onClick={addCategory}
              className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600"
            >
              {editingCategoryIndex !== null ? 'Update' : 'Add'} Category
            </button>
            {editingCategoryIndex !== null && (
              <button
                onClick={cancelCategoryEdit}
                className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600"
              >
                Cancel
              </button>
            )}
          </div>
        </div>

        {/* Category List */}
        {getCategories().length > 0 && (
          <div>
            <h5 className="font-medium mb-3">Categories ({getCategories().length})</h5>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {getCategories().map((category, index) => (
                <div key={category} className="flex justify-between items-center bg-white dark:bg-gray-800 p-3 rounded-sm border dark:border-gray-700">
                  <span className="font-medium text-sm">{category}</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => editCategory(index)}
                      className="text-blue-500 hover:text-blue-700 text-xs"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteCategory(index)}
                      className="text-red-500 hover:text-red-700 text-xs"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
