/**
 * (r) EMI / Place - Main Application
 */

import { CONFIG } from './client/config.js';
import { shortenAddress, getChainInfo, isChainAllowed, logger } from './client/utils.js';
import { authAPI, canvasAPI, getToken, setToken, clearToken } from './client/api.js';
import { wsClient } from './client/websocket.js';
import { WalletManager } from './client/WalletManager.js';
import { PixelCanvas } from './client/PixelCanvas.js';

class App {
  constructor() {
    this.wallet = new WalletManager();
    this.canvas = null;
    this.isAuthorized = false;
    this.isAdmin = false;
    this.eraserMode = false;
    this.backendAvailable = false;
    this.canvasStatus = { pixelCount: 0, totalSlots: 0, isFull: false, clearAt: null };
    this.countdownInterval = null;
    
    this.el = {
      connectBtn: document.getElementById('connect-btn'),
      disconnectBtn: document.getElementById('disconnect-btn'),
      statusText: document.getElementById('status-text'),
      walletStatus: document.getElementById('wallet-status'),
      walletDropdown: document.getElementById('wallet-dropdown'),
      networkBadge: document.getElementById('network-badge'),
      networkName: document.getElementById('network-name'),
      networkModal: document.getElementById('network-modal'),
      networkOptions: document.getElementById('network-options'),
      closeModalBtn: document.getElementById('close-modal-btn'),
      walletModal: document.getElementById('wallet-modal'),
      walletOptions: document.getElementById('wallet-options'),
      closeWalletModalBtn: document.getElementById('close-wallet-modal-btn'),
      authBanner: document.getElementById('auth-banner'),
      authMessage: document.getElementById('auth-message'),
      canvasOverlay: document.getElementById('canvas-overlay'),
      canvasElement: document.getElementById('pixel-canvas'),
      palette: document.getElementById('palette'),
      cursorCoords: document.getElementById('cursor-coords'),
      canvasSize: document.getElementById('canvas-size'),
      pixelCount: document.getElementById('pixel-count'),
      eraserSection: document.getElementById('eraser-section'),
      eraserBtn: document.getElementById('eraser-btn')
    };
    
    this._init();
  }
  
  async _init() {
    await this._loadConfig();
    this.canvas = new PixelCanvas(this.el.canvasElement, CONFIG.CANVAS);
    await this._loadCanvas();
    
    this.el.canvasSize.textContent = `${CONFIG.CANVAS.width} × ${CONFIG.CANVAS.height}`;
    this._setupPalette();
    
    this.canvas.onCursorMove = (x, y) => {
      this.el.cursorCoords.textContent = x !== null ? `${x}, ${y}` : '—';
    };
    
    this.canvas.onPixelPlace = (x, y, color) => {
      this._updatePixelCounter();
      wsClient.sendPixel(x, y, color);
    };
    
    this._updatePixelCounter();
    
    this.wallet.onConnect = (addr, chain) => this._handleConnect(addr, chain);
    this.wallet.onDisconnect = () => this._handleDisconnect();
    this.wallet.onAccountChange = (addr) => this._handleAccountChange(addr);
    this.wallet.onChainChange = (chain) => this._handleChainChange(chain);
    
    this._setupEvents();
    this._buildNetworkOptions();
    this._setupWebSocket();
    
    await this.wallet.tryRehydrate();
    await this._checkAuth();
    this._updateUI();
  }
  
  async _loadConfig() {
    if (!CONFIG.USE_BACKEND) return;
    try {
      const cfg = await canvasAPI.getConfig();
      Object.assign(CONFIG.CANVAS, { width: cfg.width, height: cfg.height });
      CONFIG.PALETTE = cfg.palette;
      this.backendAvailable = true;
    } catch (e) {
      logger.warn('App', 'Backend unavailable:', e.message);
    }
  }
  
  async _loadCanvas() {
    if (CONFIG.USE_BACKEND && this.backendAvailable) {
      try {
        const data = await canvasAPI.getCanvas();
        this.canvas.loadFromArray(data.pixels || []);
        return;
      } catch {}
    }
    this.canvas.loadFromStorage();
  }
  
  async _checkAuth() {
    const token = getToken();
    if (!token) return;
    try {
      const r = await authAPI.verify();
      this.isAuthorized = r.isAuthorized;
      this.isAdmin = r.isAdmin || false;
      wsClient.setToken(token);
    } catch {
      clearToken();
      wsClient.setToken(null);
    }
  }
  
