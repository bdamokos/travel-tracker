/**
 * Backup Service
 * 
 * Provides comprehensive backup management including metadata operations,
 * integrity verification, and backup file operations.
 */

import { readFile, writeFile, readdir, stat, access } from 'fs/promises';
import { join } from 'path';
import { createHash } from 'crypto';
import { UnifiedTripData } from './dataMigration';

const DATA_DIR = join(process.cwd(), 'data');
const BACKUP_DIR = join(DATA_DIR, 'backups');
const METADATA_FILE = join(DATA_DIR, 'backup-metadata.json');

// Interfaces for backup management
export interface BackupMetadata {
  id: string;
  originalId: string;
  type: 'trip' | 'cost';
  title: string;
  deletedAt: string;
  filePath: string;
  fileSize: number;
  checksum: string;
  deletionReason?: string;
  backupVersion: string;
}

export interface BackupMetadataStore {
  version: string;
  lastUpdated: string;
  backups: BackupMetadata[];
  storageStats: {
    totalSize: number;
    totalCount: number;
    lastCalculated: string;
  };
}

export interface BackupFilters {
  type?: 'trip' | 'cost';
  dateFrom?: string;
  dateTo?: string;
  searchQuery?: string;
}

export interface StorageStats {
  totalSize: number;
  totalCount: number;
  averageSize: number;
  oldestBackup?: string;
  newestBackup?: string;
  typeBreakdown: {
    trip: { count: number; size: number };
    cost: { count: number; size: number };
  };
}

/**
 * Core backup service for managing backup operations
 */
export class BackupService {
  private static instance: BackupService;
  private metadataCache: BackupMetadataStore | null = null;
  private readonly BACKUP_VERSION = '1.0.0';

  private constructor() {}

  static getInstance(): BackupService {
    if (!BackupService.instance) {
      BackupService.instance = new BackupService();
    }
    return BackupService.instance;
  }

  /**
   * Loads backup metadata from storage
   */
  private async loadMetadata(): Promise<BackupMetadataStore> {
    if (this.metadataCache) {
      return this.metadataCache;
    }

    try {
      await access(METADATA_FILE);
      const content = await readFile(METADATA_FILE, 'utf-8');
      const metadata = JSON.parse(content) as BackupMetadataStore;
      this.metadataCache = metadata;
      return metadata;
    } catch (error) {
      // Create initial metadata store if it doesn't exist
      const initialMetadata: BackupMetadataStore = {
        version: '1.0.0',
        lastUpdated: new Date().toISOString(),
        backups: [],
        storageStats: {
          totalSize: 0,
          totalCount: 0,
          lastCalculated: new Date().toISOString()
        }
      };
      
      await this.saveMetadata(initialMetadata);
      return initialMetadata;
    }
  }

  /**
   * Saves backup metadata to storage
   */
  private async saveMetadata(metadata: BackupMetadataStore): Promise<void> {
    metadata.lastUpdated = new Date().toISOString();
    await writeFile(METADATA_FILE, JSON.stringify(metadata, null, 2));
    this.metadataCache = metadata;
  }

