/**
 * Client Utilities
 */

import { CONFIG, DEBUG } from './config.js';

export const shortenAddress = (addr) => addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : '';

export const isValidHexColor = (color) => /^#[0-9A-Fa-f]{6}$/.test(color);

export function getChainInfo(chainId) {
  const id = typeof chainId === 'string' ? parseInt(chainId, chainId.startsWith('0x') ? 16 : 10) : chainId;
  return CONFIG.ALLOWED_CHAINS.find(c => c.chainId === id);
}

export const isChainAllowed = (chainId) => !!getChainInfo(chainId);

export const logger = {
  debug: (tag, ...args) => DEBUG && console.log(`[${tag}]`, ...args),
  info: (tag, ...args) => DEBUG && console.info(`[${tag}]`, ...args),
  warn: (tag, ...args) => console.warn(`[${tag}]`, ...args),
  error: (tag, ...args) => console.error(`[${tag}]`, ...args),
};
