'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import { CostTrackingData, CountryPeriod } from '@/app/types';
import { ExpenseLink } from '@/app/hooks/useExpenseLinks';

interface ExportDataMenuProps {
  costData: CostTrackingData;
}

type ExportFormat = 'csv' | 'xls';

const CSV_HEADERS = [
  'Expense ID',
  'Date',
  'Amount',
  'Currency',
  'Category',
  'Country',
  'Description',
  'Notes',
  'Expense Type',
  'Is General Expense',
  'Linked Travel Items'
];

const BUDGET_HEADERS = [
  'Budget ID',
  'Country',
  'Amount',
  'Currency',
  'Notes',
  'Defined Periods'
];

function formatDateForExport(date: Date | string | undefined | null): string {
  if (!date) {
    return '';
  }
  const normalized = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(normalized.getTime())) {
    return '';
  }
  return normalized.toISOString().split('T')[0];
}

function buildPeriodSummary(periods?: CountryPeriod[]): string {
  if (!periods || periods.length === 0) {
    return '';
  }

  return periods
    .map((period) => {
      const start = formatDateForExport(period.startDate);
      const end = formatDateForExport(period.endDate);
      const notes = period.notes ? ` (${period.notes})` : '';
      if (start || end) {
        return `${start || '?' } → ${end || '?' }${notes}`;
      }
      return period.notes || '';
    })
    .filter(Boolean)
    .join('; ');
}

function escapeCsvValue(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r?\n/g, '<br/>');
}

function deriveFileSlug(costData: CostTrackingData): string {
  const source = costData.tripTitle || costData.tripId || 'cost-tracker';
  const slug = source
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'cost-tracker';
}

function formatTravelLinks(expenseId: string, links: ExpenseLink[]): string {
  const related = links.filter((link) => link.expenseId === expenseId);
  if (related.length === 0) {
    return '';
  }

  return related
    .map((link) => {
      const label = link.travelItemName || link.description || link.travelItemId;
      const type = link.travelItemType.charAt(0).toUpperCase() + link.travelItemType.slice(1);
      return `${type}: ${label}`;
    })
    .join('; ');
}

function toStringValue(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value.toString() : '';
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  return String(value);
}

function buildCsv(rows: string[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => escapeCsvValue(cell))
        .join(',')
    )
    .join('\n');
}

function buildExcelTable(title: string, rows: string[][]): string {
  const header = rows[0] || [];
  const body = rows.slice(1);

  const headerHtml = header.map((cell) => `<th>${escapeHtml(cell)}</th>`).join('');
  const bodyHtml = body
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
    .join('');

  return `
    <h2>${escapeHtml(title)}</h2>
    <table border="1" cellspacing="0" cellpadding="4">
      <thead>
        <tr>${headerHtml}</tr>
      </thead>
      <tbody>
        ${bodyHtml}
      </tbody>
    </table>
  `;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function ExportDataMenu({ costData }: ExportDataMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [cachedLinks, setCachedLinks] = useState<ExpenseLink[] | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const ensureExpenseLinks = useCallback(async () => {
    if (cachedLinks) {
      return cachedLinks;
    }

    if (!costData.tripId) {
      return [];
    }

    const response = await fetch(`/api/travel-data/${costData.tripId}/expense-links`);
    if (!response.ok) {
      throw new Error('Failed to load travel links for export');
    }

    const data = await response.json();
    if (!Array.isArray(data)) {
      return [];
    }

    setCachedLinks(data);
    return data;
  }, [cachedLinks, costData.tripId]);

  const expenseRows = useMemo(() => {
    return [
      CSV_HEADERS,
      ...costData.expenses.map((expense) => {
        return [
          toStringValue(expense.id),
          formatDateForExport(expense.date),
          toStringValue(expense.amount),
          toStringValue(expense.currency || costData.currency),
          toStringValue(expense.category),
          toStringValue(expense.isGeneralExpense ? 'General' : expense.country),
          toStringValue(expense.description),
          toStringValue(expense.notes),
          toStringValue(expense.expenseType),
          toStringValue(expense.isGeneralExpense),
          '' // travel links injected during export
        ];
      })
    ];
  }, [costData.currency, costData.expenses]);

  const budgetRows = useMemo(() => {
    return [
      BUDGET_HEADERS,
      ...costData.countryBudgets.map((budget) => [
        toStringValue(budget.id),
        toStringValue(budget.country || 'General'),
        toStringValue(budget.amount),
        toStringValue(budget.currency || costData.currency),
        toStringValue(budget.notes),
        buildPeriodSummary(budget.periods)
      ])
    ];
  }, [costData.countryBudgets, costData.currency]);

  const handleExport = useCallback(
    async (format: ExportFormat) => {
      try {
        setIsExporting(true);
        setLastError(null);

        const links = await ensureExpenseLinks();

        const enrichedExpenseRows = expenseRows.map((row, index) => {
          if (index === 0) {
            return row;
          }
          const expenseId = costData.expenses[index - 1]?.id;
          const linkSummary = expenseId ? formatTravelLinks(expenseId, links) : '';
          const nextRow = [...row];
          nextRow[nextRow.length - 1] = linkSummary;
          return nextRow;
        });

        const slug = deriveFileSlug(costData);
        const timestamp = new Date().toISOString().split('T')[0];

        if (format === 'csv') {
          const zip = new JSZip();
          zip.file(`expenses.csv`, buildCsv(enrichedExpenseRows));
          zip.file(`country-budgets.csv`, buildCsv(budgetRows));

          const blob = await zip.generateAsync({ type: 'blob' });
          downloadBlob(blob, `${slug}-cost-tracker-${timestamp}.zip`);
        } else {
          const htmlContent = `
            <html>
              <head>
                <meta charset="UTF-8" />
                <title>Cost Tracker Export</title>
              </head>
              <body>
                ${buildExcelTable('Expenses', enrichedExpenseRows)}
                <br/>
                ${buildExcelTable('Country Budgets', budgetRows)}
              </body>
            </html>
          `;
          const blob = new Blob([htmlContent], { type: 'application/vnd.ms-excel' });
          downloadBlob(blob, `${slug}-cost-tracker-${timestamp}.xls`);
        }

        setIsOpen(false);
      } catch (error) {
        console.error('Failed to export cost data', error);
        setLastError(error instanceof Error ? error.message : 'Unknown export error');
      } finally {
        setIsExporting(false);
      }
    },
    [budgetRows, costData, ensureExpenseLinks, expenseRows]
  );

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="px-4 py-2 bg-amber-500 text-white rounded-md hover:bg-amber-600 text-sm"
        disabled={isExporting}
      >
        {isExporting ? 'Preparing…' : 'Export Data'}
      </button>
      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 rounded-md border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-700 dark:bg-gray-800 z-10">
          <p className="text-sm font-medium mb-2 text-gray-700 dark:text-gray-200">
            Export includes expenses & country budgets.
          </p>
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => handleExport('csv')}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-left text-sm hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-700"
              disabled={isExporting}
            >
              Download CSV bundle (.zip)
            </button>
            <button
              type="button"
              onClick={() => handleExport('xls')}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-left text-sm hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-700"
              disabled={isExporting}
            >
              Download Excel (.xls)
            </button>
          </div>
          {lastError && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400">
              {lastError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
