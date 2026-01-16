/**
 * Canvas Service
 * 
 * ALL PIXELS PERSIST FOREVER - no auto-clear, users draw over existing pixels
 */

import { databaseAPI } from '../models/database.js';
import config from '../config/index.js';
import logger from '../utils/logger.js';

export function setAutoClearCallback(cb) { /* No-op: auto-clear disabled */ }
export function getTotalSlots() { return config.canvas.width * config.canvas.height; }
export function isFull() { return databaseAPI.getPixelCount() >= getTotalSlots(); }

export function getStatus() {
  const count = databaseAPI.getPixelCount();
  const total = getTotalSlots();
  const full = count >= total;
  // No auto-clear - pixels persist forever, users draw over them
  return { pixelCount: count, totalSlots: total, isFull: full, clearAt: null, timeRemaining: null };
}

export function checkAndUpdateFullnessState() {
  // No auto-clear logic - pixels persist forever
  // Users can always draw over existing pixels
  return { becameFull: false, status: getStatus() };
}

export function getCanvas() {
  const pixels = databaseAPI.getAllPixels();
  const status = getStatus();
  return { version: 1, width: config.canvas.width, height: config.canvas.height, pixelCount: pixels.length, ...status, pixels };
}

export function getCanvasBinary() {
  return { version: 1, width: config.canvas.width, height: config.canvas.height, pixelCount: databaseAPI.getPixelCount(), format: 'binary', data: databaseAPI.getCanvasBinary() };
}

export function exportCanvas() {
  return { version: 1, width: config.canvas.width, height: config.canvas.height, timestamp: new Date().toISOString(), pixels: databaseAPI.getAllPixels() };
}

export const getPixel = (x, y) => databaseAPI.getPixel(x, y);
export const placePixel = (x, y, color, addr) => { databaseAPI.placePixel(x, y, color, addr); return { x, y, color, placedBy: addr }; };
export const placePixelsBatch = (pixels, addr) => databaseAPI.placePixelsBatch(pixels, addr);

export function getStats() {
  const stats = databaseAPI.getStats();
  return { ...stats, canvasWidth: config.canvas.width, canvasHeight: config.canvas.height, totalPixelSlots: getTotalSlots(), fillPercentage: ((stats.total_pixels / getTotalSlots()) * 100).toFixed(2) };
}

export const getHistory = (limit = 100) => databaseAPI.getRecentHistory(limit);
export const getUserHistory = (addr, limit = 50) => databaseAPI.getUserHistory(addr, limit);

export function clearCanvas() {
  databaseAPI.saveSnapshot();
  databaseAPI.clearCanvas();
  return { cleared: true, timestamp: new Date().toISOString() };
}

export function importCanvas(pixels) {
  databaseAPI.saveSnapshot();
  databaseAPI.bulkImport(pixels);
  return { imported: pixels.length, timestamp: new Date().toISOString() };
}

export const getPalette = () => config.canvas.palette;
export const getConfig = () => ({ width: config.canvas.width, height: config.canvas.height, palette: config.canvas.palette, nftGatingEnabled: config.nft.enabled });

export default { getCanvas, getCanvasBinary, exportCanvas, getPixel, placePixel, placePixelsBatch, getStats, getHistory, getUserHistory, clearCanvas, importCanvas, getPalette, getConfig, getTotalSlots, isFull, getStatus, checkAndUpdateFullnessState, setAutoClearCallback };
