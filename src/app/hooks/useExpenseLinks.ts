import useSWR from 'swr';
import useSWRMutation from 'swr/mutation';

export interface ExpenseLink {
  expenseId: string;
  travelItemId: string;
  travelItemName: string;
  travelItemType: 'location' | 'accommodation' | 'route';
  description?: string;
}

interface LinkExpenseRequest {
  tripId: string;
  expenseId: string;
  travelItemId: string;
  travelItemType: 'location' | 'accommodation' | 'route';
  description?: string;
}

interface UnlinkExpenseRequest {
  tripId: string;
  expenseId: string;
  travelItemId: string;
}

interface MoveExpenseRequest {
  tripId: string;
  expenseId: string;
  fromTravelItemId: string;
  toTravelItemId: string;
  toTravelItemType: 'location' | 'accommodation' | 'route';
  description?: string;
}

interface LinkExpenseResponse {
  success: boolean;
  error?: 'DUPLICATE_LINK' | 'EXPENSE_NOT_FOUND' | 'TRAVEL_ITEM_NOT_FOUND' | 'VALIDATION_ERROR';
  existingLink?: {
    travelItemId: string;
    travelItemName: string;
    travelItemType: string;
  };
}

// Fetcher function
const fetcher = (url: string) => fetch(url).then(res => res.json());

// SWR hook to get all expense links for a trip
export function useExpenseLinks(tripId: string | null) {
  const { data, error, isLoading, mutate } = useSWR<ExpenseLink[]>(
    tripId ? `/api/travel-data/${tripId}/expense-links` : null,
    fetcher
  );

  return {
    expenseLinks: data || [],
    isLoading,
    isError: error,
    mutate
  };
}

// SWR mutation hook to link an expense
async function linkExpenseMutation(_url: string, { arg }: { arg: LinkExpenseRequest }): Promise<LinkExpenseResponse> {
  const response = await fetch('/api/travel-data/expense-links', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(arg),
  });

  const result = await response.json();
  
  if (!response.ok) {
    const error = new Error(result.error || 'Failed to link expense') as Error & { status: number; info: unknown };
    error.status = response.status;
    error.info = result;
    throw error;
  }

  return result;
}

export function useLinkExpense() {
  return useSWRMutation('/api/travel-data/expense-links', linkExpenseMutation);
}

// SWR mutation hook to unlink an expense
async function unlinkExpenseMutation(_url: string, { arg }: { arg: UnlinkExpenseRequest }) {
  const response = await fetch('/api/travel-data/expense-links', {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(arg),
  });

  if (!response.ok) {
    const result = await response.json();
    const error = new Error(result.error || 'Failed to unlink expense') as Error & { status: number; info: unknown };
    error.status = response.status;
    error.info = result;
    throw error;
  }

  return response.json();
}

export function useUnlinkExpense() {
  return useSWRMutation('/api/travel-data/expense-links', unlinkExpenseMutation);
}

// SWR mutation hook to move an expense link
async function moveExpenseMutation(_url: string, { arg }: { arg: MoveExpenseRequest }) {
  const response = await fetch('/api/travel-data/expense-links/move', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(arg),
  });

  if (!response.ok) {
    const result = await response.json();
    const error = new Error(result.error || 'Failed to move expense link') as Error & { status: number; info: unknown };
    error.status = response.status;
    error.info = result;
    throw error;
  }

  return response.json();
}

export function useMoveExpenseLink() {
  return useSWRMutation('/api/travel-data/expense-links/move', moveExpenseMutation);
}

// Helper hook to get links for a specific travel item
export function useExpenseLinksForTravelItem(tripId: string | null, travelItemId: string) {
  const { expenseLinks, isLoading, isError, mutate } = useExpenseLinks(tripId);
  
  const travelItemLinks = expenseLinks.filter(link => link.travelItemId === travelItemId);
  
  return {
    expenseLinks: travelItemLinks,
    isLoading,
    isError,
    mutate
  };
}

// Helper hook to check if an expense is linked to any travel item
export function useExpenseLinkStatus(tripId: string | null, expenseId: string) {
  const { expenseLinks, isLoading, isError } = useExpenseLinks(tripId);
  
  const existingLink = expenseLinks.find(link => link.expenseId === expenseId);
  
  return {
    isLinked: !!existingLink,
    existingLink: existingLink || null,
    isLoading,
    isError
  };
}