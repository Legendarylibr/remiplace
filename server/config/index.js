/**
 * Server Configuration
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

// Determine database path with Railway volume support
function getDatabasePath() {
  // Explicit path takes priority
  if (process.env.DATABASE_PATH) {
    return process.env.DATABASE_PATH;
  }
  // Railway volume mount path (if set by Railway)
  if (process.env.RAILWAY_VOLUME_MOUNT_PATH) {
    return join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'canvas.db');
  }
  // Production: use /data which is a common Railway volume mount
  if (process.env.NODE_ENV === 'production') {
    return '/data/canvas.db';
  }
  // Development: use local data directory
  return join(__dirname, '..', 'data', 'canvas.db');
}

const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  database: {
    path: getDatabasePath(),
  },
  
  jwt: {
    secret: process.env.JWT_SECRET || 'change-this-in-production-to-a-secure-random-string',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },
  
  cors: {
    origin: process.env.CORS_ORIGIN 
      ? (process.env.CORS_ORIGIN.includes(',') ? process.env.CORS_ORIGIN.split(',').map(o => o.trim()) : process.env.CORS_ORIGIN)
      : '*',
    credentials: true,
  },
  
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
    pixelMaxRequests: parseInt(process.env.PIXEL_RATE_LIMIT || '30', 10),
  },
  
  canvas: {
    width: parseInt(process.env.CANVAS_WIDTH || '220', 10),
    height: parseInt(process.env.CANVAS_HEIGHT || '150', 10),
    palette: ['#ff0000', '#ff7f00', '#ffff00', '#00ff00', '#0000ff', '#4b0082', '#9400d3', '#000000', '#ffffff'],
  },
  
  openMode: process.env.OPEN_MODE === 'true',
  
  nft: {
    enabled: process.env.NFT_GATING_ENABLED === 'true',
    rpcUrls: {
      1: process.env.RPC_URL_1 || 'https://eth.llamarpc.com',
      8453: process.env.RPC_URL_8453 || 'https://mainnet.base.org',
      42161: process.env.RPC_URL_42161 || 'https://arb1.arbitrum.io/rpc',
      10: process.env.RPC_URL_10 || 'https://mainnet.optimism.io',
      137: process.env.RPC_URL_137 || 'https://polygon-rpc.com',
    },
    contracts: {
      erc721: process.env.ERC721_CONTRACTS ? JSON.parse(process.env.ERC721_CONTRACTS) : [],
      erc1155: process.env.ERC1155_CONTRACTS ? JSON.parse(process.env.ERC1155_CONTRACTS) : [],
    },
  },
  
  adminWallets: process.env.ADMIN_WALLETS ? process.env.ADMIN_WALLETS.split(',').map(a => a.trim().toLowerCase()) : [],
  
  redis: {
    enabled: process.env.REDIS_ENABLED === 'true',
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),
  },
};

// Validate production config
if (config.nodeEnv === 'production') {
  const errors = [];
  if (config.jwt.secret === 'change-this-in-production-to-a-secure-random-string') errors.push('JWT_SECRET must be set');
  if (config.jwt.secret.length < 32) errors.push('JWT_SECRET must be 32+ chars');
  if ([config.cors.origin].flat().includes('*')) errors.push('CORS_ORIGIN cannot be "*"');
  if (errors.length) throw new Error(`Config errors:\n${errors.join('\n')}`);
}

export default config;
