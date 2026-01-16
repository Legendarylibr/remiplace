/**
 * Canvas Routes
 */

import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { validateCanvasImport } from '../middleware/validation.js';
import canvasService from '../services/canvas.js';

const router = Router();

router.get('/', asyncHandler(async (req, res) => {
  res.json(req.query.format === 'binary' ? canvasService.getCanvasBinary() : canvasService.getCanvas());
}));

router.get('/config', (req, res) => res.json(canvasService.getConfig()));

router.get('/export', asyncHandler(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="canvas-${Date.now()}.json"`);
  res.json(canvasService.exportCanvas());
}));

router.post('/import', authenticateToken, requireAdmin, validateCanvasImport, asyncHandler(async (req, res) => {
  res.json(canvasService.importCanvas(req.body.pixels));
}));

router.get('/stats', asyncHandler(async (req, res) => res.json(canvasService.getStats())));

router.get('/history', asyncHandler(async (req, res) => {
  res.json(canvasService.getHistory(Math.min(parseInt(req.query.limit || '100', 10), 500)));
}));

router.get('/palette', (req, res) => res.json(canvasService.getPalette()));

router.delete('/', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  res.json(canvasService.clearCanvas());
}));

export default router;
