/**
 * Database Module - SQLite with in-memory cache
 */

import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';
import config from '../config/index.js';
import logger from '../utils/logger.js';

const dbDir = dirname(config.database.path);
if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });

const db = new Database(config.database.path);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = -64000');

// In-memory cache
const cache = { pixels: new Map(), count: 0, initialized: false };
const statsCache = { data: null, ts: 0, ttl: 5000 };

// Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS pixels (x INTEGER NOT NULL, y INTEGER NOT NULL, color TEXT NOT NULL, placed_by TEXT, placed_at TEXT DEFAULT (datetime('now')), PRIMARY KEY (x, y));
  CREATE TABLE IF NOT EXISTS pixel_history (id INTEGER PRIMARY KEY AUTOINCREMENT, x INTEGER NOT NULL, y INTEGER NOT NULL, color TEXT NOT NULL, placed_by TEXT, placed_at TEXT DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS users (address TEXT PRIMARY KEY, first_seen TEXT DEFAULT (datetime('now')), last_seen TEXT DEFAULT (datetime('now')), pixel_count INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS canvas_snapshots (id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')));
  CREATE INDEX IF NOT EXISTS idx_history_at ON pixel_history(placed_at DESC);
  CREATE INDEX IF NOT EXISTS idx_history_by ON pixel_history(placed_by);
`);

// Init cache
(function initCache() {
  if (cache.initialized) return;
  const rows = db.prepare('SELECT x, y, color, placed_by, placed_at FROM pixels').all();
  rows.forEach(p => cache.pixels.set(`${p.x},${p.y}`, p));
  cache.count = rows.length;
  cache.initialized = true;
  logger.info({ pixels: rows.length }, 'Cache initialized');
})();

// Prepared statements
const stmt = {
  setPixel: db.prepare(`INSERT INTO pixels (x, y, color, placed_by, placed_at) VALUES (?, ?, ?, ?, datetime('now')) ON CONFLICT(x, y) DO UPDATE SET color = excluded.color, placed_by = excluded.placed_by, placed_at = excluded.placed_at`),
  deletePixel: db.prepare('DELETE FROM pixels WHERE x = ? AND y = ?'),
  addHistory: db.prepare('INSERT INTO pixel_history (x, y, color, placed_by) VALUES (?, ?, ?, ?)'),
  getHistory: db.prepare('SELECT x, y, color, placed_by, placed_at FROM pixel_history ORDER BY id DESC LIMIT ?'),
  getUserHistory: db.prepare('SELECT x, y, color, placed_at FROM pixel_history WHERE placed_by = ? ORDER BY id DESC LIMIT ?'),
  upsertUser: db.prepare(`INSERT INTO users (address) VALUES (?) ON CONFLICT(address) DO UPDATE SET last_seen = datetime('now')`),
  incUserPixels: db.prepare('UPDATE users SET pixel_count = pixel_count + 1 WHERE address = ?'),
  getUser: db.prepare('SELECT * FROM users WHERE address = ?'),
  getStats: db.prepare('SELECT (SELECT COUNT(*) FROM users) as total_users'),
  getHistoryCount: db.prepare('SELECT COUNT(*) as count FROM pixel_history'),
  clearCanvas: db.prepare('DELETE FROM pixels'),
  saveSnapshot: db.prepare('INSERT INTO canvas_snapshots (data) VALUES (?)'),
  pruneHistory: db.prepare('DELETE FROM pixel_history WHERE id <= (SELECT id FROM pixel_history ORDER BY id DESC LIMIT 1 OFFSET ?)'),
};

// History pruning configuration
const HISTORY_MAX_ENTRIES = 100000;
const PRUNE_CHECK_INTERVAL = 500; // Check every N placements
let placementsSincePrune = 0;

function maybePruneHistory() {
  placementsSincePrune++;
  if (placementsSincePrune < PRUNE_CHECK_INTERVAL) return;
  placementsSincePrune = 0;
  
  const { count } = stmt.getHistoryCount.get();
  if (count > HISTORY_MAX_ENTRIES) {
    const result = stmt.pruneHistory.run(HISTORY_MAX_ENTRIES);
    if (result.changes > 0) {
      logger.info({ deleted: result.changes, remaining: HISTORY_MAX_ENTRIES }, 'Pruned pixel history');
    }
  }
}

const placePixelTx = db.transaction((x, y, color, addr) => {
  stmt.setPixel.run(x, y, color, addr);
  stmt.addHistory.run(x, y, color, addr);
  if (addr) { stmt.upsertUser.run(addr); stmt.incUserPixels.run(addr); }
  
  const key = `${x},${y}`;
  if (!cache.pixels.has(key)) cache.count++;
  cache.pixels.set(key, { x, y, color, placed_by: addr, placed_at: new Date().toISOString() });
  statsCache.data = null;
  maybePruneHistory();
});

const placeBatchTx = db.transaction((pixels, addr) => {
  let newCount = 0;
  for (const { x, y, color } of pixels) {
    stmt.setPixel.run(x, y, color, addr);
    stmt.addHistory.run(x, y, color, addr);
    const key = `${x},${y}`;
    if (!cache.pixels.has(key)) newCount++;
    cache.pixels.set(key, { x, y, color, placed_by: addr, placed_at: new Date().toISOString() });
  }
  if (addr) { stmt.upsertUser.run(addr); db.prepare('UPDATE users SET pixel_count = pixel_count + ? WHERE address = ?').run(pixels.length, addr); }
  cache.count += newCount;
  statsCache.data = null;
  maybePruneHistory();
});

const eraseTx = db.transaction((x, y, admin) => {
  stmt.deletePixel.run(x, y);
  stmt.addHistory.run(x, y, 'ERASED', admin);
  const key = `${x},${y}`;
  if (cache.pixels.has(key)) { cache.pixels.delete(key); cache.count--; }
  statsCache.data = null;
});

export const databaseAPI = {
  getPixel: (x, y) => cache.pixels.get(`${x},${y}`) || null,
  getAllPixels: () => Array.from(cache.pixels.values()).map(p => ({ x: p.x, y: p.y, color: p.color })),
  
  getCanvasBinary() {
    const pixels = Array.from(cache.pixels.values());
    const buf = Buffer.alloc(pixels.length * 7);
    let off = 0;
    for (const p of pixels) {
      buf.writeUInt16LE(p.x, off);
      buf.writeUInt16LE(p.y, off + 2);
      const hex = p.color.replace('#', '');
      buf.writeUInt8(parseInt(hex.slice(0, 2), 16), off + 4);
      buf.writeUInt8(parseInt(hex.slice(2, 4), 16), off + 5);
      buf.writeUInt8(parseInt(hex.slice(4, 6), 16), off + 6);
      off += 7;
    }
    return buf.toString('base64');
  },
  
  placePixel: (x, y, color, addr) => placePixelTx(x, y, color, addr),
  placePixelsBatch: (pixels, addr) => { if (pixels?.length) placeBatchTx(pixels, addr); },
  erasePixel: (x, y, admin) => eraseTx(x, y, admin),
  
  getRecentHistory: (limit) => stmt.getHistory.all(limit),
  getUserHistory: (addr, limit) => stmt.getUserHistory.all(addr, limit),
  
  getUser(addr) { stmt.upsertUser.run(addr); return stmt.getUser.get(addr); },
  
  getStats() {
    if (statsCache.data && Date.now() - statsCache.ts < statsCache.ttl) return statsCache.data;
    const s = stmt.getStats.get();
    const h = stmt.getHistoryCount.get();
    statsCache.data = { total_pixels: cache.count, total_users: s.total_users, total_placements: h.count };
    statsCache.ts = Date.now();
    return statsCache.data;
  },
  
  getPixelCount: () => cache.count,
  
  clearCanvas() { stmt.clearCanvas.run(); cache.pixels.clear(); cache.count = 0; statsCache.data = null; },
  
  saveSnapshot() {
    const data = JSON.stringify({ version: 1, width: config.canvas.width, height: config.canvas.height, timestamp: new Date().toISOString(), pixels: this.getAllPixels() });
    stmt.saveSnapshot.run(data);
  },
  
  bulkImport(pixels) {
    const tx = db.transaction((list) => {
      for (const p of list) {
        stmt.setPixel.run(p.x, p.y, p.color, null);
        const key = `${p.x},${p.y}`;
        if (!cache.pixels.has(key)) cache.count++;
        cache.pixels.set(key, { x: p.x, y: p.y, color: p.color, placed_by: null, placed_at: new Date().toISOString() });
      }
    });
    tx(pixels);
    statsCache.data = null;
  },
};

export function closeDatabase() {
  try { db.pragma('wal_checkpoint(TRUNCATE)'); db.close(); logger.info('Database closed'); return true; }
  catch (e) { logger.error({ err: e }, 'Close error'); return false; }
}

export default db;
