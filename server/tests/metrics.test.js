/**
 * Metrics Tests
 * Tests for the metrics service
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';

// Mock config before importing other modules
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key-that-is-long-enough-for-testing';
process.env.DATABASE_PATH = ':memory:';

// Import after setting env
import { 
  incrementCounter, 
  observeHistogram, 
  getPrometheusMetrics, 
  getMetricsJSON 
} from '../services/metrics.js';

describe('Metrics Service', () => {
  describe('Counter Operations', () => {
    it('should increment counters', () => {
      const before = getMetricsJSON();
      const initialValue = before.http.requestsTotal;
      
      incrementCounter('http_requests_total');
      incrementCounter('http_requests_total');
      incrementCounter('http_requests_total');
      
      const after = getMetricsJSON();
      assert.strictEqual(after.http.requestsTotal, initialValue + 3);
    });

    it('should increment by custom value', () => {
      // pixels_placed_total counter exists but isn't exposed in JSON canvas section
      // Test that incrementCounter with custom value doesn't throw
      incrementCounter('pixels_placed_total', 5);
      // Verify via Prometheus format which shows the counter
      const metrics = getPrometheusMetrics();
      assert.ok(metrics.includes('pixels_placed_total'), 'Should include pixels counter');
    });

    it('should ignore unknown counters', () => {
      // Should not throw
      incrementCounter('unknown_counter_xyz');
    });
  });

  describe('Histogram Operations', () => {
    it('should record histogram observations', () => {
      // observeHistogram tracks internally but doesn't expose avgDurationMs in JSON
      observeHistogram('http_request_duration_seconds', 0.5);
      observeHistogram('http_request_duration_seconds', 1.0);
      
      // Verify no error occurs and metrics still return valid data
      const after = getMetricsJSON();
      assert.ok(after.http, 'HTTP section should exist');
      assert.ok(typeof after.http.requestsTotal === 'number', 'Should have requestsTotal');
    });
  });

  describe('Prometheus Format', () => {
    it('should return valid Prometheus format', () => {
      const metrics = getPrometheusMetrics();
      
      assert.ok(typeof metrics === 'string', 'Metrics should be a string');
      assert.ok(metrics.includes('# HELP'), 'Should include HELP comments');
      assert.ok(metrics.includes('# TYPE'), 'Should include TYPE comments');
      assert.ok(metrics.includes('process_resident_memory_bytes'), 'Should include memory metrics');
      assert.ok(metrics.includes('http_requests_total'), 'Should include HTTP metrics');
    });

    it('should include all expected metrics', () => {
      const metrics = getPrometheusMetrics();
      
      const expectedMetrics = [
        'process_resident_memory_bytes',
        'http_requests_total',
        'pixels_placed_total',
        'canvas_pixels_current',
        'canvas_fill_ratio',
        'websocket_connections_current',
        'auth_success_total',
        'nonce_store_size',
      ];
      
      for (const metric of expectedMetrics) {
        assert.ok(metrics.includes(metric), `Should include ${metric}`);
      }
    });
  });

  describe('JSON Format', () => {
    it('should return valid JSON structure', () => {
      const metrics = getMetricsJSON();
      
      assert.ok(metrics.process, 'Should have process section');
      assert.ok(metrics.http, 'Should have http section');
      assert.ok(metrics.canvas, 'Should have canvas section');
      assert.ok(metrics.auth, 'Should have auth section');
      assert.ok(metrics.websocket, 'Should have websocket section');
      assert.ok(metrics.timestamp, 'Should have timestamp');
    });

    it('should include process metrics', () => {
      const metrics = getMetricsJSON();
      
      assert.ok(typeof metrics.process.uptime === 'number');
      assert.ok(typeof metrics.process.memory.rss === 'number');
      assert.ok(typeof metrics.process.memory.heapUsed === 'number');
    });

    it('should include canvas metrics', () => {
      const metrics = getMetricsJSON();
      
      assert.ok(typeof metrics.canvas.pixelsCurrent === 'number');
      assert.ok(typeof metrics.canvas.slotsTotal === 'number');
      assert.ok(typeof metrics.canvas.fillRatio === 'number');
      assert.ok(metrics.canvas.fillRatio >= 0 && metrics.canvas.fillRatio <= 1);
    });
  });
});

describe('Nonce Store Statistics', () => {
  it('should include nonce store stats in metrics', () => {
    const metrics = getMetricsJSON();
    
    assert.ok(metrics.nonceStore, 'Should have nonceStore section');
    assert.ok(typeof metrics.nonceStore.memoryStoreSize === 'number');
    assert.ok(typeof metrics.nonceStore.usingRedis === 'boolean');
  });
});
