import { YnabTransaction } from '@/app/types';
import { createHash } from 'crypto';

export interface YnabParseResult {
  transactions: YnabTransaction[];
  categories: string[];
  totalLines: number;
  skippedLines: number;
}

// Helper function to create hash for transaction deduplication
export function createTransactionHash(transaction: YnabTransaction): string {
  const hashString = `${transaction.Date}|${transaction.Payee}|${transaction.Category}|${transaction.Outflow}|${transaction.Inflow}`;
  return createHash('sha256').update(hashString).digest('hex');
}

export function parseYnabFile(fileContent: string): YnabParseResult {
  const lines = fileContent.split('\n').filter(line => line.trim() !== '');
  
  if (lines.length < 2) {
    throw new Error('File appears to be empty or invalid');
  }

  // Parse header
  const headers = lines[0].split('\t').map(h => h.trim().replace(/"/g, ''));
  
  // Validate that we have at least the Category column
  if (!headers.includes('Category')) {
    throw new Error('File must contain a "Category" column');
  }

  // Find required column indices
  const columnIndices = {
    Account: headers.indexOf('Account'),
    Flag: headers.indexOf('Flag'),
    Date: headers.indexOf('Date'),
    Payee: headers.indexOf('Payee'),
    'Category Group/Category': headers.indexOf('Category Group/Category'),
    'Category Group': headers.indexOf('Category Group'),
    Category: headers.indexOf('Category'),
    Memo: headers.indexOf('Memo'),
    Outflow: headers.indexOf('Outflow'),
    Inflow: headers.indexOf('Inflow'),
    Cleared: headers.indexOf('Cleared')
  };

  const transactions: YnabTransaction[] = [];
  const categories = new Set<string>();
  let skippedLines = 0;

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split('\t').map(v => v.trim().replace(/"/g, ''));
    
    // Build transaction object using column indices (lenient parsing)
    const transaction: Record<string, string> = {};
    
    Object.entries(columnIndices).forEach(([header, index]) => {
      if (index >= 0 && index < values.length) {
        transaction[header] = values[index] || '';
      } else {
        transaction[header] = '';
      }
    });

    // Check if this is a valid expense transaction
    let outflowValue = 0;
    if (transaction.Outflow) {
      // Handle European number format: €500,00 -> 500.00
      const cleanOutflow = transaction.Outflow.replace('€', '').replace(',', '.');
      outflowValue = parseFloat(cleanOutflow) || 0;
    }
    const hasOutflow = outflowValue > 0;
    const hasBasicInfo = transaction.Date && transaction.Payee;
    
    if (hasOutflow && hasBasicInfo) {
      transactions.push(transaction as YnabTransaction);
      if (transaction.Category) {
        categories.add(transaction.Category);
      }
    } else {
      skippedLines++;
    }
  }

  return {
    transactions,
    categories: Array.from(categories).sort(),
    totalLines: lines.length - 1, // Exclude header
    skippedLines
  };
}

export function extractCategoriesFromYnabFile(fileContent: string): string[] {
  const lines = fileContent.split('\n').filter(line => line.trim() !== '');
  
  if (lines.length < 2) {
    throw new Error('File appears to be empty or invalid');
  }

  // Parse header
  const headers = lines[0].split('\t').map(h => h.trim().replace(/"/g, ''));
  
  // Validate that we have the Category column
  if (!headers.includes('Category')) {
    throw new Error('File must contain a "Category" column');
  }

  // Extract categories
  const categoryIndex = headers.indexOf('Category');
  const categories = new Set<string>();

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split('\t').map(v => v.trim().replace(/"/g, ''));
    if (values[categoryIndex] && values[categoryIndex].trim()) {
      categories.add(values[categoryIndex].trim());
    }
  }

  return Array.from(categories).sort();
}

 