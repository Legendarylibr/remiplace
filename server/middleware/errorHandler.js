/**
 * Error Handling Middleware
 */

import config from '../config/index.js';
import logger from '../utils/logger.js';

export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export function notFoundHandler(req, res) {
  res.status(404).json({ error: 'Endpoint not found', code: 'NOT_FOUND', path: req.originalUrl });
}

export function errorHandler(err, req, res, _next) {
  const log = { message: err.message, code: err.code, path: req.path, method: req.method, user: req.user?.address, requestId: req.id };
  if (config.nodeEnv === 'development') log.stack = err.stack;
  
  logger.error({ ...log, err }, 'Error');
  
  if (err.isOperational) return res.status(err.statusCode).json({ error: err.message, code: err.code });
  if (err.name === 'ValidationError') return res.status(400).json({ error: err.message, code: 'VALIDATION_ERROR' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON', code: 'INVALID_JSON' });
  if (err.code?.startsWith('SQLITE_')) return res.status(500).json({ error: 'Database error', code: 'DATABASE_ERROR' });
  
  res.status(500).json({ error: config.nodeEnv === 'development' ? err.message : 'Unexpected error', code: 'INTERNAL_ERROR' });
}

export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
