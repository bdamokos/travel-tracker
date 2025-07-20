import useSWR from 'swr';

export interface Expense {
  id: string;
  description: string;
  amount: number;
  currency: string;
  date: string;
  category: string;
  country?: string;
  notes?: string;
  isGeneralExpense?: boolean;
  expenseType?: 'actual' | 'estimate';
}

// Fetcher function
const fetcher = (url: string) => fetch(url).then(res => res.json());

// SWR hook to get all expenses for a trip
export function useExpenses(tripId: string | null) {
  const { data, error, isLoading, mutate } = useSWR(
    tripId ? `/api/cost-tracking?id=${tripId}` : null,
    fetcher
  );

  // Extract expenses from the cost data
  const expenses: Expense[] = data?.expenses || [];

  return {
    expenses,
    isLoading,
    isError: error,
    mutate
  };
}

// Helper hook to get a specific expense by ID
export function useExpense(tripId: string | null, expenseId: string) {
  const { expenses, isLoading, isError } = useExpenses(tripId);
  
  const expense = expenses.find(exp => exp.id === expenseId);
  
  return {
    expense: expense || null,
    isLoading,
    isError
  };
}