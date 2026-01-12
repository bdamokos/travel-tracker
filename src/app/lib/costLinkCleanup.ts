/**
 * Cost Link Cleanup Service
 * 
 * Handles cleanup and management of cost tracking links when travel items are deleted
 */

import { Expense, TravelReference } from '@/app/types';

export interface LinkedExpense {
  id: string;
  description: string;
  amount: number;
  currency: string;
  date: string;
  costTrackerId: string;
  costTrackerTitle: string;
}

export interface CleanupResult {
  success: boolean;
  affectedExpenses: number;
  errors?: string[];
}

/**
 * Find all expenses linked to a specific travel item
 */
export async function getLinkedExpenses(
  itemType: 'location' | 'route',
  itemId: string
): Promise<LinkedExpense[]> {
  try {
    const response = await fetch('/api/cost-tracking/list');
    if (!response.ok) {
      throw new Error('Failed to fetch cost trackers');
    }
    
    const costTrackers = await response.json();
    const linkedExpenses: LinkedExpense[] = [];
    
    // Check each cost tracker for linked expenses
    for (const tracker of costTrackers) {
      try {
        const detailResponse = await fetch(`/api/cost-tracking?id=${tracker.id}`);
        if (!detailResponse.ok) continue;
        
        const costData = await detailResponse.json();
        
        // Find expenses linked to this travel item
        const matchingExpenses = costData.expenses.filter((expense: Expense) => {
          if (!expense.travelReference) return false;
          
          if (itemType === 'location' && expense.travelReference.locationId === itemId) {
            return true;
          }
          if (itemType === 'route' && expense.travelReference.routeId === itemId) {
            return true;
          }
          return false;
        });
        
        // Add to results
        matchingExpenses.forEach((expense: Expense) => {
          linkedExpenses.push({
            id: expense.id,
            description: expense.description,
            amount: expense.amount,
            currency: expense.currency,
            date: expense.date instanceof Date ? expense.date.toISOString().split('T')[0] : expense.date,
            costTrackerId: costData.id,
            costTrackerTitle: costData.tripTitle
          });
        });
      } catch (error) {
        console.warn(`Error checking cost tracker ${tracker.id}:`, error);
      }
    }
    
    return linkedExpenses;
  } catch (error) {
    console.error('Error finding linked expenses:', error);
    return [];
  }
}

/**
 * Remove all expense links to a specific travel item
 */
export async function cleanupExpenseLinks(
  itemType: 'location' | 'route',
  itemId: string
): Promise<CleanupResult> {
  try {
    const response = await fetch('/api/cost-tracking/list');
    if (!response.ok) {
      throw new Error('Failed to fetch cost trackers');
    }
    
    const costTrackers = await response.json();
    let totalAffected = 0;
    const errors: string[] = [];
    
    // Update each cost tracker
    for (const tracker of costTrackers) {
      try {
        const detailResponse = await fetch(`/api/cost-tracking?id=${tracker.id}`);
        if (!detailResponse.ok) continue;
        
        const costData = await detailResponse.json();
        let hasChanges = false;
        
        // Remove links from matching expenses
        const updatedExpenses = costData.expenses.map((expense: Expense) => {
          if (!expense.travelReference) return expense;
          
          let shouldRemoveLink = false;
          if (itemType === 'location' && expense.travelReference.locationId === itemId) {
            shouldRemoveLink = true;
          }
          if (itemType === 'route' && expense.travelReference.routeId === itemId) {
            shouldRemoveLink = true;
          }
          
          if (shouldRemoveLink) {
            hasChanges = true;
            totalAffected++;
            return { ...expense, travelReference: undefined };
          }
          
          return expense;
        });
        
        // Save changes if any were made
        if (hasChanges) {
          const updateResponse = await fetch(`/api/cost-tracking?id=${tracker.id}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              ...costData,
              expenses: updatedExpenses,
              updatedAt: new Date().toISOString()
            }),
          });
          
          if (!updateResponse.ok) {
            errors.push(`Failed to update cost tracker: ${tracker.tripTitle}`);
          }
        }
      } catch (error) {
        console.warn(`Error updating cost tracker ${tracker.id}:`, error);
        errors.push(`Error updating cost tracker: ${tracker.tripTitle}`);
      }
    }
    
    return {
      success: errors.length === 0,
      affectedExpenses: totalAffected,
      errors: errors.length > 0 ? errors : undefined
    };
  } catch (error) {
    console.error('Error cleaning up expense links:', error);
    return {
      success: false,
      affectedExpenses: 0,
      errors: ['Failed to cleanup expense links']
    };
  }
}

/**
 * Reassign expenses from one travel item to another
 */
export async function reassignExpenseLinks(
  fromItemType: 'location' | 'route',
  fromItemId: string,
  toItemType: 'location' | 'route',
  toItemId: string,
  toItemName: string
): Promise<CleanupResult> {
  try {
    const response = await fetch('/api/cost-tracking/list');
    if (!response.ok) {
      throw new Error('Failed to fetch cost trackers');
    }
    
    const costTrackers = await response.json();
    let totalAffected = 0;
    const errors: string[] = [];
    
    // Update each cost tracker
    for (const tracker of costTrackers) {
      try {
        const detailResponse = await fetch(`/api/cost-tracking?id=${tracker.id}`);
        if (!detailResponse.ok) continue;
        
        const costData = await detailResponse.json();
        let hasChanges = false;
        
        // Reassign links in matching expenses
        const updatedExpenses = costData.expenses.map((expense: Expense) => {
          if (!expense.travelReference) return expense;
          
          let shouldReassign = false;
          if (fromItemType === 'location' && expense.travelReference.locationId === fromItemId) {
            shouldReassign = true;
          }
          if (fromItemType === 'route' && expense.travelReference.routeId === fromItemId) {
            shouldReassign = true;
          }
          
          if (shouldReassign) {
            hasChanges = true;
            totalAffected++;
            
            // Create new travel reference
            const newReference: TravelReference = {
              type: toItemType,
              description: toItemName
            };
            
            if (toItemType === 'location') {
              newReference.locationId = toItemId;
            } else {
              newReference.routeId = toItemId;
            }
            
            return { ...expense, travelReference: newReference };
          }
          
          return expense;
        });
        
        // Save changes if any were made
        if (hasChanges) {
          const updateResponse = await fetch(`/api/cost-tracking?id=${tracker.id}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              ...costData,
              expenses: updatedExpenses,
              updatedAt: new Date().toISOString()
            }),
          });
          
          if (!updateResponse.ok) {
            errors.push(`Failed to update cost tracker: ${tracker.tripTitle}`);
          }
        }
      } catch (error) {
        console.warn(`Error updating cost tracker ${tracker.id}:`, error);
        errors.push(`Error updating cost tracker: ${tracker.tripTitle}`);
      }
    }
    
    return {
      success: errors.length === 0,
      affectedExpenses: totalAffected,
      errors: errors.length > 0 ? errors : undefined
    };
  } catch (error) {
    console.error('Error reassigning expense links:', error);
    return {
      success: false,
      affectedExpenses: 0,
      errors: ['Failed to reassign expense links']
    };
  }
}