/**
 * WebSocket Client - Real-time pixel sync with persistent connection
 */

import { logger } from './utils.js';

class WebSocketClient {
  constructor() {
    this.ws = null;
    this.listeners = {};
    this.reconnectDelay = 500;
    this.maxReconnectDelay = 10000;
    this.userAddress = null;
    this.authToken = null;
    this.pendingPixels = [];
    this.authenticated = false;
    this.openMode = false;
    this.pingInterval = null;
    this.connectionCheckInterval = null;
    this.lastPongTime = Date.now();
    this.missedPongs = 0;
    this.maxMissedPongs = 3;
    this.isReconnecting = false;
    
    // Handle visibility changes - reconnect when tab becomes visible
    this._setupVisibilityHandler();
    
    // Handle online/offline events
    this._setupNetworkHandler();
  }

  _setupVisibilityHandler() {
    if (typeof document === 'undefined') return;
    
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        // Tab became visible - check connection health
        if (!this.isConnected()) {
          logger.info('WS', 'Tab visible, reconnecting...');
          this.reconnect();
        } else {
          // Send immediate ping to verify connection is still alive
          this._sendPing();
        }
      }
    });
  }

  _setupNetworkHandler() {
    if (typeof window === 'undefined') return;
    
    window.addEventListener('online', () => {
      logger.info('WS', 'Network online, reconnecting...');
      this.reconnectDelay = 500;
      this.reconnect();
    });
    
    window.addEventListener('offline', () => {
      logger.warn('WS', 'Network offline');
      this._emit('disconnected');
    });
  }

  setAddress(address) { this.userAddress = address; }
  setOpenMode(enabled) { this.openMode = enabled; }
  
  setToken(token) {
    const hadToken = !!this.authToken;
    this.authToken = token;
    
    // Reconnect with new token if:
    // - We have a new token and didn't have one before
    // - WebSocket is either OPEN or still CONNECTING (race condition fix)
    if (token && !hadToken && this.ws) {
      const state = this.ws.readyState;
      if (state === WebSocket.OPEN || state === WebSocket.CONNECTING) {
        this.reconnect();
      }
    }
  }

  reconnect() {
    if (this.isReconnecting) return;
    this.isReconnecting = true;
    
    if (this.ws) {
      // Remove handlers to prevent auto-reconnect from onclose
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
    }
    this._stopTimers();
    
    // Small delay before reconnecting to avoid rapid reconnection loops
    setTimeout(() => {
      this.isReconnecting = false;
      this.connect();
    }, 100);
  }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) return;

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    let url = `${protocol}//${location.host}/ws`;
    if (this.authToken) url += `?token=${encodeURIComponent(this.authToken)}`;

    logger.info('WS', 'Connecting...');
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      logger.info('WS', 'Connected');
      this.reconnectDelay = 500;
      this.authenticated = !!this.authToken;
      this.lastPongTime = Date.now();
      this.missedPongs = 0;
      this._startTimers();
      this._emit('connected');
      this._flushPending();
    };

    this.ws.onmessage = (e) => {
      try {
        const { type, data } = JSON.parse(e.data);
        this._handleMessage(type, data);
      } catch (err) {
        logger.error('WS', 'Parse error:', err);
      }
    };

    this.ws.onclose = (event) => {
      this._stopTimers();
      this._emit('disconnected');
      
      // Don't reconnect if we intentionally closed
      if (event.code === 1000) return;
      
      logger.warn('WS', `Disconnected (code: ${event.code}), reconnecting in ${this.reconnectDelay}ms...`);
      setTimeout(() => this.connect(), this.reconnectDelay);
      this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, this.maxReconnectDelay);
    };

    this.ws.onerror = (err) => {
      logger.error('WS', 'Connection error');
    };
  }

  _handleMessage(type, data) {
    if (type === 'welcome' && data.status) this._emit('status', data.status);
    else if (type === 'pong') {
      this.lastPongTime = Date.now();
      this.missedPongs = 0;
      return;
    }
    else this._emit(type, data);
  }

  _sendPing() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this._send('ping', { ts: Date.now() });
    }
  }

  _startTimers() {
    this._stopTimers();
    
    // Send ping every 15 seconds to keep connection alive
    this.pingInterval = setInterval(() => {
      this._sendPing();
    }, 15000);
    
    // Check connection health every 10 seconds
    this.connectionCheckInterval = setInterval(() => {
      this._checkConnectionHealth();
    }, 10000);
  }

  _checkConnectionHealth() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    
    const timeSinceLastPong = Date.now() - this.lastPongTime;
    
    // If we haven't received a pong in 45 seconds, connection might be dead
    if (timeSinceLastPong > 45000) {
      this.missedPongs++;
      logger.warn('WS', `No pong received for ${Math.round(timeSinceLastPong/1000)}s (missed: ${this.missedPongs})`);
      
      if (this.missedPongs >= this.maxMissedPongs) {
        logger.error('WS', 'Connection appears dead, forcing reconnect');
        this.reconnect();
      }
    }
  }

  _stopTimers() {
    if (this.pingInterval) { 
      clearInterval(this.pingInterval); 
      this.pingInterval = null; 
    }
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
      this.connectionCheckInterval = null;
    }
  }

  _canSend() { return this.ws?.readyState === WebSocket.OPEN && (this.authenticated || this.openMode); }

  sendPixel(x, y, color) {
    if (this._canSend()) {
      this._send('pixel', { x, y, color, address: this.userAddress });
    } else {
      this.pendingPixels.push({ x, y, color });
    }
  }

  _flushPending() {
    if (!this.pendingPixels.length || (!this.authenticated && !this.openMode)) return;
    
    if (this.pendingPixels.length > 1) {
      this._send('batch', { pixels: this.pendingPixels, address: this.userAddress });
    } else {
      const p = this.pendingPixels[0];
      this._send('pixel', { ...p, address: this.userAddress });
    }
    this.pendingPixels = [];
  }

  _send(type, data) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, data }));
    }
  }

  on(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }

  _emit(event, data) {
    (this.listeners[event] || []).forEach(cb => cb(data));
  }

  isConnected() { return this.ws?.readyState === WebSocket.OPEN; }

  disconnect() {
    this._stopTimers();
    this.authenticated = false;
    this.pendingPixels = [];
    if (this.ws) {
      this.ws.onclose = null; // Prevent auto-reconnect
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
  }
}

export const wsClient = new WebSocketClient();
