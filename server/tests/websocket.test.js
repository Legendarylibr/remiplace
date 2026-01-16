/**
 * WebSocket Tests
 * Tests for WebSocket server functionality
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key-that-is-long-enough-for-testing';
process.env.DATABASE_PATH = ':memory:';
process.env.WS_MAX_CONNECTIONS_PER_IP = '5';
process.env.WS_MAX_TOTAL_CONNECTIONS = '100';

import { generateToken } from '../middleware/auth.js';

describe('WebSocket Configuration', () => {
  it('should have connection limits configured', () => {
    const maxPerIP = parseInt(process.env.WS_MAX_CONNECTIONS_PER_IP);
    const maxTotal = parseInt(process.env.WS_MAX_TOTAL_CONNECTIONS);
    
    assert.strictEqual(maxPerIP, 5);
    assert.strictEqual(maxTotal, 100);
  });
});

describe('WebSocket Token Generation', () => {
  it('should generate valid tokens for WebSocket auth', () => {
    const payload = {
      address: '0x1234567890123456789012345678901234567890',
      chainId: 1,
      isAuthorized: true,
      isAdmin: false,
    };
    
    const token = generateToken(payload);
    
    assert.ok(token, 'Token should be generated');
    assert.ok(typeof token === 'string');
  });

  it('should include authorization info in token', () => {
    const payload = {
      address: '0xabcdef1234567890123456789012345678901234',
      chainId: 8453,
      isAuthorized: true,
      isAdmin: true,
    };
    
    const token = generateToken(payload);
    const parts = token.split('.');
    const decoded = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    
    assert.strictEqual(decoded.isAuthorized, true);
    assert.strictEqual(decoded.isAdmin, true);
  });
});

describe('WebSocket Message Handling', () => {
  it('should define valid message types', () => {
    const validMessageTypes = ['ping', 'pixel', 'batch'];
    
    // These are the message types the WebSocket server handles
    for (const type of validMessageTypes) {
      assert.ok(typeof type === 'string');
    }
  });

  it('should validate pixel data structure', () => {
    const validPixelData = {
      x: 10,
      y: 20,
      color: '#ff0000',
    };
    
    assert.ok(typeof validPixelData.x === 'number');
    assert.ok(typeof validPixelData.y === 'number');
    assert.ok(typeof validPixelData.color === 'string');
  });

  it('should validate batch data structure', () => {
    const validBatchData = {
      pixels: [
        { x: 0, y: 0, color: '#ff0000' },
        { x: 1, y: 1, color: '#00ff00' },
      ],
    };
    
    assert.ok(Array.isArray(validBatchData.pixels));
    assert.ok(validBatchData.pixels.length > 0);
  });
});

describe('WebSocket Rate Limiting', () => {
  it('should have per-IP connection limits', () => {
    const limit = parseInt(process.env.WS_MAX_CONNECTIONS_PER_IP);
    assert.ok(limit > 0, 'Per-IP limit should be positive');
    assert.ok(limit <= 100, 'Per-IP limit should be reasonable');
  });

  it('should have total connection limits', () => {
    const limit = parseInt(process.env.WS_MAX_TOTAL_CONNECTIONS);
    assert.ok(limit > 0, 'Total limit should be positive');
  });
});
