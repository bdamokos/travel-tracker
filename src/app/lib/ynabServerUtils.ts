import { readdir, stat, unlink } from 'fs/promises';
import { join } from 'path';
import { getTempYnabFilePath } from './dataFilePaths';

/**
 * Clean up temporary YNAB files older than the specified age
 * @param maxAgeHours - Maximum age in hours (default: 2 hours)
 */
export async function cleanupOldTempFiles(maxAgeHours: number = 2): Promise<void> {
  try {
    const dataDir = join(process.cwd(), 'data');
    const files = await readdir(dataDir);
    
    const tempFiles = files.filter(filename => 
      filename.startsWith('temp-ynab-') && filename.endsWith('.json')
    );

    const cutoffTime = Date.now() - (maxAgeHours * 60 * 60 * 1000);

    for (const filename of tempFiles) {
      try {
        const filePath = join(dataDir, filename);
        const stats = await stat(filePath);
        
        if (stats.mtime.getTime() < cutoffTime) {
          await unlink(filePath);
          console.log(`Cleaned up old temp file: ${filename}`);
        }
      } catch (error) {
        console.warn(`Could not process temp file ${filename}:`, error);
      }
    }
  } catch (error) {
    console.error('Error during temp file cleanup:', error);
  }
}

/**
 * Clean up a specific temporary file
 * @param tempFileId - The temporary file ID to clean up
 */
export async function cleanupTempFile(tempFileId: string): Promise<void> {
  let tempFilePath: string;
  try {
    tempFilePath = getTempYnabFilePath(tempFileId);
  } catch (error) {
    console.error('Could not delete temporary file due to invalid tempFileId:', tempFileId, error);
    return;
  }
  try {
    await unlink(tempFilePath);
    console.log('Successfully cleaned up temporary file:', tempFilePath);
  } catch (error) {
    console.error('Could not delete temporary file:', tempFilePath, error);
  }
} 
