/**
 * Nonce Store - Replay attack prevention
 */

import logger from '../utils/logger.js';

const store = new Map();
const TTL = 10 * 60 * 1000; // 10 min
let redisClient = null;

export function setRedisClient(client) {
  redisClient = client;
  logger.info('Nonce store using Redis');
}

function key(addr, nonce) {
  return `nonce:${addr.toLowerCase()}:${nonce}`;
}

export async function checkAndUseNonce(address, nonce, timestamp) {
  const k = key(address, nonce);
  const now = Date.now();
  const ts = parseInt(timestamp, 10);
  
  if (isNaN(ts) || Math.abs(now - ts) > 5 * 60 * 1000) {
    return { valid: false, reason: 'expired_timestamp' };
  }
  
  if (redisClient) {
    try {
      const result = await redisClient.set(k, now.toString(), 'PX', TTL, 'NX');
      return result === 'OK' ? { valid: true } : { valid: false, reason: 'nonce_reused' };
    } catch (e) {
      logger.error({ err: e }, 'Redis nonce check failed');
    }
  }
  
  if (store.has(k)) return { valid: false, reason: 'nonce_reused' };
  store.set(k, now);
  return { valid: true };
}

export function getStats() {
  return { memoryStoreSize: store.size, usingRedis: redisClient !== null };
}

export function clear() {
  store.clear();
}

// Cleanup expired nonces
setInterval(() => {
  const now = Date.now();
  for (const [k, ts] of store) if (now - ts > TTL) store.delete(k);
}, 10 * 60 * 1000).unref?.();

export default { checkAndUseNonce, setRedisClient, getStats, clear };
