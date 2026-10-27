import { NextRequest, NextResponse } from 'next/server';
import { writeFile } from 'fs/promises';
import { parseYnabFile } from '@/app/lib/ynabUtils';
import { cleanupOldTempFiles } from '@/app/lib/ynabServerUtils';
import { isAdminDomain } from '@/app/lib/server-domains';
import { getTempYnabFilePath } from '@/app/lib/dataFilePaths';
import { extractYnabTsvFromZip } from '@/app/lib/ynabZip';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Check if request is from admin domain
    const isAdmin = await isAdminDomain();
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    
    const { id } = await params;
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const isZipFile = file.name.toLowerCase().endsWith('.zip');
    const isTsvFile = file.name.toLowerCase().endsWith('.tsv');

    if (!isZipFile && !isTsvFile) {
      return NextResponse.json({ 
        error: 'File must be a .tsv or .zip file' 
      }, { status: 400 });
    }

    // Extract TSV content based on file type
    let tsvContent: string;
    try {
      if (isZipFile) {
        tsvContent = await extractYnabTsvFromZip(file);
      } else {
        tsvContent = await file.text();
      }
    } catch (extractError) {
      const errorMessage = extractError instanceof Error ? extractError.message : 'Failed to extract file content';
      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }

    // Parse using shared utility
    let parseResult;
    try {
      parseResult = parseYnabFile(tsvContent);
    } catch (parseError) {
      const errorMessage = parseError instanceof Error ? parseError.message : 'Failed to parse YNAB file';
      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }
    
    if (parseResult.skippedLines > 0) {
      console.log(`Processed ${parseResult.transactions.length} transactions, skipped ${parseResult.skippedLines} invalid lines`);
    }

    // Clean up old temp files before creating a new one
    await cleanupOldTempFiles(2);

    // Save parsed data temporarily
    const timestamp = Date.now();
    const tempFileId = `temp-ynab-${id}-${timestamp}`;
    let tempFilePath: string;
    try {
      tempFilePath = getTempYnabFilePath(tempFileId);
    } catch {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }
    await writeFile(tempFilePath, JSON.stringify({
      transactions: parseResult.transactions,
      categories: parseResult.categories,
      uploadedAt: new Date().toISOString(),
      originalFileName: file.name
    }));

    return NextResponse.json({
      success: true,
      transactionCount: parseResult.transactions.length,
      categories: parseResult.categories,
      tempFileId
    });

  } catch (error) {
    console.error('Error processing YNAB upload:', error);
    return NextResponse.json({ 
      error: 'Failed to process uploaded file' 
    }, { status: 500 });
  }
} 
