import * as ynab from 'ynab';
import { YnabBudget, YnabCategory, YnabApiTransaction, YnabApiError } from '../types';

// YNAB API client wrapper with error handling and delta sync support
export class YnabApiClient {
  private api: ynab.API;

  constructor(accessToken: string) {
    this.api = new ynab.API(accessToken);
  }

  /**
   * Validate API key and get available budgets
   */
  async getBudgets(): Promise<YnabBudget[]> {
    try {
      const response = await this.api.budgets.getBudgets();
      return response.data.budgets.map(budget => ({
        id: budget.id,
        name: budget.name,
        last_modified_on: budget.last_modified_on || '',
        first_month: budget.first_month || '',
        last_month: budget.last_month || '',
        currency_format: {
          iso_code: budget.currency_format?.iso_code || 'USD',
          example_format: budget.currency_format?.example_format || '$123.45',
          decimal_digits: budget.currency_format?.decimal_digits || 2,
          decimal_separator: budget.currency_format?.decimal_separator || '.',
          symbol_first: budget.currency_format?.symbol_first || true,
          group_separator: budget.currency_format?.group_separator || ',',
          currency_symbol: budget.currency_format?.currency_symbol || '$',
          display_symbol: budget.currency_format?.display_symbol || true,
        }
      }));
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Get categories for a budget with delta sync support
   */
  async getCategories(budgetId: string, serverKnowledge?: number): Promise<{
    categories: YnabCategory[];
    serverKnowledge: number;
  }> {
    try {
      const response = await this.api.categories.getCategories(
        budgetId,
        serverKnowledge
      );
      
      const categories = response.data.category_groups
        .flatMap(group => 
          group.categories.map(category => ({
            id: category.id,
            category_group_id: category.category_group_id,
            category_group_name: group.name,
            name: category.name,
            hidden: category.hidden,
            original_category_group_id: category.original_category_group_id || undefined,
            note: category.note || undefined,
            budgeted: category.budgeted,
            activity: category.activity,
            balance: category.balance,
            goal_type: category.goal_type || undefined,
            goal_day: category.goal_day || undefined,
            goal_cadence: category.goal_cadence || undefined,
            goal_creation_month: category.goal_creation_month || undefined,
            goal_target: category.goal_target || undefined,
            goal_target_month: category.goal_target_month || undefined,
            goal_percentage_complete: category.goal_percentage_complete || undefined,
            goal_months_to_budget: category.goal_months_to_budget || undefined,
            goal_under_funded: category.goal_under_funded || undefined,
            goal_overall_funded: category.goal_overall_funded || undefined,
            goal_overall_left: category.goal_overall_left || undefined,
            deleted: category.deleted
          }))
        )
        .filter(category => !category.deleted && !category.hidden);

      return {
        categories,
        serverKnowledge: response.data.server_knowledge
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Get transactions for specific categories using efficient category-specific API calls
   * Uses /budgets/{budget_id}/categories/{category_id}/transactions endpoints
   */
  async getTransactionsByCategories(
    budgetId: string, 
    categoryIds: string[],
    sinceDate?: string,
    serverKnowledge?: number
  ): Promise<{
    transactions: YnabApiTransaction[];
    serverKnowledge: number;
  }> {
    try {
      if (categoryIds.length === 0) {
        return { transactions: [], serverKnowledge: serverKnowledge || 0 };
      }

      // Use category-specific endpoints with delta sync support
      // GET /budgets/{budget_id}/categories/{category_id}/transactions
      const categoryPromises = categoryIds.map(async (categoryId) => {
        try {
          const response = await this.api.transactions.getTransactionsByCategory(
            budgetId,
            categoryId,
            sinceDate,
            undefined, // type filter
            serverKnowledge
          );
          
          return {
            transactions: response.data.transactions
              .filter(txn => !txn.deleted)
              .map(txn => ({
                id: txn.id,
                date: txn.date,
                amount: txn.amount,
                memo: txn.memo || undefined,
                cleared: txn.cleared,
                approved: txn.approved,
                flag_color: txn.flag_color || undefined,
                flag_name: txn.flag_name || undefined,
                account_id: txn.account_id,
                account_name: txn.account_name || 'Unknown Account',
                payee_id: txn.payee_id || undefined,
                payee_name: txn.payee_name || undefined,
                category_id: txn.category_id || undefined,
                category_name: txn.category_name || undefined,
                transfer_account_id: txn.transfer_account_id || undefined,
                transfer_transaction_id: txn.transfer_transaction_id || undefined,
                matched_transaction_id: txn.matched_transaction_id || undefined,
                import_id: txn.import_id || undefined,
                import_payee_name: txn.import_payee_name || undefined,
                import_payee_name_original: txn.import_payee_name_original || undefined,
                debt_transaction_type: txn.debt_transaction_type || undefined,
                deleted: txn.deleted
              })),
            serverKnowledge: response.data.server_knowledge
          };
        } catch (categoryError) {
          // Log error but don't fail entire operation for one category
          console.warn('Failed to fetch transactions for category %s:', categoryId, categoryError);
          return { transactions: [], serverKnowledge: serverKnowledge || 0 };
        }
      });

      // Execute all category requests in parallel for better performance
      const categoryResults = await Promise.all(categoryPromises);
      
      // Flatten and deduplicate transactions (in case of overlaps)
      const allTransactions = categoryResults.flatMap(result => result.transactions);
      const uniqueTransactions = new Map<string, YnabApiTransaction>();
      
      allTransactions.forEach(txn => {
        uniqueTransactions.set(txn.id, txn);
      });

      // Use the highest server knowledge from all category responses
      const maxServerKnowledge = Math.max(
        ...categoryResults.map(result => result.serverKnowledge || 0),
        serverKnowledge || 0
      );

      return {
        transactions: Array.from(uniqueTransactions.values()),
        serverKnowledge: maxServerKnowledge
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Get transactions filtered by category IDs with delta sync support
   * Updated to use efficient category-specific endpoints
   */
  async getTransactions(
    budgetId: string, 
    categoryIds: string[],
    sinceDate?: string,
    serverKnowledge?: number
  ): Promise<{
    transactions: YnabApiTransaction[];
    serverKnowledge: number;
  }> {
    // Use the efficient category-specific implementation
    return this.getTransactionsByCategories(budgetId, categoryIds, sinceDate, serverKnowledge);
  }

  /**
   * Convert YNAB milliunits to currency amount
   */
  static convertMilliUnitsToCurrency(milliunits: number): number {
    return milliunits / 1000;
  }

  /**
   * Handle and normalize YNAB API errors
   */
  private handleError(error: unknown): YnabApiError {
    // YNAB SDK errors have the structure: { error: { id, name, detail } }
    if (error && typeof error === 'object' && 'error' in error) {
      const ynabError = error as { error: { id?: string; name?: string; detail?: string } };
      return {
        id: ynabError.error.id || '500',
        name: ynabError.error.name || 'api_error',
        detail: ynabError.error.detail || 'An unknown error occurred'
      };
    }
    
    // Handle generic JavaScript errors
    if (error instanceof Error) {
      return {
        id: '500',
        name: 'unknown_error',
        detail: error.message
      };
    }
    
    return {
      id: '500',
      name: 'unknown_error',
      detail: 'An unknown error occurred'
    };
  }

  /**
   * Validate API key by attempting to fetch budgets
   */
  async validateApiKey(): Promise<boolean> {
    try {
      await this.getBudgets();
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Utility functions for working with YNAB data
 */
export const ynabUtils = {
  /**
   * Convert YNAB date format to Date object
   */
  parseDate: (dateString: string): Date => {
    return new Date(dateString);
  },

  /**
   * Format Date object to YNAB date string (ISO 8601)
   */
  formatDate: (date: Date): string => {
    return date.toISOString().split('T')[0];
  },

  /**
   * Convert milliunits to display currency
   */
  milliunitsToAmount: (milliunits: number): number => {
    return YnabApiClient.convertMilliUnitsToCurrency(milliunits);
  },

  /**
   * Generate a simple hash for transaction deduplication
   */
  generateTransactionHash: (transaction: YnabApiTransaction): string => {
    const hashInput = `${transaction.date}-${transaction.amount}-${transaction.payee_name || 'no-payee'}-${transaction.memo || 'no-memo'}`;
    // Simple hash function - could be replaced with crypto.createHash if needed
    let hash = 0;
    for (let i = 0; i < hashInput.length; i++) {
      const char = hashInput.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }
};