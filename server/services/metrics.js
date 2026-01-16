/**
 * Metrics Service - Prometheus-compatible metrics
 */

import { databaseAPI } from '../models/database.js';
import { getClientCount } from '../websocket/index.js';
import { getStats as getNonceStats } from './nonceStore.js';
import config from '../config/index.js';

const counters = {
  http_requests_total: 0,
  http_errors_total: 0,
  pixels_placed_total: 0,
  pixels_erased_total: 0,
  auth_success_total: 0,
  auth_failure_total: 0,
  websocket_messages_total: 0,
};

const histograms = { http_request_duration_seconds: { sum: 0, count: 0 } };

export function incrementCounter(name, value = 1) {
  if (counters[name] !== undefined) counters[name] += value;
}

export function observeHistogram(name, value) {
  if (histograms[name]) { histograms[name].sum += value; histograms[name].count++; }
}

export function getPrometheusMetrics() {
  const mem = process.memoryUsage();
  const pixels = databaseAPI.getPixelCount();
  const total = config.canvas.width * config.canvas.height;
  const avgDur = histograms.http_request_duration_seconds.count > 0 ? histograms.http_request_duration_seconds.sum / histograms.http_request_duration_seconds.count : 0;
  const nonce = getNonceStats();
  
  return `# HELP process_resident_memory_bytes Resident memory size
# TYPE process_resident_memory_bytes gauge
process_resident_memory_bytes ${mem.rss}

# HELP canvas_pixels_current Current pixels on canvas
# TYPE canvas_pixels_current gauge
canvas_pixels_current ${pixels}

# HELP canvas_fill_ratio Fill ratio
# TYPE canvas_fill_ratio gauge
canvas_fill_ratio ${(pixels / total).toFixed(4)}

# HELP http_requests_total Total HTTP requests
# TYPE http_requests_total counter
http_requests_total ${counters.http_requests_total}

# HELP pixels_placed_total Total pixels placed
# TYPE pixels_placed_total counter
pixels_placed_total ${counters.pixels_placed_total}

# HELP websocket_connections_current Current WebSocket connections
# TYPE websocket_connections_current gauge
websocket_connections_current ${getClientCount()}

# HELP auth_success_total Total auth successes
# TYPE auth_success_total counter
auth_success_total ${counters.auth_success_total}

# HELP nonce_store_size Nonce store size
# TYPE nonce_store_size gauge
nonce_store_size ${nonce.memoryStoreSize}
`;
}

export function getMetricsJSON() {
  const mem = process.memoryUsage();
  const pixels = databaseAPI.getPixelCount();
  const total = config.canvas.width * config.canvas.height;
  
  return {
    process: { uptime: Math.floor(process.uptime()), memory: { rss: mem.rss, heapUsed: mem.heapUsed } },
    canvas: { pixelsCurrent: pixels, slotsTotal: total, fillRatio: pixels / total },
    http: { requestsTotal: counters.http_requests_total, errorsTotal: counters.http_errors_total },
    auth: { successTotal: counters.auth_success_total, failureTotal: counters.auth_failure_total },
    websocket: { connectionsCurrent: getClientCount(), messagesTotal: counters.websocket_messages_total },
    nonceStore: getNonceStats(),
    timestamp: new Date().toISOString(),
  };
}

export function metricsMiddleware(req, res, next) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    incrementCounter('http_requests_total');
    observeHistogram('http_request_duration_seconds', Number(process.hrtime.bigint() - start) / 1e9);
    if (res.statusCode >= 400) incrementCounter('http_errors_total');
  });
  next();
}

export default { incrementCounter, observeHistogram, getPrometheusMetrics, getMetricsJSON, metricsMiddleware };
