/**
 * (r) EMI / Place Server
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { randomUUID, randomBytes } from 'crypto';

import config from './config/index.js';
import routes from './routes/index.js';
import { generalLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { initWebSocket, getClientCount, closeAll as closeWebSockets } from './websocket/index.js';
import { closeDatabase, databaseAPI } from './models/database.js';
import logger, { requestLogger } from './utils/logger.js';
import { metricsMiddleware } from './services/metrics.js';
import { startAutoBackup, stopAutoBackup } from './services/backup.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const server = createServer(app);
const startTime = Date.now();

if (config.nodeEnv === 'production') app.set('trust proxy', 1);

// Health endpoints
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));
app.get('/health/ready', (req, res) => res.json({ status: 'ready', timestamp: new Date().toISOString() }));
app.get('/health/detailed', (req, res) => {
  const uptime = Date.now() - startTime;
  const mem = process.memoryUsage();
  res.json({
    status: 'ok',
    uptime: { ms: uptime, human: formatUptime(uptime) },
    memory: { heapUsed: Math.round(mem.heapUsed / 1024 / 1024) + 'MB', heapTotal: Math.round(mem.heapTotal / 1024 / 1024) + 'MB' },
    connections: { websocket: getClientCount() },
    canvas: { pixelCount: databaseAPI.getPixelCount() },
    timestamp: new Date().toISOString(),
  });
});

function formatUptime(ms) {
  const s = Math.floor(ms / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

// Middleware
app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || randomUUID();
  res.setHeader('X-Request-ID', req.id);
  res.locals.cspNonce = randomBytes(16).toString('base64');
  next();
});

app.use(metricsMiddleware);
app.use(compression({ level: 6 }));

app.use(helmet({
  contentSecurityPolicy: config.nodeEnv === 'production' ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", (req, res) => `'nonce-${res.locals.cspNonce}'`, "https://cdnjs.cloudflare.com", "https://unpkg.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "wss:", "ws:", "https://eth.llamarpc.com", "https://mainnet.base.org", "https://*.alchemy.com"],
      objectSrc: ["'none'"],
    },
  } : false,
  crossOriginEmbedderPolicy: false,
}));

app.use(cors(config.cors));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/api', generalLimiter);
app.use(requestLogger);
app.use('/api', routes);

app.use(express.static(join(__dirname, '..'), {
  maxAge: config.nodeEnv === 'production' ? '1d' : 0,
  etag: true,
  setHeaders: (res, path) => {
    if (path.endsWith('.html') || path.endsWith('.css')) res.setHeader('Cache-Control', 'no-cache');
  },
}));

app.get('/', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(join(__dirname, '..', 'index.html'));
});

app.use('/api', notFoundHandler);
app.use(errorHandler);

async function start() {
  await initWebSocket(server);
  if (config.nodeEnv === 'production') startAutoBackup();
  
  server.listen(config.port, () => {
    logger.info({ port: config.port, env: config.nodeEnv, canvas: `${config.canvas.width}×${config.canvas.height}` }, 'Server started');
    if (config.nodeEnv === 'development') {
      console.log(`\n  🎨 Drawingboard running at http://localhost:${config.port}\n`);
    }
  });
}

start().catch(err => { logger.error({ err }, 'Failed to start'); process.exit(1); });

async function shutdown(signal) {
  logger.info({ signal }, 'Shutting down...');
  stopAutoBackup();
  server.close(() => {
    closeWebSockets();
    closeDatabase();
    logger.info('Shutdown complete');
    process.exit(0);
  });
  setTimeout(() => { logger.error('Forced shutdown'); process.exit(1); }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => { logger.error({ err }, 'Uncaught Exception'); shutdown('UNCAUGHT'); });
process.on('unhandledRejection', (reason) => { logger.error({ reason }, 'Unhandled Rejection'); if (config.nodeEnv === 'production') process.exit(1); });

export default app;
