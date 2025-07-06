import { NextRequest, NextResponse } from 'next/server';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { parseYnabFile } from '@/app/lib/ynabUtils';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!file.name.endsWith('.tsv')) {
      return NextResponse.json({ error: 'File must be a .tsv file' }, { status: 400 });
    }

    // Read file content
    const fileContent = await file.text();
    
    // Parse using shared utility
    let parseResult;
    try {
      parseResult = parseYnabFile(fileContent);
    } catch (parseError) {
      const errorMessage = parseError instanceof Error ? parseError.message : 'Failed to parse YNAB file';
      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }
    
    if (parseResult.skippedLines > 0) {
      console.log(`Processed ${parseResult.transactions.length} transactions, skipped ${parseResult.skippedLines} invalid lines`);
    }

    // Save parsed data temporarily
    const tempFilePath = join(process.cwd(), 'data', `temp-ynab-${id}-${Date.now()}.json`);
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
      tempFileId: tempFilePath.split('/').pop()?.replace('.json', '')
    });

  } catch (error) {
    console.error('Error processing YNAB upload:', error);
    return NextResponse.json({ 
      error: 'Failed to process uploaded file' 
    }, { status: 500 });
  }
} 