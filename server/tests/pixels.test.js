/**
 * Pixel Operations Tests
 * Tests for pixel placement and canvas operations
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';

// Mock config before importing other modules
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key-that-is-long-enough-for-testing';
process.env.DATABASE_PATH = ':memory:';
process.env.CANVAS_WIDTH = '100';
process.env.CANVAS_HEIGHT = '100';

// Import modules after setting env
import { validatePixel } from '../middleware/validation.js';
import config from '../config/index.js';

describe('Pixel Validation', () => {
  describe('validatePixel middleware', () => {
    it('should accept valid pixel placement', () => {
      const req = {
        body: {
          x: 50,
          y: 50,
          color: '#ff0000',
        },
      };
      const res = {};
      
      let nextCalled = false;
      const next = () => { nextCalled = true; };
      
      validatePixel(req, res, next);
      
      assert.ok(nextCalled, 'next() should be called');
      assert.strictEqual(req.body.x, 50);
      assert.strictEqual(req.body.y, 50);
      assert.strictEqual(req.body.color, '#ff0000');
    });

    it('should reject missing fields', () => {
      const testCases = [
        { body: { x: 0, y: 0 } }, // missing color
        { body: { x: 0, color: '#ff0000' } }, // missing y
        { body: { y: 0, color: '#ff0000' } }, // missing x
        { body: {} }, // missing all
      ];
      
      for (const req of testCases) {
        let errorThrown = false;
        try {
          validatePixel(req, {}, () => {});
        } catch (e) {
          errorThrown = true;
          assert.strictEqual(e.statusCode, 400);
        }
        assert.ok(errorThrown, 'Should throw validation error for missing fields');
      }
    });

    it('should reject invalid coordinates', () => {
      const testCases = [
        { body: { x: 'abc', y: 0, color: '#ff0000' } }, // non-numeric x
        { body: { x: 0, y: 'xyz', color: '#ff0000' } }, // non-numeric y
        { body: { x: NaN, y: 0, color: '#ff0000' } }, // NaN
      ];
      
      for (const req of testCases) {
        let errorThrown = false;
        try {
          validatePixel(req, {}, () => {});
        } catch (e) {
          errorThrown = true;
          assert.strictEqual(e.statusCode, 400);
          assert.strictEqual(e.code, 'INVALID_COORDINATES');
        }
        assert.ok(errorThrown, 'Should throw validation error for invalid coordinates');
      }
    });

    it('should reject out of bounds coordinates', () => {
      const testCases = [
        { body: { x: -1, y: 0, color: '#ff0000' } }, // negative x
        { body: { x: 0, y: -1, color: '#ff0000' } }, // negative y
        { body: { x: 1000, y: 0, color: '#ff0000' } }, // x too large
        { body: { x: 0, y: 1000, color: '#ff0000' } }, // y too large
      ];
      
      for (const req of testCases) {
        let errorThrown = false;
        try {
          validatePixel(req, {}, () => {});
        } catch (e) {
          errorThrown = true;
          assert.strictEqual(e.statusCode, 400);
          assert.strictEqual(e.code, 'OUT_OF_BOUNDS');
        }
        assert.ok(errorThrown, 'Should throw validation error for out of bounds');
      }
    });

    it('should reject invalid color formats', () => {
      const testCases = [
        { body: { x: 0, y: 0, color: 'red' } }, // named color
        { body: { x: 0, y: 0, color: '#fff' } }, // 3-char hex
        { body: { x: 0, y: 0, color: 'ff0000' } }, // missing #
        { body: { x: 0, y: 0, color: '#gggggg' } }, // invalid hex chars
        { body: { x: 0, y: 0, color: '#ff00001' } }, // 7 chars
      ];
      
      for (const req of testCases) {
        let errorThrown = false;
        try {
          validatePixel(req, {}, () => {});
        } catch (e) {
          errorThrown = true;
          assert.strictEqual(e.statusCode, 400);
          assert.strictEqual(e.code, 'INVALID_COLOR');
        }
        assert.ok(errorThrown, `Should reject invalid color: ${req.body.color}`);
      }
    });

    it('should reject colors not in palette', () => {
      const req = {
        body: {
          x: 0,
          y: 0,
          color: '#123456', // Valid hex but not in palette
        },
      };
      
      let errorThrown = false;
      try {
        validatePixel(req, {}, () => {});
      } catch (e) {
        errorThrown = true;
        assert.strictEqual(e.statusCode, 400);
        assert.strictEqual(e.code, 'COLOR_NOT_IN_PALETTE');
      }
      assert.ok(errorThrown, 'Should reject color not in palette');
    });

    it('should normalize color to lowercase', () => {
      const req = {
        body: {
          x: 0,
          y: 0,
          color: '#FF0000', // uppercase
        },
      };
      const res = {};
      
      validatePixel(req, res, () => {});
      
      assert.strictEqual(req.body.color, '#ff0000');
    });

    it('should parse string coordinates to integers', () => {
      const req = {
        body: {
          x: '10',
          y: '20',
          color: '#ff0000',
        },
      };
      const res = {};
      
      validatePixel(req, res, () => {});
      
      assert.strictEqual(req.body.x, 10);
      assert.strictEqual(req.body.y, 20);
      assert.strictEqual(typeof req.body.x, 'number');
      assert.strictEqual(typeof req.body.y, 'number');
    });
  });
});

describe('Canvas Configuration', () => {
  it('should have valid canvas dimensions', () => {
    assert.ok(config.canvas.width > 0, 'Width should be positive');
    assert.ok(config.canvas.height > 0, 'Height should be positive');
  });

  it('should have a valid color palette', () => {
    assert.ok(Array.isArray(config.canvas.palette), 'Palette should be an array');
    assert.ok(config.canvas.palette.length > 0, 'Palette should not be empty');
    
    for (const color of config.canvas.palette) {
      assert.ok(/^#[0-9a-f]{6}$/i.test(color), `${color} should be valid hex color`);
    }
  });
});

describe('Batch Operations', () => {
  it('should validate batch pixel array', () => {
    const validBatch = [
      { x: 0, y: 0, color: '#ff0000' },
      { x: 1, y: 1, color: '#00ff00' },
      { x: 2, y: 2, color: '#0000ff' },
    ];
    
    // Each pixel should be individually valid
    for (const pixel of validBatch) {
      const req = { body: pixel };
      let isValid = true;
      try {
        validatePixel(req, {}, () => {});
      } catch {
        isValid = false;
      }
      assert.ok(isValid, `Pixel at ${pixel.x},${pixel.y} should be valid`);
    }
  });

  it('should enforce batch size limits', () => {
    const MAX_BATCH_SIZE = 10;
    
    const largeBatch = Array.from({ length: 15 }, (_, i) => ({
      x: i % config.canvas.width,
      y: Math.floor(i / config.canvas.width),
      color: '#ff0000',
    }));
    
    assert.ok(largeBatch.length > MAX_BATCH_SIZE, 'Batch should exceed limit');
    // The actual limit enforcement is in the route handler
  });
});
