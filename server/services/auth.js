/**
 * Auth Service
 */

import { generateToken } from '../middleware/auth.js';
import { databaseAPI } from '../models/database.js';
import { checkNFTAuthorization } from './nft.js';
import config from '../config/index.js';

export async function authenticate(address, chainId) {
  let isAuthorized = true;
  if (config.nft.enabled) isAuthorized = await checkNFTAuthorization(address, chainId);
  
  const isAdmin = config.adminWallets.includes(address.toLowerCase());
  databaseAPI.getUser(address);
  
  const token = generateToken({
    address: address.toLowerCase(),
    chainId,
    isAuthorized,
    isAdmin,
    iat: Math.floor(Date.now() / 1000),
  });
  
  return { token, address: address.toLowerCase(), isAuthorized, isAdmin, expiresIn: config.jwt.expiresIn };
}

export async function refreshAuthorization(address, chainId) {
  let isAuthorized = true;
  if (config.nft.enabled) isAuthorized = await checkNFTAuthorization(address, chainId);
  
  const isAdmin = config.adminWallets.includes(address.toLowerCase());
  const token = generateToken({
    address: address.toLowerCase(),
    chainId,
    isAuthorized,
    isAdmin,
    iat: Math.floor(Date.now() / 1000),
  });
  
  return { token, address: address.toLowerCase(), isAuthorized, isAdmin, expiresIn: config.jwt.expiresIn };
}

export function getUserProfile(address) {
  const user = databaseAPI.getUser(address);
  const history = databaseAPI.getUserHistory(address, 10);
  return { address, pixelCount: user?.pixel_count || 0, firstSeen: user?.first_seen, lastSeen: user?.last_seen, recentPixels: history };
}

export default { authenticate, refreshAuthorization, getUserProfile };
