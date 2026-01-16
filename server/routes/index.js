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

export default router;
