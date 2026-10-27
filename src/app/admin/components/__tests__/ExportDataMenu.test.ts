import { execFileSync } from 'node:child_process';
import {
  buildCsv,
  buildExcelTable,
  escapeCsvValue,
  sanitizeSpreadsheetCell,
} from '@/app/admin/components/CostTracking/ExportDataMenu';
import { parseYnabFile } from '@/app/lib/ynabUtils';

function parseCsvIndependently(csv: string): string[][] {
  const output = execFileSync('python3', ['-c', `
import csv, io, json, sys
rows = list(csv.reader(io.StringIO(sys.stdin.read(), newline=''), strict=True))
json.dump(rows, sys.stdout)
`], { input: csv, encoding: 'utf8', timeout: 5000, maxBuffer: 64 * 1024 });
  return JSON.parse(output) as string[][];
}

describe('ExportDataMenu spreadsheet escaping', () => {
  it('prefixes formula-like text cells with an apostrophe', () => {
    expect(sanitizeSpreadsheetCell('=HYPERLINK("https://evil.example")')).toBe(
      '\'=HYPERLINK("https://evil.example")'
    );
    expect(sanitizeSpreadsheetCell('+SUM(1,2)')).toBe("'+SUM(1,2)");
    expect(sanitizeSpreadsheetCell('@cmd')).toBe("'@cmd");
    expect(sanitizeSpreadsheetCell('  =cmd')).toBe("'  =cmd");
    expect(sanitizeSpreadsheetCell('\t=cmd')).toBe("'\t=cmd");
  });

  it('leaves regular values and numeric amounts intact', () => {
    expect(sanitizeSpreadsheetCell('Hotel')).toBe('Hotel');
    expect(sanitizeSpreadsheetCell('2026-05-19')).toBe('2026-05-19');
    expect(sanitizeSpreadsheetCell('123.45')).toBe('123.45');
    expect(sanitizeSpreadsheetCell('-123.45')).toBe('-123.45');
  });

  it('sanitizes CSV output before quoting values', () => {
    expect(escapeCsvValue('=1+1')).toBe("'=1+1");
    expect(escapeCsvValue('+SUM(1,2)')).toBe("\"'+SUM(1,2)\"");

    const csv = buildCsv([
      ['Description', 'Amount'],
      ['=cmd', '-12.5'],
    ]);

    expect(csv).toContain("'=cmd,-12.5");
    expect(csv).not.toContain('\n=cmd,');
  });

  it.each([
    ['Cafe\r=1+1', 'Cafe\r=1+1'],
    ['Cafe\r+1+1', 'Cafe\r+1+1'],
    ['Cafe\r-1+1', 'Cafe\r-1+1'],
    ['Cafe\r@SUM(A1)', 'Cafe\r@SUM(A1)'],
    ['Cafe\r\r=1+1', 'Cafe\r\r=1+1'],
    ['Cafe\n=1+1', 'Cafe\n=1+1'],
    ['Cafe\r\n=1+1', 'Cafe\r\n=1+1'],
    ['Cafe, "quoted"\r=1+1', 'Cafe, "quoted"\r=1+1'],
    ['=1+1', "'=1+1"],
    [' +1+1', "' +1+1"],
    ['-1+1', "'-1+1"],
    ['@SUM(A1)', "'@SUM(A1)"],
    ['\t=1+1', "'\t=1+1"],
    ['\r=1+1', "'\r=1+1"],
    ['123.45', '123.45'],
    ['-123.45', '-123.45'],
    ['-1,234.50', '-1,234.50'],
    ['', ''],
    ['Ordinary cafe', 'Ordinary cafe'],
  ])('preserves record and cell boundaries for %j', (value, expected) => {
    const csv = buildCsv([
      ['Description', 'Amount', 'Notes'],
      [value, '-12.5', value],
      ['Following expense', '123.45', 'Ordinary note'],
    ]);

    expect(parseCsvIndependently(csv)).toEqual([
      ['Description', 'Amount', 'Notes'],
      [expected, '-12.5', expected],
      ['Following expense', '123.45', 'Ordinary note'],
    ]);
    expect(parseCsvIndependently(`left,${escapeCsvValue(value)},right`)).toEqual([['left', expected, 'right']]);
  });

  it('contains internal CR from synthetic imported payee and memo within their export cells', () => {
    const parsed = parseYnabFile(
      'Account\tDate\tPayee\tCategory\tMemo\tOutflow\tInflow\n' +
      'Synthetic\t27/10/2026\tCafe\r=1+1\tFood\tReceipt\r@SUM(A1)\t10.00\t0.00\n'
    );
    expect(parsed.transactions).toHaveLength(1);
    const transaction = parsed.transactions[0];
    const csv = buildCsv([
      ['Description', 'Notes', 'Amount'],
      [transaction.Payee, transaction.Memo, transaction.Outflow],
      ['Following expense', '', '5.00'],
    ]);

    expect(parseCsvIndependently(csv)).toEqual([
      ['Description', 'Notes', 'Amount'],
      ['Cafe\r=1+1', 'Receipt\r@SUM(A1)', '10.00'],
      ['Following expense', '', '5.00'],
    ]);
  });

  it('sanitizes HTML spreadsheet table cells before escaping markup', () => {
    const html = buildExcelTable('Expenses', [
      ['Description'],
      ['=HYPERLINK("https://evil.example","open")'],
      ['<img src=x onerror=alert(1)>'],
    ]);

    expect(html).toContain('\'=HYPERLINK("https://evil.example","open")');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
});
