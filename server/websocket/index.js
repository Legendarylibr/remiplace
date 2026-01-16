/**
 * WebSocket Server - Real-time pixel broadcast
 */

import { WebSocketServer, WebSocket } from 'ws';
import Redis from 'ioredis';
import jwt from 'jsonwebtoken';
import canvasService from '../services/canvas.js';
import { databaseAPI } from '../models/database.js';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import { incrementCounter } from '../services/metrics.js';
import { setRedisClient as setNonceRedisClient } from '../services/nonceStore.js';

let wss = null;
let redisPub = null, redisSub = null;
const CHANNEL = 'drawingboard:broadcast';
const MAX_PER_IP = parseInt(process.env.WS_MAX_CONNECTIONS_PER_IP || '10', 10);
const MAX_TOTAL = parseInt(process.env.WS_MAX_TOTAL_CONNECTIONS || '10000', 10);
const connsByIP = new Map();

function initRedis() {
  if (!config.redis.enabled) return;
  
  const opts = { host: config.redis.host, port: config.redis.port, password: config.redis.password, db: config.redis.db };
  
  try {
    redisPub = new Redis(opts);
    redisSub = new Redis(opts);
    setNonceRedisClient(redisPub);
    
    redisSub.subscribe(CHANNEL);
    redisSub.on('message', (ch, msg) => {
      if (ch !== CHANNEL) return;
      try {
        const { type, data, origin } = JSON.parse(msg);
        if (origin !== getInstanceId()) broadcastLocal(type, data);
      } catch {}
    });
    
    logger.info('Redis pub/sub initialized');
  } catch (err) {
    logger.error({ err }, 'Redis init failed');
    redisPub = redisSub = null;
  }
}

function getInstanceId() {
  if (!global.__instanceId) global.__instanceId = `${process.pid}-${Date.now()}`;
  return global.__instanceId;
}

function canConnect(ip) {
  if (wss?.clients.size >= MAX_TOTAL) return { ok: false, reason: 'Server full' };
  if ((connsByIP.get(ip)?.size || 0) >= MAX_PER_IP) return { ok: false, reason: 'Too many connections' };
  return { ok: true };
}

export function initWebSocket(server) {
  initRedis();
  wss = new WebSocketServer({ server, path: '/ws' });
  
  canvasService.setAutoClearCallback(() => {
    broadcast('cleared', { message: 'Canvas auto-cleared' });
    broadcast('status', canvasService.getStatus());
  });
  
  wss.on('connection', (ws, req) => {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');
    
    const check = canConnect(ip);
    if (!check.ok) { ws.close(1013, check.reason); return; }
    
    if (!connsByIP.has(ip)) connsByIP.set(ip, new Set());
    connsByIP.get(ip).add(ws);
    ws.clientIP = ip;
    
    let user = null;
    if (token) {
      try {
        const d = jwt.verify(token, config.jwt.secret);
        user = { address: d.address, chainId: d.chainId, isAuthorized: d.isAuthorized, isAdmin: d.isAdmin || false };
        ws.user = user;
      } catch {
        connsByIP.get(ip)?.delete(ws);
        ws.close(1008, 'Invalid token');
        return;
      }
    }
    
    send(ws, 'welcome', { message: 'Connected', clients: wss.clients.size, status: canvasService.getStatus(), authenticated: !!user });
    
    ws.on('message', (raw) => {
      try {
        incrementCounter('websocket_messages_total');
        const { type, data } = JSON.parse(raw.toString());
        // Any message counts as activity - keep connection alive
        ws.isAlive = true;
        ws.lastActivity = Date.now();
        handleMessage(ws, type, data);
      } catch {}
    });
    
    ws.on('close', () => {
      connsByIP.get(ws.clientIP)?.delete(ws);
      if (!connsByIP.get(ws.clientIP)?.size) connsByIP.delete(ws.clientIP);
    });
    
    ws.on('error', (err) => {
      logger.warn({ err, ip: ws.clientIP }, 'WebSocket error');
    });
    
    ws.isAlive = true;
    ws.lastActivity = Date.now();
    ws.on('pong', () => { 
      ws.isAlive = true; 
      ws.lastActivity = Date.now();
    });
  });
  
  // Heartbeat interval - check every 25 seconds, allow 2 missed pings (50s grace)
  const heartbeat = setInterval(() => {
    const now = Date.now();
    wss.clients.forEach(ws => {
      // If client hasn't responded to ping AND no activity in 60 seconds, terminate
      if (!ws.isAlive && (now - ws.lastActivity) > 60000) {
        logger.warn({ ip: ws.clientIP }, 'Terminating inactive connection');
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 25000);
  
  wss.on('close', () => clearInterval(heartbeat));
  logger.info('WebSocket server ready');
  return wss;
}

function send(ws, type, data) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type, data }));
}

