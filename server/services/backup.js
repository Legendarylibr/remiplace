/**
 * Backup Service
 */

import { existsSync, mkdirSync, copyFileSync, readdirSync, unlinkSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { databaseAPI } from '../models/database.js';
import config from '../config/index.js';
import logger from '../utils/logger.js';

const BACKUP_DIR = process.env.BACKUP_DIR || join(dirname(config.database.path), 'backups');
const MAX_BACKUPS = parseInt(process.env.MAX_BACKUPS || '10', 10);
const INTERVAL_MS = parseInt(process.env.BACKUP_INTERVAL_MS || String(6 * 60 * 60 * 1000), 10);

let backupInterval = null;

function ensureDir() {
  if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true });
}

export function createBackup() {
  try {
    ensureDir();
    if (!existsSync(config.database.path)) return null;
    
    const filename = `canvas_backup_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.db`;
    const path = join(BACKUP_DIR, filename);
    
    copyFileSync(config.database.path, path);
    if (existsSync(config.database.path + '-wal')) copyFileSync(config.database.path + '-wal', path + '-wal');
    
    logger.info({ path }, 'Backup created');
    cleanupOld();
    return path;
  } catch (e) {
    logger.error({ err: e }, 'Backup failed');
    return null;
  }
}

export function listBackups() {
  try {
    ensureDir();
    return readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('canvas_backup_') && f.endsWith('.db'))
      .map(f => { const p = join(BACKUP_DIR, f), s = statSync(p); return { filename: f, path: p, size: s.size, created: s.mtime }; })
      .sort((a, b) => b.created - a.created);
  } catch { return []; }
}

function cleanupOld() {
  const backups = listBackups();
  if (backups.length <= MAX_BACKUPS) return;
  backups.slice(MAX_BACKUPS).forEach(b => {
    try { unlinkSync(b.path); if (existsSync(b.path + '-wal')) unlinkSync(b.path + '-wal'); } catch {}
  });
}

export function startAutoBackup() {
  if (backupInterval) return;
  logger.info({ intervalMs: INTERVAL_MS }, 'Starting auto-backup');
  createBackup();
  backupInterval = setInterval(createBackup, INTERVAL_MS);
  backupInterval.unref?.();
}

export function stopAutoBackup() {
  if (backupInterval) { clearInterval(backupInterval); backupInterval = null; }
}

export function getBackupStats() {
  const backups = listBackups();
  const total = backups.reduce((s, b) => s + b.size, 0);
  return { count: backups.length, totalSizeMB: (total / 1024 / 1024).toFixed(2), maxBackups: MAX_BACKUPS, latestBackup: backups[0] || null };
}

export default { createBackup, listBackups, startAutoBackup, stopAutoBackup, getBackupStats };
