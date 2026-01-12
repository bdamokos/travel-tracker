/**
 * Integration tests for BackupService
 * 
 * These tests work with the actual backup system and existing backup files
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { BackupService, BackupMetadata, BackupMetadataStore } from '@/app/lib/backupService';
import { join } from 'path';
import { writeFile, mkdir, access, readFile, unlink } from 'fs/promises';

describe('BackupService Integration Tests', () => {
  let backupService: BackupService;

  beforeEach(() => {
    backupService = BackupService.getInstance();
    backupService.clearCache();
  });

  describe('Basic Functionality', () => {
    it('should create a BackupService instance', () => {
      expect(backupService).toBeDefined();
      expect(backupService).toBeInstanceOf(BackupService);
    });

    it('should return singleton instance', () => {
      const instance1 = BackupService.getInstance();
      const instance2 = BackupService.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should clear cache without errors', () => {
      backupService.clearCache();
      expect(true).toBe(true); // No error should be thrown
    });
  });

  describe('Metadata Operations', () => {
    it('should load or create metadata store', async () => {
      const backups = await backupService.listBackups();
      expect(Array.isArray(backups)).toBe(true);
    });

    it('should get storage statistics', async () => {
      const stats = await backupService.getStorageStats();
      
      expect(stats).toBeDefined();
      expect(typeof stats.totalSize).toBe('number');
      expect(typeof stats.totalCount).toBe('number');
      expect(typeof stats.averageSize).toBe('number');
      expect(stats.typeBreakdown).toBeDefined();
      expect(stats.typeBreakdown.trip).toBeDefined();
      expect(stats.typeBreakdown.cost).toBeDefined();
    });

    it('should synchronize metadata with existing files', async () => {
      const result = await backupService.synchronizeMetadata();
      
      expect(result).toBeDefined();
      expect(typeof result.added).toBe('number');
      expect(typeof result.removed).toBe('number');
      expect(Array.isArray(result.errors)).toBe(true);
    });
  });

  describe('Backup Filtering and Search', () => {
    it('should list all backups', async () => {
      const backups = await backupService.listBackups();
      expect(Array.isArray(backups)).toBe(true);
      
      // Each backup should have required properties
      backups.forEach(backup => {
        expect(backup.id).toBeDefined();
        expect(backup.originalId).toBeDefined();
        expect(backup.type).toMatch(/^(trip|cost)$/);
        expect(backup.title).toBeDefined();
        expect(backup.deletedAt).toBeDefined();
        expect(backup.filePath).toBeDefined();
        expect(typeof backup.fileSize).toBe('number');
        expect(backup.checksum).toBeDefined();
        expect(backup.backupVersion).toBeDefined();
      });
    });

    it('should filter backups by type', async () => {
      const tripBackups = await backupService.listBackups({ type: 'trip' });
      const costBackups = await backupService.listBackups({ type: 'cost' });
      
      expect(Array.isArray(tripBackups)).toBe(true);
      expect(Array.isArray(costBackups)).toBe(true);
      
      tripBackups.forEach(backup => {
        expect(backup.type).toBe('trip');
      });
      
      costBackups.forEach(backup => {
        expect(backup.type).toBe('cost');
      });
    });

    it('should search backups by query', async () => {
      const allBackups = await backupService.listBackups();
      
      if (allBackups.length > 0) {
        // Use the first backup's title for search
        const firstBackup = allBackups[0];
        const searchTerm = firstBackup.title.split(' ')[0].toLowerCase();
        
        const searchResults = await backupService.searchBackups(searchTerm);
        expect(Array.isArray(searchResults)).toBe(true);
        
        // Should find at least the backup we searched for
        const foundBackup = searchResults.find(b => b.id === firstBackup.id);
        expect(foundBackup).toBeDefined();
      }
    });

    it('should return empty results for non-matching queries', async () => {
      const results = await backupService.searchBackups('nonexistent-search-term-12345');
      expect(results).toHaveLength(0);
    });

    it('should filter backups by date range', async () => {
      const allBackups = await backupService.listBackups();
      
      if (allBackups.length > 0) {
        // Get date range from existing backups
        const dates = allBackups.map(b => new Date(b.deletedAt));
        const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
        const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
        
        // Filter with a range that should include some backups
        const filteredBackups = await backupService.listBackups({
          dateFrom: minDate.toISOString(),
          dateTo: maxDate.toISOString()
        });
        
        expect(Array.isArray(filteredBackups)).toBe(true);
        expect(filteredBackups.length).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Backup Retrieval', () => {
    it('should get backup by ID', async () => {
      const allBackups = await backupService.listBackups();
      
      if (allBackups.length > 0) {
        const firstBackup = allBackups[0];
        const retrievedBackup = await backupService.getBackupById(firstBackup.id);
        
        expect(retrievedBackup).not.toBeNull();
        expect(retrievedBackup!.id).toBe(firstBackup.id);
        expect(retrievedBackup!.originalId).toBe(firstBackup.originalId);
        expect(retrievedBackup!.title).toBe(firstBackup.title);
      }
    });

    it('should return null for non-existent backup ID', async () => {
      const backup = await backupService.getBackupById('non-existent-backup-id-12345');
      expect(backup).toBeNull();
    });
  });

  describe('Integrity Verification', () => {
    it('should verify backup integrity for existing backups', async () => {
      const allBackups = await backupService.listBackups();
      
      if (allBackups.length > 0) {
        const firstBackup = allBackups[0];
        
        // Try to verify integrity - should not throw error
        const isValid = await backupService.verifyBackupIntegrity(firstBackup.id);
        expect(typeof isValid).toBe('boolean');
      }
    });

    it('should return false for non-existent backup integrity check', async () => {
      const isValid = await backupService.verifyBackupIntegrity('non-existent-backup-id-12345');
      expect(isValid).toBe(false);
    });
  });

  describe('Metadata Management', () => {
    it('should handle metadata operations without errors', async () => {
      // Test that basic metadata operations work
      const stats = await backupService.getStorageStats();
      expect(stats).toBeDefined();
      
      const backups = await backupService.listBackups();
      expect(Array.isArray(backups)).toBe(true);
      
      // Test cache clearing
      backupService.clearCache();
      
      // Should still work after cache clear
      const backupsAfterClear = await backupService.listBackups();
      expect(Array.isArray(backupsAfterClear)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid backup IDs gracefully', async () => {
      const backup = await backupService.getBackupById('');
      expect(backup).toBeNull();
      
      const backup2 = await backupService.getBackupById('invalid-id');
      expect(backup2).toBeNull();
    });

    it('should handle empty search queries', async () => {
      const results = await backupService.searchBackups('');
      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle invalid filter parameters', async () => {
      const results = await backupService.listBackups({
        dateFrom: 'invalid-date',
        dateTo: 'invalid-date'
      });
      expect(Array.isArray(results)).toBe(true);
    });
  });
});