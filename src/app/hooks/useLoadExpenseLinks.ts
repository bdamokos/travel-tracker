import { useState, useEffect, useCallback } from 'react';
import { TravelLinkInfo } from '@/app/lib/expenseTravelLookup';

interface ExpenseLinkResponse {
  expenseId: string;
  travelItemId: string;
  travelItemName: string;
  travelItemType: 'location' | 'accommodation' | 'route';
  splitMode?: 'equal' | 'percentage' | 'fixed';
  splitValue?: number;
}

export interface UseLoadExpenseLinksResult {
  isLoading: boolean;
  error: string | null;
  singleLink: TravelLinkInfo | undefined;
  multiLinks: TravelLinkInfo[];
  isMultiLinkMode: boolean;
  setSingleLink: (link: TravelLinkInfo | undefined) => void;
  setMultiLinks: (links: TravelLinkInfo[]) => void;
  setIsMultiLinkMode: (isMulti: boolean) => void;
  reset: () => void;
}

/**
 * Hook for loading existing expense links from the API.
 * Handles both single-link and multi-link modes automatically based on the data.
 */
export function useLoadExpenseLinks(
  expenseId: string | undefined,
  tripId: string,
  shouldLoad: boolean = true
): UseLoadExpenseLinksResult {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [singleLink, setSingleLink] = useState<TravelLinkInfo | undefined>(undefined);
  const [multiLinks, setMultiLinks] = useState<TravelLinkInfo[]>([]);
  const [isMultiLinkMode, setIsMultiLinkMode] = useState(false);

  const reset = useCallback(() => {
    setSingleLink(undefined);
    setMultiLinks([]);
    setIsMultiLinkMode(false);
    setError(null);
  }, []);

  useEffect(() => {
    if (!shouldLoad || !expenseId || !tripId) {
      reset();
      return;
    }

    const abortController = new AbortController();
    setIsLoading(true);
    setError(null);

    const loadLinks = async () => {
      try {
        const response = await fetch(`/api/travel-data/${tripId}/expense-links`, {
          signal: abortController.signal
        });

        if (!response.ok) {
          throw new Error(`Failed to load expense links: ${response.statusText}`);
        }

        const links: ExpenseLinkResponse[] = await response.json();
        const expenseLinks = links.filter(link => link.expenseId === expenseId);

        if (expenseLinks.length > 1) {
          setIsMultiLinkMode(true);
          setSingleLink(undefined);
          setMultiLinks(expenseLinks.map(link => ({
            id: link.travelItemId,
            type: link.travelItemType,
            name: link.travelItemName,
            splitMode: link.splitMode,
            splitValue: link.splitValue
          })));
        } else if (expenseLinks.length === 1) {
          setIsMultiLinkMode(false);
          setMultiLinks([]);
          setSingleLink({
            id: expenseLinks[0].travelItemId,
            type: expenseLinks[0].travelItemType,
            name: expenseLinks[0].travelItemName,
            splitMode: expenseLinks[0].splitMode,
            splitValue: expenseLinks[0].splitValue
          });
        } else {
          reset();
        }
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          console.error('Error loading expense links:', err);
          setError(err.message);
          reset();
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadLinks();

    return () => {
      abortController.abort();
    };
  }, [expenseId, tripId, shouldLoad, reset]);

  return {
    isLoading,
    error,
    singleLink,
    multiLinks,
    isMultiLinkMode,
    setSingleLink,
    setMultiLinks,
    setIsMultiLinkMode,
    reset
  };
}
