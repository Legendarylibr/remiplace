/**
 * Pixel Routes
 */

import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authenticateToken, requireAuthorization, requireAdmin } from '../middleware/auth.js';
import { pixelLimiter } from '../middleware/rateLimit.js';
import { validatePixel } from '../middleware/validation.js';
import canvasService from '../services/canvas.js';
import { databaseAPI } from '../models/database.js';
import { broadcast } from '../websocket/index.js';
import { incrementCounter } from '../services/metrics.js';
import config from '../config/index.js';

const router = Router();

// Must be before /:x/:y to avoid being matched as coordinates
router.get('/user/:address', asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
  res.json(canvasService.getUserHistory(req.params.address.toLowerCase(), limit));
}));

router.get('/:x/:y', asyncHandler(async (req, res) => {
  const x = parseInt(req.params.x, 10), y = parseInt(req.params.y, 10);
  if (isNaN(x) || isNaN(y)) return res.status(400).json({ error: 'Invalid coordinates', code: 'INVALID_COORDINATES' });
  const pixel = canvasService.getPixel(x, y);
  res.json(pixel || { x, y, color: null, placedBy: null });
}));

router.post('/', authenticateToken, requireAuthorization, pixelLimiter, validatePixel, asyncHandler(async (req, res) => {
  const { x, y, color } = req.body;
  const result = canvasService.placePixel(x, y, color, req.user.address);
  incrementCounter('pixels_placed_total');
  broadcast('pixel', result);
  res.status(201).json(result);
}));

router.post('/batch', authenticateToken, requireAuthorization, asyncHandler(async (req, res) => {
  const { pixels } = req.body;
  if (!Array.isArray(pixels) || !pixels.length) return res.status(400).json({ error: 'Pixels array required', code: 'INVALID_REQUEST' });
  if (pixels.length > 10) return res.status(400).json({ error: 'Max 10 pixels per batch', code: 'BATCH_TOO_LARGE' });
  
  const hexColorRegex = /^#[0-9A-Fa-f]{6}$/;
  const { width, height, palette } = config.canvas;
  
  const valid = pixels
    .filter(p => p.x !== undefined && p.y !== undefined && p.color && hexColorRegex.test(p.color))
    .map(p => ({ x: parseInt(p.x, 10), y: parseInt(p.y, 10), color: p.color.toLowerCase() }))
    .filter(p => !isNaN(p.x) && !isNaN(p.y) && p.x >= 0 && p.x < width && p.y >= 0 && p.y < height)
    .filter(p => palette.includes(p.color));
  
  if (!valid.length) return res.status(400).json({ error: 'No valid pixels', code: 'INVALID_PIXELS' });
  
  canvasService.placePixelsBatch(valid, req.user.address);
  const results = valid.map(p => ({ ...p, placedBy: req.user.address }));
  broadcast('batch', results);
  res.status(201).json({ placed: results.length, pixels: results });
}));

router.delete('/:x/:y', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const x = parseInt(req.params.x, 10), y = parseInt(req.params.y, 10);
  if (isNaN(x) || isNaN(y)) return res.status(400).json({ error: 'Invalid coordinates', code: 'INVALID_COORDINATES' });
  
  databaseAPI.erasePixel(x, y, req.user.address);
  incrementCounter('pixels_erased_total');
  broadcast('pixel', { x, y, color: null, placedBy: req.user.address, erased: true });
  res.json({ success: true, x, y, erasedBy: req.user.address });
}));

export default router;
