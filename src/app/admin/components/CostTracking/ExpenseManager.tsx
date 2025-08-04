'use client';

import { CostTrackingData, Expense } from '../../../types';
import { TravelLinkInfo } from '../../../lib/expenseTravelLookup';
import ExpenseForm from '../ExpenseForm';
import InPlaceEditor from '../InPlaceEditor';
import ExpenseDisplay from '../ExpenseDisplay';
import ExpenseInlineEditor from '../ExpenseInlineEditor';
import TravelLinkDisplay from '../TravelLinkDisplay';
import { ExpenseTravelLookup } from '../../../lib/expenseTravelLookup';

interface ExpenseManagerProps {
  costData: CostTrackingData;
  setCostData: React.Dispatch<React.SetStateAction<CostTrackingData>>;
  currentExpense: Partial<Expense>;
  setCurrentExpense: React.Dispatch<React.SetStateAction<Partial<Expense>>>;
  editingExpenseIndex: number | null;
  setEditingExpenseIndex: React.Dispatch<React.SetStateAction<number | null>>;
  getCategories: () => string[];
  getExistingCountries: () => string[];
  travelLookup: ExpenseTravelLookup | null;
  onExpenseAdded: (expense: Expense, travelLinkInfo?: TravelLinkInfo) => Promise<void>;
  setHasUnsavedChanges: React.Dispatch<React.SetStateAction<boolean>>;
  tripId: string;
}

export default function ExpenseManager({
  costData,
  setCostData,
  currentExpense,
  setCurrentExpense,
  editingExpenseIndex,
  setEditingExpenseIndex,
  getCategories,
  getExistingCountries,
  travelLookup,
  onExpenseAdded,
  setHasUnsavedChanges,
  tripId,
}: ExpenseManagerProps) {

  const deleteExpense = (expenseId: string) => {
    const updatedExpenses = costData.expenses.filter(expense => expense.id !== expenseId);
    setCostData(prev => ({ ...prev, expenses: updatedExpenses }));
    setHasUnsavedChanges(true);
  };

  const convertPlannedToActual = (expenseId: string) => {
    const updatedExpenses = costData.expenses.map(expense => {
      if (expense.id === expenseId && expense.expenseType === 'planned') {
        return {
          ...expense,
          expenseType: 'actual' as const,
          originalPlannedId: expense.id // Keep reference to original planned expense
        };
      }
      return expense;
    });
    setCostData(prev => ({ ...prev, expenses: updatedExpenses }));
    setHasUnsavedChanges(true);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-semibold">Expense Tracking</h3>
      </div>
      
      <ExpenseForm
        currentExpense={currentExpense}
        setCurrentExpense={setCurrentExpense}
        onExpenseAdded={onExpenseAdded}
        editingExpenseIndex={editingExpenseIndex}
        setEditingExpenseIndex={setEditingExpenseIndex}
        currency={costData.currency}
        categories={getCategories()}
        countryOptions={getExistingCountries()}
        travelLookup={travelLookup}
        tripId={tripId}
      />

      {costData.expenses.length > 0 && (
        <div>
          <h4 className="font-medium mb-2">Expenses ({costData.expenses.length})</h4>
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {costData.expenses
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
              .map((expense) => (
              <div key={expense.id}>
                <InPlaceEditor<Expense>
                  data={expense}
                  onSave={async (updatedExpense) => {
                    const updatedExpenses = [...costData.expenses];
                    const expenseIndex = updatedExpenses.findIndex(e => e.id === expense.id);
                    if (expenseIndex !== -1) {
                      updatedExpenses[expenseIndex] = updatedExpense;
                      setCostData(prev => ({ ...prev, expenses: updatedExpenses }));
                      setHasUnsavedChanges(true);
                    }
                  }}
                  editor={(expense, onSave, onCancel) => (
                    <ExpenseInlineEditor
                      expense={expense}
                      onSave={onSave}
                      onCancel={onCancel}
                      currency={costData.currency}
                      categories={getCategories()}
                      countryOptions={getExistingCountries()}
                      travelLookup={travelLookup}
                      tripId={tripId}
                    />
                  )}
                >
                  {(expense, _isEditing, onEdit) => (
                    <div>
                      <ExpenseDisplay
                        expense={expense}
                        onEdit={onEdit}
                        onDelete={() => deleteExpense(expense.id)}
                        onMarkActual={() => convertPlannedToActual(expense.id)}
                        showMarkActual={expense.expenseType === 'planned'}
                      />
                      
                      {travelLookup && (() => {
                        const travelLink = travelLookup.getTravelLinkForExpense(expense.id);
                        if (travelLink) {
                          return (
                            <div className="mt-2">
                              <TravelLinkDisplay travelLinkInfo={travelLink} />
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  )}
                </InPlaceEditor>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}