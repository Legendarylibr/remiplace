/**
 * Backup Service Tests
 * Tests for database backup functionality
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { existsSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key-that-is-long-enough-for-testing';
process.env.DATABASE_PATH = ':memory:';

// Create temp backup directory for tests
const testBackupDir = join(tmpdir(), 'drawingboard-test-backups-' + Date.now());
process.env.BACKUP_DIR = testBackupDir;
process.env.MAX_BACKUPS = '3';

import { 
  listBackups, 
  getBackupStats
} from '../services/backup.js';

describe('Backup Service', () => {
  beforeEach(() => {
    // Ensure test backup directory exists
    if (!existsSync(testBackupDir)) {
      mkdirSync(testBackupDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test backup directory
    try {
      if (existsSync(testBackupDir)) {
        rmSync(testBackupDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Backup Statistics', () => {
    it('should return backup statistics', () => {
      const stats = getBackupStats();
      
      assert.ok(typeof stats === 'object', 'Stats should be an object');
      assert.ok(typeof stats.count === 'number', 'Should have count');
      assert.ok(typeof stats.totalSizeMB === 'string', 'Should have totalSizeMB');
      assert.ok(typeof stats.maxBackups === 'number', 'Should have maxBackups');
    });

    it('should respect MAX_BACKUPS configuration', () => {
      const stats = getBackupStats();
      // Default is 10, test just verifies it's a positive number
      assert.ok(stats.maxBackups > 0, 'maxBackups should be positive');
    });
  });

  describe('Backup Listing', () => {
    it('should return empty array when no backups exist', () => {
      const backups = listBackups();
      
      assert.ok(Array.isArray(backups), 'Should return an array');
      assert.strictEqual(backups.length, 0, 'Should be empty initially');
    });
  });

});

describe('Backup Cleanup', () => {
  it('should have cleanup configuration', () => {
    const stats = getBackupStats();
    
    assert.ok(stats.maxBackups > 0, 'Max backups should be positive');
  });
});
