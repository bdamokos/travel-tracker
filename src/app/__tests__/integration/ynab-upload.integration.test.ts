/** @jest-environment node */

import JSZip from 'jszip';
import { NextRequest } from 'next/server';
import { writeFile } from 'fs/promises';
import { POST } from '@/app/api/cost-tracking/[id]/ynab-upload/route';
import { cleanupOldTempFiles } from '@/app/lib/ynabServerUtils';
import { parseYnabFile } from '@/app/lib/ynabUtils';
import { isAdminDomain } from '@/app/lib/server-domains';

jest.mock('fs/promises', () => ({ writeFile: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/app/lib/ynabServerUtils', () => ({ cleanupOldTempFiles: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/app/lib/server-domains', () => ({ isAdminDomain: jest.fn() }));
jest.mock('@/app/lib/dataFilePaths', () => ({ getTempYnabFilePath: () => '/private/tmp/synthetic-ynab-upload.json' }));
jest.mock('@/app/lib/ynabUtils', () => {
  const actual = jest.requireActual<typeof import('@/app/lib/ynabUtils')>('@/app/lib/ynabUtils');
  return { ...actual, parseYnabFile: jest.fn(actual.parseYnabFile) };
});

const TSV = 'Account\tDate\tPayee\tCategory\tMemo\tOutflow\tInflow\nSynthetic\t27/10/2026\tCafe\tFood\tTest\t10.00\t0.00\n';

async function requestFor(content: string, zipped = true): Promise<NextRequest> {
  const form = new FormData();
  const bytes = zipped
    ? await new JSZip().file('Register.tsv', content).generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
    : new TextEncoder().encode(content);
  form.set('file', new Blob([new Uint8Array(bytes)]), zipped ? 'synthetic.zip' : 'synthetic.tsv');
  return new NextRequest('https://admin.example.test/api/cost-tracking/synthetic/ynab-upload', { method: 'POST', body: form });
}

describe('YNAB ZIP upload route with synthetic multipart input', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(isAdminDomain).mockResolvedValue(true);
  });

  it.each([true, false])('preserves successful parse and response for ZIP=%s', async zipped => {
    const response = await POST(await requestFor(TSV, zipped), { params: Promise.resolve({ id: 'synthetic' }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, transactionCount: 1, categories: ['Food'] });
    expect(parseYnabFile).toHaveBeenCalledWith(TSV);
    expect(cleanupOldTempFiles).toHaveBeenCalledTimes(1);
    expect(writeFile).toHaveBeenCalledTimes(1);
    const saved = JSON.parse(jest.mocked(writeFile).mock.calls[0][1] as string);
    expect(saved.transactions).toHaveLength(1);
    expect(saved.transactions[0].Payee).toBe('Cafe');
  });

  it('rejects actual expansion at 5MiB before parsing, cleanup or writes', async () => {
    const oversized = TSV + 'é'.repeat(Math.ceil(5 * 1024 * 1024 / 2));
    const response = await POST(await requestFor(oversized), { params: Promise.resolve({ id: 'synthetic' }) });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Extracted file too large. Maximum size is 5MB.' });
    expect(parseYnabFile).not.toHaveBeenCalled();
    expect(cleanupOldTempFiles).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('checks administrative access before reading multipart content', async () => {
    jest.mocked(isAdminDomain).mockResolvedValue(false);
    const request = await requestFor(TSV);
    const read = jest.spyOn(request, 'formData');
    const response = await POST(request, { params: Promise.resolve({ id: 'synthetic' }) });
    expect(response.status).toBe(403);
    expect(read).not.toHaveBeenCalled();
    expect(parseYnabFile).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });
});
