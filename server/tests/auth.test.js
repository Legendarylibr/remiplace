/**
 * Authentication Tests
 * Tests for auth endpoints and middleware
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'http';
import express from 'express';

// Mock config before importing other modules
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key-that-is-long-enough-for-testing';
process.env.DATABASE_PATH = ':memory:';

// Import modules after setting env
import { generateToken, verifySignature, authenticateToken } from '../middleware/auth.js';
import { checkAndUseNonce, clear as clearNonces } from '../services/nonceStore.js';

// Simple address validation helper for tests
function validateAddress(addr) {
  if (!addr || typeof addr !== 'string') return false;
  return /^0x[a-fA-F0-9]{40}$/.test(addr);
}

describe('Authentication', () => {
  beforeEach(() => {
    // Clear nonce store before each test
    clearNonces();
  });

  describe('JWT Token Generation', () => {
    it('should generate a valid JWT token', () => {
      const payload = {
        address: '0x1234567890123456789012345678901234567890',
        chainId: 1,
        isAuthorized: true,
        isAdmin: false,
      };
      
      const token = generateToken(payload);
      
      assert.ok(token, 'Token should be generated');
      assert.ok(typeof token === 'string', 'Token should be a string');
      assert.ok(token.split('.').length === 3, 'Token should have 3 parts (JWT format)');
    });

    it('should include all payload fields in token', () => {
      const payload = {
        address: '0xabcdef1234567890123456789012345678901234',
        chainId: 8453,
        isAuthorized: true,
        isAdmin: true,
      };
      
      const token = generateToken(payload);
      
      // Decode token (without verification for testing)
      const parts = token.split('.');
      const decoded = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      
      assert.strictEqual(decoded.address, payload.address);
      assert.strictEqual(decoded.chainId, payload.chainId);
      assert.strictEqual(decoded.isAuthorized, payload.isAuthorized);
      assert.strictEqual(decoded.isAdmin, payload.isAdmin);
    });
  });

  describe('Address Validation', () => {
    it('should accept valid Ethereum addresses', () => {
      const validAddresses = [
        '0x1234567890123456789012345678901234567890',
        '0xabcdef1234567890123456789012345678901234',
        '0xABCDEF1234567890123456789012345678901234',
        '0x0000000000000000000000000000000000000000',
      ];
      
      for (const addr of validAddresses) {
        assert.ok(validateAddress(addr), `${addr} should be valid`);
      }
    });

    it('should reject invalid Ethereum addresses', () => {
      const invalidAddresses = [
        '0x123', // too short
        '0x12345678901234567890123456789012345678901', // too long (41 chars)
        '1234567890123456789012345678901234567890', // missing 0x
        '0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG', // invalid hex
        '', // empty
        null, // null
        undefined, // undefined
      ];
      
      for (const addr of invalidAddresses) {
        assert.ok(!validateAddress(addr), `${addr} should be invalid`);
      }
    });
  });

  describe('Nonce Store', () => {
    it('should accept a valid nonce on first use', async () => {
      const address = '0x1234567890123456789012345678901234567890';
      const nonce = 'abc123def456';
      const timestamp = Date.now().toString();
      
      const result = await checkAndUseNonce(address, nonce, timestamp);
      
      assert.strictEqual(result.valid, true);
    });

    it('should reject a nonce on second use', async () => {
      const address = '0x1234567890123456789012345678901234567890';
      const nonce = 'uniquenonce123';
      const timestamp = Date.now().toString();
      
      // First use should succeed
      const first = await checkAndUseNonce(address, nonce, timestamp);
      assert.strictEqual(first.valid, true);
      
      // Second use should fail
      const second = await checkAndUseNonce(address, nonce, timestamp);
      assert.strictEqual(second.valid, false);
      assert.strictEqual(second.reason, 'nonce_reused');
    });

    it('should reject expired timestamps', async () => {
      const address = '0x1234567890123456789012345678901234567890';
      const nonce = 'expiredtest123';
      const oldTimestamp = (Date.now() - 10 * 60 * 1000).toString(); // 10 minutes ago
      
      const result = await checkAndUseNonce(address, nonce, oldTimestamp);
      
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.reason, 'expired_timestamp');
    });

    it('should allow same nonce for different addresses', async () => {
      const nonce = 'sharednonce123';
      const timestamp = Date.now().toString();
      
      const result1 = await checkAndUseNonce('0x1111111111111111111111111111111111111111', nonce, timestamp);
      const result2 = await checkAndUseNonce('0x2222222222222222222222222222222222222222', nonce, timestamp);
      
      assert.strictEqual(result1.valid, true);
      assert.strictEqual(result2.valid, true);
    });
  });

  describe('Auth Middleware', () => {
    it('should reject requests without token', async () => {
      const req = { headers: {} };
      const res = {
        statusCode: null,
        body: null,
        status(code) { this.statusCode = code; return this; },
        json(data) { this.body = data; return this; },
      };
      
      let nextCalled = false;
      const next = () => { nextCalled = true; };
      
      authenticateToken(req, res, next);
      
      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.body.code, 'NO_TOKEN');
      assert.strictEqual(nextCalled, false);
    });

    it('should reject invalid tokens', async () => {
      const req = { headers: { authorization: 'Bearer invalid.token.here' } };
      const res = {
        statusCode: null,
        body: null,
        status(code) { this.statusCode = code; return this; },
        json(data) { this.body = data; return this; },
      };
      
      let nextCalled = false;
      const next = () => { nextCalled = true; };
      
      authenticateToken(req, res, next);
      
      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(res.body.code, 'INVALID_TOKEN');
      assert.strictEqual(nextCalled, false);
    });

    it('should accept valid tokens and set req.user', async () => {
      const payload = {
        address: '0x1234567890123456789012345678901234567890',
        chainId: 1,
        isAuthorized: true,
        isAdmin: false,
      };
      const token = generateToken(payload);
      
      const req = { headers: { authorization: `Bearer ${token}` } };
      const res = {
        statusCode: null,
        status(code) { this.statusCode = code; return this; },
        json(data) { return this; },
      };
      
      let nextCalled = false;
      const next = () => { nextCalled = true; };
      
      authenticateToken(req, res, next);
      
      assert.strictEqual(nextCalled, true, 'next() should be called');
      assert.ok(req.user, 'req.user should be set');
      assert.strictEqual(req.user.address, payload.address);
      assert.strictEqual(req.user.isAuthorized, payload.isAuthorized);
    });
  });
});

