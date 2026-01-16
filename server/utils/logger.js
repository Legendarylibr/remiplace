/**
 * Logger
 */

import pino from 'pino';
import config from '../config/index.js';

const logger = pino({
  level: config.nodeEnv === 'production' ? 'info' : 'debug',
  transport: config.nodeEnv !== 'production' ? { target: 'pino-pretty', options: { colorize: true } } : undefined,
});

export function requestLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    if (req.path.startsWith('/health') || req.path === '/favicon.ico') return;
    logger.info({ method: req.method, path: req.path, status: res.statusCode, duration: Date.now() - start, ip: req.ip });
  });
  next();
}

export default logger;
