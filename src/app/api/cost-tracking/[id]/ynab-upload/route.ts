import { NextRequest, NextResponse } from 'next/server';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { parseYnabFile } from '@/app/lib/ynabUtils';
import { cleanupOldTempFiles } from '@/app/lib/ynabServerUtils';
import { isAdminDomain } from '@/app/lib/server-domains';
import JSZip from 'jszip';

// Security constants
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB limit
const MAX_EXTRACTED_SIZE = 5 * 1024 * 1024; // 5MB limit for extracted content

async function extractYnabTsvFromZip(zipFile: File): Promise<string> {
  // Security check: file size
  if (zipFile.size > MAX_FILE_SIZE) {
    throw new Error('Zip file too large. Maximum size is 10MB.');
  }

  const arrayBuffer = await zipFile.arrayBuffer();
  const zip = new JSZip();
  const zipContents = await zip.loadAsync(arrayBuffer);

  // Look for TSV files in the zip
  const tsvFiles = Object.keys(zipContents.files).filter(filename => {
    // Security check: prevent directory traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return false;
    }
    return filename.toLowerCase().endsWith('.tsv');
  });

  if (tsvFiles.length === 0) {
    throw new Error('No TSV files found in the zip archive');
  }

  // Try to find the register file first (usually contains "register" in the name)
  let targetFile = tsvFiles.find(name => 
    name.toLowerCase().includes('register') || 
    name.toLowerCase().includes('transaction')
  );

  // If no register file found, use the first TSV file
  if (!targetFile) {
    targetFile = tsvFiles[0];
  }

  // Extract and validate the content
  const fileContent = await zipContents.files[targetFile].async('string');
  
  // Security check: extracted content size
  if (fileContent.length > MAX_EXTRACTED_SIZE) {
    throw new Error('Extracted file too large. Maximum size is 5MB.');
  }

  // Basic validation: should look like a TSV file
  const lines = fileContent.split('\n');
  if (lines.length < 2) {
    throw new Error('Invalid TSV file: too few lines');
  }

  // Check if it has tab-separated headers
  const headers = lines[0].split('\t');
  if (headers.length < 3) {
    throw new Error('Invalid TSV file: insufficient columns');
  }

  return fileContent;
}

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
    const tempFilePath = join(process.cwd(), 'data', `temp-ynab-${id}-${timestamp}.json`);
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
      tempFileId: `temp-ynab-${id}-${timestamp}`
    });

  } catch (error) {
    console.error('Error processing YNAB upload:', error);
    return NextResponse.json({ 
      error: 'Failed to process uploaded file' 
    }, { status: 500 });
  }
} 