  /**
   * Generates SHA-256 checksum for backup file content
   */
  private generateChecksum(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Verifies backup file integrity using checksum
   */
  async verifyBackupIntegrity(backupId: string): Promise<boolean> {
    try {
      const metadata = await this.loadMetadata();
      const backup = metadata.backups.find(b => b.id === backupId);
      
      if (!backup) {
        console.warn('Backup %s not found in metadata', backupId);
        return false;
      }

      const content = await readFile(backup.filePath, 'utf-8');
      const currentChecksum = this.generateChecksum(content);
      
      return currentChecksum === backup.checksum;
    } catch (error) {
      console.error('Failed to verify backup integrity for %s:', backupId, error);
      return false;
    }
  }

  /**
   * Adds backup metadata entry for a new backup file
   */
  async addBackupMetadata(
    originalId: string,
    type: 'trip' | 'cost',
    title: string,
    filePath: string,
    deletionReason?: string
  ): Promise<BackupMetadata> {
    try {
      // Read file to get size and generate checksum
      const content = await readFile(filePath, 'utf-8');
      const stats = await stat(filePath);
      const checksum = this.generateChecksum(content);

      const backupMetadata: BackupMetadata = {
        id: `backup-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        originalId,
        type,
        title,
        deletedAt: new Date().toISOString(),
        filePath,
        fileSize: stats.size,
        checksum,
        deletionReason,
        backupVersion: this.BACKUP_VERSION
      };

      const metadata = await this.loadMetadata();
      metadata.backups.push(backupMetadata);
      
      // Update storage stats
      metadata.storageStats.totalCount = metadata.backups.length;
      metadata.storageStats.totalSize = metadata.backups.reduce((sum, b) => sum + b.fileSize, 0);
      metadata.storageStats.lastCalculated = new Date().toISOString();

      await this.saveMetadata(metadata);
      
      return backupMetadata;
    } catch (error) {
      console.error('Failed to add backup metadata for %s:', originalId, error);
      throw new Error(`Failed to add backup metadata: ${error}`);
    }
  }

  /**
   * Lists all backups with optional filtering
   */
  async listBackups(filters?: BackupFilters): Promise<BackupMetadata[]> {
    try {
      const metadata = await this.loadMetadata();
      let backups = [...metadata.backups];

      // Apply filters
      if (filters) {
        if (filters.type) {
          backups = backups.filter(b => b.type === filters.type);
        }

        if (filters.dateFrom) {
          const fromDate = new Date(filters.dateFrom);
          backups = backups.filter(b => new Date(b.deletedAt) >= fromDate);
        }

        if (filters.dateTo) {
          const toDate = new Date(filters.dateTo);
          backups = backups.filter(b => new Date(b.deletedAt) <= toDate);
        }

        if (filters.searchQuery) {
          const query = filters.searchQuery.toLowerCase();
          backups = backups.filter(b => 
            b.title.toLowerCase().includes(query) ||
            b.originalId.toLowerCase().includes(query) ||
            (b.deletionReason && b.deletionReason.toLowerCase().includes(query))
          );
        }
      }

      // Sort by deletion date (newest first)
      return backups.sort((a, b) => 
        new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime()
      );
    } catch (error) {
      console.error('Failed to list backups:', error);
      throw new Error(`Failed to list backups: ${error}`);
    }
  }

  /**
   * Gets specific backup metadata by ID
   */
  async getBackupById(backupId: string): Promise<BackupMetadata | null> {
    try {
      const metadata = await this.loadMetadata();
      return metadata.backups.find(b => b.id === backupId) || null;
    } catch (error) {
      console.error('Failed to get backup %s:', backupId, error);
      return null;
    }
  }

  /**
   * Searches backups by text query
   */
  async searchBackups(query: string): Promise<BackupMetadata[]> {
    return this.listBackups({ searchQuery: query });
  }

  /**
   * Gets storage statistics
   */
  async getStorageStats(): Promise<StorageStats> {
    try {
      const metadata = await this.loadMetadata();
      const backups = metadata.backups;

      if (backups.length === 0) {
        return {
          totalSize: 0,
          totalCount: 0,
          averageSize: 0,
          typeBreakdown: {
            trip: { count: 0, size: 0 },
            cost: { count: 0, size: 0 }
          }
        };
      }

      const tripBackups = backups.filter(b => b.type === 'trip');
      const costBackups = backups.filter(b => b.type === 'cost');

      const sortedByDate = backups.sort((a, b) => 
        new Date(a.deletedAt).getTime() - new Date(b.deletedAt).getTime()
      );

      return {
        totalSize: metadata.storageStats.totalSize,
        totalCount: metadata.storageStats.totalCount,
        averageSize: metadata.storageStats.totalSize / metadata.storageStats.totalCount,
        oldestBackup: sortedByDate[0]?.deletedAt,
        newestBackup: sortedByDate[sortedByDate.length - 1]?.deletedAt,
        typeBreakdown: {
          trip: {
            count: tripBackups.length,
            size: tripBackups.reduce((sum, b) => sum + b.fileSize, 0)
          },
          cost: {
            count: costBackups.length,
            size: costBackups.reduce((sum, b) => sum + b.fileSize, 0)
          }
        }
      };
    } catch (error) {
      console.error('Failed to get storage stats:', error);
      throw new Error(`Failed to get storage stats: ${error}`);
    }
  }

  /**
   * Removes backup metadata entry (used when backup file is deleted)
   */
  async removeBackupMetadata(backupId: string): Promise<void> {
    try {
      const metadata = await this.loadMetadata();
      const initialCount = metadata.backups.length;
      
      metadata.backups = metadata.backups.filter(b => b.id !== backupId);
      
      if (metadata.backups.length === initialCount) {
        throw new Error(`Backup ${backupId} not found in metadata`);
      }

      // Update storage stats
      metadata.storageStats.totalCount = metadata.backups.length;
      metadata.storageStats.totalSize = metadata.backups.reduce((sum, b) => sum + b.fileSize, 0);
      metadata.storageStats.lastCalculated = new Date().toISOString();

      await this.saveMetadata(metadata);
    } catch (error) {
      console.error('Failed to remove backup metadata for %s:', backupId, error);
      throw new Error(`Failed to remove backup metadata: ${error}`);
    }
  }

  /**
   * Scans backup directory and synchronizes metadata with existing files
   */
  async synchronizeMetadata(): Promise<{ added: number; removed: number; errors: string[] }> {
    try {
      const metadata = await this.loadMetadata();
      const errors: string[] = [];
      let added = 0;
      let removed = 0;

      // Get all backup files from directory
      const files = await readdir(BACKUP_DIR);
      const backupFiles = files.filter(f => f.startsWith('deleted-') && f.endsWith('.json'));

      // Check for files not in metadata
      for (const file of backupFiles) {
        const filePath = join(BACKUP_DIR, file);
        const existsInMetadata = metadata.backups.some(b => b.filePath === filePath);

        if (!existsInMetadata) {
          try {
            // Try to extract info from filename and file content
            const content = await readFile(filePath, 'utf-8');
            const data = JSON.parse(content) as UnifiedTripData & { backupMetadata?: unknown };
            
            const originalId = data.id;
            const title = data.title || 'Unknown';
            const type = data.costData ? 'cost' : 'trip'; // Simple heuristic
            
            await this.addBackupMetadata(originalId, type, title, filePath, 'synchronized');
            added++;
          } catch (error) {
            errors.push(`Failed to process ${file}: ${error}`);
          }
        }
      }

      // Check for metadata entries without corresponding files
      const filePaths = backupFiles.map(f => join(BACKUP_DIR, f));
      const orphanedMetadata = metadata.backups.filter(b => !filePaths.includes(b.filePath));

      for (const orphaned of orphanedMetadata) {
        try {
          await this.removeBackupMetadata(orphaned.id);
          removed++;
        } catch (error) {
          errors.push(`Failed to remove orphaned metadata ${orphaned.id}: ${error}`);
        }
      }

      return { added, removed, errors };
    } catch (error) {
      console.error('Failed to synchronize metadata:', error);
      throw new Error(`Failed to synchronize metadata: ${error}`);
    }
  }

  /**
   * Clears metadata cache to force reload
   */
  clearCache(): void {
    this.metadataCache = null;
  }
}

// Export singleton instance
export const backupService = BackupService.getInstance();
