/**
 * Authentication Middleware
 */

import jwt from 'jsonwebtoken';
import config from '../config/index.js';

export function authenticateToken(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  
  if (!token) return res.status(401).json({ error: 'Authentication required', code: 'NO_TOKEN' });
  
  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    req.user = {
      address: decoded.address,
      chainId: decoded.chainId,
      isAuthorized: decoded.isAuthorized,
      isAdmin: decoded.isAdmin || false,
    };
    next();
  } catch (e) {
    if (e.name === 'TokenExpiredError') return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    return res.status(403).json({ error: 'Invalid token', code: 'INVALID_TOKEN' });
  }
}

export function optionalAuth(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) { req.user = null; return next(); }
  
  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    req.user = { address: decoded.address, chainId: decoded.chainId, isAuthorized: decoded.isAuthorized, isAdmin: decoded.isAdmin || false };
  } catch { req.user = null; }
  next();
}

export function requireAuthorization(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required', code: 'NO_AUTH' });
  if (!req.user.isAuthorized) return res.status(403).json({ error: 'NFT required', code: 'NOT_AUTHORIZED' });
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required', code: 'NO_AUTH' });
  const isAdmin = req.user.isAdmin || config.adminWallets.includes(req.user.address.toLowerCase());
  if (!isAdmin) return res.status(403).json({ error: 'Admin required', code: 'NOT_ADMIN' });
  req.user.isAdmin = true;
  next();
}

export function generateToken(payload) {
  return jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
}

export async function verifySignature(address, message, signature) {
  const { ethers } = await import('ethers');
  try {
    return ethers.verifyMessage(message, signature).toLowerCase() === address.toLowerCase();
  } catch { return false; }
}
