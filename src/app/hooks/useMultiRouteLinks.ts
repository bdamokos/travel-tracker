import { useState } from 'react';
import { TravelLinkInfo } from '@/app/lib/expenseTravelLookup';

export interface SaveLinksOptions {
  expenseId: string;
  tripId: string;
  links: TravelLinkInfo[] | TravelLinkInfo | undefined;
}

export interface SaveLinksResult {
  success: boolean;
  error?: string;
}

export interface UseMultiRouteLinksResult {
  saving: boolean;
  error: string | null;
  saveLinks: (options: SaveLinksOptions) => Promise<SaveLinksResult>;
  clearError: () => void;
}

/**
 * Hook for saving expense links (both single and multi-route)
 * Handles API communication with the expense-links endpoint
 */
export function useMultiRouteLinks(): UseMultiRouteLinksResult {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveLinks = async (options: SaveLinksOptions): Promise<SaveLinksResult> => {
    const { expenseId, tripId, links } = options;

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/travel-data/${tripId}/expense-links`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          expenseId,
          links
        }),
      });

      if (!response.ok) {
        let errorMessage = 'Failed to save expense links';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          // If response is not JSON, try to get text
          const errorText = await response.text().catch(() => '');
          if (errorText) {
            errorMessage = `${errorMessage}: ${errorText}`;
          }
        }
        throw new Error(errorMessage);
      }

      let result;
      try {
        result = await response.json();
      } catch {
        // If response is not JSON, treat as success with no message
        result = { message: 'Expense links saved successfully' };
      }

      if (process.env.NODE_ENV !== 'production') {
        console.log('Expense links saved:', result.message);
      }
      return { success: true };

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save expense links';
      setError(errorMessage);
      console.error('Error saving expense links:', err);
      return { success: false, error: errorMessage };

    } finally {
      setSaving(false);
    }
  };

  const clearError = () => setError(null);

  return {
    saving,
    error,
    saveLinks,
    clearError
  };
}
