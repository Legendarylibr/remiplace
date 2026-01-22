/**
 * Routes Index
 */

import { Router } from 'express';
import authRoutes from './auth.js';
import canvasRoutes from './canvas.js';
import pixelRoutes from './pixels.js';
import { getPrometheusMetrics, getMetricsJSON } from '../services/metrics.js';
import { getBackupStats, createBackup, listBackups } from '../services/backup.js';
import { requireAdmin, authenticateToken } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import canvasService from '../services/canvas.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/canvas', canvasRoutes);
router.use('/pixels', pixelRoutes);

router.get('/metrics', (req, res) => {
  const accept = req.get('Accept') || '';
  if (accept.includes('text/plain') || !accept.includes('application/json')) {
    res.set('Content-Type', 'text/plain; charset=utf-8').send(getPrometheusMetrics());
  } else {
    res.json(getMetricsJSON());
  }
});

router.get('/metrics/json', (req, res) => res.json(getMetricsJSON()));

router.get('/admin/backups', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  res.json({
    stats: getBackupStats(),
    backups: listBackups().map(b => ({ filename: b.filename, sizeMB: (b.size / 1024 / 1024).toFixed(2), created: b.created })),
  });
}));

router.post('/admin/backups', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const path = createBackup();
  res.json(path ? { success: true, path } : { success: false, error: 'Backup failed' });
}));

// Bootstrap endpoint - only works when database is empty (safe one-time import)
router.post('/bootstrap', asyncHandler(async (req, res) => {
  const stats = canvasService.getStats();
  
  if (stats.total_pixels > 0) {
    return res.status(403).json({ 
      error: 'Canvas already has data. Bootstrap only works on empty database.',
      current_pixels: stats.total_pixels
    });
  }
  
  const { pixels } = req.body;
  if (!pixels || !Array.isArray(pixels)) {
    return res.status(400).json({ error: 'Invalid format: expected { pixels: [...] }' });
  }
  
  const result = canvasService.importCanvas(pixels);
  res.json({ success: true, ...result, message: 'Bootstrap import complete' });
}));

export default router;