  _setupWebSocket() {
    if (!CONFIG.USE_BACKEND) return;
    
    wsClient.on('pixel', (d) => { this.canvas.handleRemotePixel(d.x, d.y, d.color); this._updatePixelCounter(); });
    wsClient.on('batch', (pixels) => { pixels.forEach(p => this.canvas.handleRemotePixel(p.x, p.y, p.color)); this._updatePixelCounter(); });
    wsClient.on('status', (s) => this._updateCanvasStatus(s));
    wsClient.on('cleared', () => { this.canvas.clear(); this._updateCanvasStatus({ pixelCount: 0, isFull: false, clearAt: null }); this._notify('✨ Canvas cleared!'); });
    wsClient.on('connected', () => { this._updateConnectionStatus('connected'); if (this.wallet.address) wsClient.setAddress(this.wallet.address); this._refreshCanvas(); });
    wsClient.on('disconnected', () => this._updateConnectionStatus('disconnected'));
    wsClient.on('error', (d) => { if (d.code === 'AUTH_REQUIRED') this._notify('⚠️ Sign in to save pixels', 'warn'); });
    
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && !wsClient.isConnected()) wsClient.connect();
    });
    
    wsClient.setOpenMode(CONFIG.OPEN_MODE || false);
    this._updateConnectionStatus('connecting');
    wsClient.connect();
  }
  
  async _refreshCanvas() {
    if (!CONFIG.USE_BACKEND || !this.backendAvailable) return;
    try {
      const data = await canvasAPI.getCanvas();
      // Only update canvas if we received actual pixel data - don't clear on empty/failed responses
      if (data.pixels && data.pixels.length > 0) {
        this.canvas.loadFromArray(data.pixels);
      }
      this._updateCanvasStatus({ pixelCount: data.pixelCount || 0, totalSlots: data.totalSlots, isFull: data.isFull, clearAt: data.clearAt });
    } catch {
      // Network error during refresh - keep existing canvas data in memory
    }
  }
  
  _updateConnectionStatus(status) {
    const dot = document.getElementById('status-dot');
    const text = document.getElementById('ws-status-text');
    if (!dot || !text) return;
    dot.className = 'status-dot ' + status;
    text.textContent = { connected: 'Live', disconnected: 'Offline', connecting: 'Connecting...', error: 'Error' }[status] || 'Offline';
  }
  
  _setupPalette() {
    this.el.palette.innerHTML = '';
    CONFIG.PALETTE.forEach((color, i) => {
      const btn = document.createElement('button');
      btn.className = 'palette-btn' + (i === 0 ? ' selected' : '');
      btn.style.backgroundColor = color;
      btn.dataset.color = color;
      btn.title = `Press ${i + 1}`;
      btn.onclick = () => this._selectColor(color, btn);
      this.el.palette.appendChild(btn);
    });
  }
  
  _selectColor(color, btn) {
    this.canvas.setColor(color);
    this.el.palette.querySelectorAll('.palette-btn').forEach(b => b.classList.remove('selected'));
    (btn || this.el.palette.querySelector(`[data-color="${color}"]`))?.classList.add('selected');
  }
  
  _setupEvents() {
    this.el.connectBtn.onclick = () => this._showWalletOptions();
    this.el.disconnectBtn.onclick = () => this._disconnect();
    
    this.el.statusText.onclick = (e) => {
      if (this.wallet.isConnected()) { e.stopPropagation(); this.el.walletDropdown.classList.toggle('hidden'); }
    };
    
    document.addEventListener('click', (e) => {
      if (!this.el.walletStatus.contains(e.target)) this.el.walletDropdown.classList.add('hidden');
    });
    
    this.el.closeModalBtn?.addEventListener('click', () => this.el.networkModal.classList.add('hidden'));
    this.el.networkModal?.addEventListener('click', (e) => { if (e.target === this.el.networkModal) this.el.networkModal.classList.add('hidden'); });
    this.el.closeWalletModalBtn?.addEventListener('click', () => this.el.walletModal.classList.add('hidden'));
    this.el.walletModal?.addEventListener('click', (e) => { if (e.target === this.el.walletModal) this.el.walletModal.classList.add('hidden'); });
    
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const n = parseInt(e.key);
      if (n >= 1 && n <= CONFIG.PALETTE.length) { this._disableEraser(); this._selectColor(CONFIG.PALETTE[n - 1]); }
      if (e.key.toLowerCase() === 'e' && this.isAdmin) this._toggleEraser();
      if (e.key === 'Escape') { this.el.networkModal.classList.add('hidden'); this.el.walletModal?.classList.add('hidden'); }
    });
    
    this.el.eraserBtn?.addEventListener('click', () => this._toggleEraser());
    window.addEventListener('auth:expired', () => { this.isAuthorized = this.isAdmin = false; this._updateUI(); });
  }
  
  _toggleEraser() {
    if (!this.isAdmin) return;
    this.eraserMode = !this.eraserMode;
    this.canvas.eraserMode = this.eraserMode;
    this.el.eraserBtn?.classList.toggle('active', this.eraserMode);
    if (this.eraserMode) this.el.palette.querySelectorAll('.palette-btn').forEach(b => b.classList.remove('selected'));
    this.el.canvasElement.style.cursor = this.eraserMode ? 'cell' : 'crosshair';
  }
  
  _disableEraser() {
    if (!this.eraserMode) return;
    this.eraserMode = false;
    this.canvas.eraserMode = false;
    this.el.eraserBtn?.classList.remove('active');
    this.el.canvasElement.style.cursor = 'crosshair';
  }
  
  _buildNetworkOptions() {
    this.el.networkOptions.innerHTML = '';
    CONFIG.ALLOWED_CHAINS.forEach(chain => {
      const btn = document.createElement('button');
      btn.className = 'network-option-btn';
      btn.textContent = chain.name;
      btn.onclick = async () => {
        try { await this.wallet.switchNetwork(chain.chainId); this.el.networkModal.classList.add('hidden'); }
        catch (e) { alert(`Failed: ${e.message}`); }
      };
      this.el.networkOptions.appendChild(btn);
    });
  }
  
  async _showWalletOptions() {
    this.wallet.refreshWallets();
    const wallets = this.wallet.getAvailableWallets();
    
    if (!wallets.length) { alert('No wallet detected. Install MetaMask or another wallet.'); return; }
    if (wallets.length === 1) { await this._connectWallet(wallets[0].uuid); return; }
    if (!this.el.walletModal) { await this._connectWallet(wallets[0].uuid); return; }
    
    this.el.walletOptions.innerHTML = '';
    wallets.forEach(w => {
      const btn = document.createElement('button');
      btn.className = 'wallet-option-btn';
      if (w.icon) { const img = document.createElement('img'); img.src = w.icon; img.className = 'wallet-icon'; img.onerror = () => img.style.display = 'none'; btn.appendChild(img); }
      btn.appendChild(Object.assign(document.createElement('span'), { textContent: w.name }));
      btn.onclick = async () => { this.el.walletModal.classList.add('hidden'); await this._connectWallet(w.uuid); };
      this.el.walletOptions.appendChild(btn);
    });
    this.el.walletModal.classList.remove('hidden');
  }
  
  async _connectWallet(uuid) {
    try { await this.wallet.connect(uuid); }
    catch (e) { if (!e.message?.includes('rejected')) alert(`Connection failed: ${e.message}`); }
  }
  
  async _disconnect() {
    this.el.walletDropdown.classList.add('hidden');
    await this.wallet.disconnect();
  }
  
  async _handleConnect(address, chainId) {
    if (!isChainAllowed(chainId)) this.el.networkModal.classList.remove('hidden');
    
    if (CONFIG.USE_BACKEND && this.backendAvailable) {
      try {
        const r = await authAPI.connect(address, chainId);
        this.isAuthorized = r.isAuthorized;
        this.isAdmin = r.isAdmin || false;
        const token = getToken();
        if (token) wsClient.setToken(token);
      } catch (e) {
        logger.warn('App', 'Auth failed:', e.message);
        this.isAuthorized = CONFIG.OPEN_MODE;
      }
    } else {
      this.isAuthorized = CONFIG.OPEN_MODE;
    }
    
    wsClient.setAddress(address);
    this._updateUI();
  }
  
  _handleDisconnect() {
    this.isAuthorized = this.isAdmin = false;
    wsClient.setAddress(null);
    wsClient.setToken(null);
    clearToken();
    this._updateUI();
  }
  
  async _handleAccountChange(address) {
    wsClient.setAddress(address);
    if (CONFIG.USE_BACKEND && this.backendAvailable) {
      try {
        const r = await authAPI.connect(address, this.wallet.chainId);
        this.isAuthorized = r.isAuthorized;
        this.isAdmin = r.isAdmin || false;
      } catch {}
    }
    this._updateUI();
  }
  
  async _handleChainChange(chainId) {
    if (!isChainAllowed(chainId)) {
      this.el.networkModal.classList.remove('hidden');
      this.isAuthorized = false;
    } else {
      this.el.networkModal.classList.add('hidden');
      if (CONFIG.USE_BACKEND && this.backendAvailable) {
        try {
          const r = await authAPI.refresh(chainId);
          this.isAuthorized = r.isAuthorized;
          this.isAdmin = r.isAdmin || false;
          const token = getToken();
          if (token) wsClient.setToken(token);
        } catch { this.isAuthorized = CONFIG.OPEN_MODE; }
      }
    }
    this._updateUI();
  }
  
  _updateUI() {
    const connected = this.wallet.isConnected();
    const addr = this.wallet.address;
    const chain = this.wallet.chainId;
    const open = CONFIG.OPEN_MODE || false;
    
    this.el.connectBtn.classList.toggle('hidden', connected);
    if (!connected) this.el.walletDropdown.classList.add('hidden');
    
    if (connected) {
      this.el.statusText.innerHTML = `<span class="address">${shortenAddress(addr)}</span>`;
      this.el.walletStatus.classList.add('connected');
    } else {
      this.el.statusText.textContent = open ? 'Open Canvas' : 'REMI Community Only';
      this.el.walletStatus.classList.remove('connected');
    }
    
    if (connected && chain) {
      const info = getChainInfo(chain);
      this.el.networkBadge.classList.remove('hidden');
      this.el.networkBadge.classList.toggle('error', !info);
      this.el.networkName.textContent = info?.name || `Chain ${chain}`;
    } else {
      this.el.networkBadge.classList.add('hidden');
    }
    
    // Auth banner
    if (connected) {
      if (open) {
        this.el.authBanner.classList.add('hidden');
      } else {
        this.el.authBanner.classList.remove('hidden');
        if (!isChainAllowed(chain)) {
          this.el.authBanner.className = 'auth-banner view-only';
          this.el.authMessage.textContent = '⚠️ Wrong network - please switch';
        } else if (this.isAuthorized) {
          this.el.authBanner.className = 'auth-banner authorized';
          this.el.authMessage.textContent = '✓ NFT holders can draw';
        } else {
          this.el.authBanner.className = 'auth-banner view-only';
          this.el.authMessage.textContent = '👀 View only - need eligible NFT';
        }
      }
    } else {
      this.el.authBanner.classList.remove('hidden');
      this.el.authBanner.className = 'auth-banner view-only';
      this.el.authMessage.textContent = 'Connect wallet to draw';
    }
    
    const canPlace = open || (connected && this.isAuthorized && isChainAllowed(chain));
    this.el.canvasOverlay.classList.toggle('hidden', canPlace);
    this.canvas.setAuthorized(canPlace);
    
    this.el.eraserSection?.classList.toggle('hidden', !this.isAdmin);
    if (!this.isAdmin && this.eraserMode) this._disableEraser();
  }
  
  _updatePixelCounter() {
    let count = 0;
    for (let y = 0; y < this.canvas.gridHeight; y++) {
      for (let x = 0; x < this.canvas.gridWidth; x++) {
        if (this.canvas.pixels[y][x]) count++;
      }
    }
    this.el.pixelCount.textContent = count.toLocaleString();
    this.canvasStatus.pixelCount = count;
  }
  
  _updateCanvasStatus(status) {
    Object.assign(this.canvasStatus, status);
    this._updatePixelCounter();
    
    if (this.canvasStatus.isFull && this.canvasStatus.clearAt) this._startCountdown();
    else this._stopCountdown();
    
    const el = document.getElementById('canvas-full-status');
    el?.classList.toggle('hidden', !this.canvasStatus.isFull);
  }
  
  _startCountdown() {
    this._stopCountdown();
    const update = () => {
      if (!this.canvasStatus.clearAt) return;
      const remaining = Math.max(0, this.canvasStatus.clearAt - Date.now());
      const el = document.getElementById('countdown-timer');
      if (el) {
        if (remaining > 0) {
          const m = Math.floor(remaining / 60000);
          const s = Math.floor((remaining % 60000) / 1000);
          el.textContent = `Clears in ${m}:${s.toString().padStart(2, '0')}`;
          el.classList.remove('hidden');
        } else el.classList.add('hidden');
      }
    };
    update();
    this.countdownInterval = setInterval(update, 1000);
  }
  
  _stopCountdown() {
    if (this.countdownInterval) { clearInterval(this.countdownInterval); this.countdownInterval = null; }
    document.getElementById('countdown-timer')?.classList.add('hidden');
  }
  
  _notify(msg, type = 'success') {
    const el = document.createElement('div');
    el.className = type === 'warn' ? 'pixel-error-notification' : 'clear-notification';
    el.innerHTML = `<span>${msg}</span>`;
    document.body.appendChild(el);
    setTimeout(() => el.classList.add('visible'), 10);
    setTimeout(() => { el.classList.remove('visible'); setTimeout(() => el.remove(), 300); }, 4000);
  }
}

document.addEventListener('DOMContentLoaded', () => { window.app = new App(); });
