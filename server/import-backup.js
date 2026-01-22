/**
 * One-time backup import script
 * Run via: railway run node server/import-backup.js
 */

import { readFileSync, existsSync } from 'fs';
import { databaseAPI, initDatabase } from './models/database.js';
import logger from './utils/logger.js';

const BACKUP_FILE = process.argv[2] || './canvas-backup.json';

async function importBackup() {
  if (!existsSync(BACKUP_FILE)) {
    console.error(`Backup file not found: ${BACKUP_FILE}`);
    process.exit(1);
  }

  // Initialize database first (waits for volume mount)
  await initDatabase();

  const currentCount = databaseAPI.getPixelCount();
  console.log(`Current pixels in database: ${currentCount}`);

  if (currentCount > 0) {
    console.log('Database already has pixels. Skipping import to avoid overwriting.');
    console.log('To force import, clear the canvas first or delete the database.');
    process.exit(0);
  }

  try {
    const data = JSON.parse(readFileSync(BACKUP_FILE, 'utf-8'));
    
    if (!data.pixels || !Array.isArray(data.pixels)) {
      console.error('Invalid backup format: missing pixels array');
      process.exit(1);
    }

    console.log(`Importing ${data.pixels.length} pixels from backup...`);
    console.log(`Backup timestamp: ${data.timestamp}`);
    
    databaseAPI.bulkImport(data.pixels);
    
    const newCount = databaseAPI.getPixelCount();
    console.log(`Import complete! Database now has ${newCount} pixels.`);
    
    logger.info({ imported: data.pixels.length }, 'Backup imported successfully');
  } catch (e) {
    console.error('Import failed:', e.message);
    process.exit(1);
  }
}

importBackup();
