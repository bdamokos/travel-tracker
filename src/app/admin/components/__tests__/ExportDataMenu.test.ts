import {
  buildCsv,
  buildExcelTable,
  escapeCsvValue,
  sanitizeSpreadsheetCell,
} from '@/app/admin/components/CostTracking/ExportDataMenu';

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