function handleMessage(ws, type, data) {
  if (type === 'ping') {
    // Echo back timestamp for latency measurement
    return send(ws, 'pong', { ts: data?.ts, serverTs: Date.now() });
  }
  if (type === 'pixel') return handlePixel(ws, data);
  if (type === 'batch') return handleBatch(ws, data);
}

function handlePixel(ws, data) {
  if (!data || typeof data.x !== 'number' || typeof data.y !== 'number') return send(ws, 'error', { message: 'Invalid data' });
  if (!config.openMode && (!ws.user || !ws.user.isAuthorized)) return send(ws, 'error', { message: 'Auth required', code: 'AUTH_REQUIRED' });
  
  const { x, y, color } = data;
  const user = ws.user?.address || (config.openMode ? 'anonymous' : null);
  
  try {
    if (!color) {
      if (!ws.user?.isAdmin) return send(ws, 'error', { message: 'Admin required', code: 'NOT_ADMIN' });
      databaseAPI.erasePixel(x, y, user);
      broadcast('pixel', { x, y, color: null, placedBy: user });
    } else {
      canvasService.placePixel(x, y, color, user);
      broadcast('pixel', { x, y, color, placedBy: user });
    }
    
    const state = canvasService.checkAndUpdateFullnessState();
    if (state.becameFull || state.status) broadcast('status', state.status);
  } catch (err) {
    send(ws, 'error', { message: err.message });
  }
}

function handleBatch(ws, data) {
  if (!data?.pixels?.length) return send(ws, 'error', { message: 'Invalid batch' });
  if (!config.openMode && (!ws.user || !ws.user.isAuthorized)) return send(ws, 'error', { message: 'Auth required', code: 'AUTH_REQUIRED' });
  
  try {
    const user = ws.user?.address || (config.openMode ? 'anonymous' : null);
    const valid = data.pixels.filter(p => typeof p.x === 'number' && typeof p.y === 'number' && p.color);
    
    if (valid.length) {
      canvasService.placePixelsBatch(valid, user);
      broadcast('batch', valid.map(p => ({ ...p, placedBy: user })));
      
      const state = canvasService.checkAndUpdateFullnessState();
      if (state.becameFull || state.status) broadcast('status', state.status);
    }
  } catch (err) {
    send(ws, 'error', { message: err.message });
  }
}

function broadcastLocal(type, data) {
  if (!wss) return 0;
  const msg = JSON.stringify({ type, data });
  let count = 0;
  wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) { c.send(msg); count++; } });
  return count;
}

export function broadcast(type, data) {
  broadcastLocal(type, data);
  if (redisPub) redisPub.publish(CHANNEL, JSON.stringify({ type, data, origin: getInstanceId() })).catch(() => {});
}

export function getClientCount() { return wss?.clients.size || 0; }

export function closeAll() {
  wss?.clients.forEach(c => c.close());
  redisPub?.quit().catch(() => {});
  redisSub?.quit().catch(() => {});
}

export default { initWebSocket, broadcast, getClientCount, closeAll };
