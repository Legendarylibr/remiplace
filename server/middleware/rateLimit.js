/**
 * Rate Limiting Middleware
 */

import rateLimit from 'express-rate-limit';
import config from '../config/index.js';

export const generalLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: { error: 'Too many requests', code: 'RATE_LIMITED' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.address || req.ip,
});

export const pixelLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.pixelMaxRequests,
  message: { error: 'Pixel rate limit exceeded', code: 'PIXEL_RATE_LIMITED' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.address || req.ip,
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many auth attempts', code: 'AUTH_RATE_LIMITED' },
  standardHeaders: true,
  legacyHeaders: false,
});
