/**
 * Auth Routes
 */

import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authenticateToken } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';
import authService from '../services/auth.js';
import { incrementCounter } from '../services/metrics.js';
import config from '../config/index.js';

const router = Router();

router.post('/connect', authLimiter, asyncHandler(async (req, res) => {
  const { address, chainId } = req.body;
  
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    incrementCounter('auth_failure_total');
    return res.status(400).json({ error: 'Invalid address', code: 'INVALID_ADDRESS' });
  }
  
  try {
    const result = await authService.authenticate(address, chainId || 1);
    incrementCounter('auth_success_total');
    res.json(result);
  } catch (e) {
    incrementCounter('auth_failure_total');
    res.status(401).json({ error: e.message || 'Auth failed', code: 'AUTH_FAILED' });
  }
}));

router.post('/refresh', authenticateToken, asyncHandler(async (req, res) => {
  const result = await authService.refreshAuthorization(req.user.address, req.body.chainId || req.user.chainId);
  res.json(result);
}));

router.get('/profile', authenticateToken, asyncHandler(async (req, res) => {
  res.json(authService.getUserProfile(req.user.address));
}));

router.get('/verify', authenticateToken, (req, res) => {
  res.json({
    valid: true,
    address: req.user.address,
    isAuthorized: req.user.isAuthorized,
    isAdmin: config.adminWallets.includes(req.user.address.toLowerCase()),
  });
});

export default router;
