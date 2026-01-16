/**
 * Pixel Canvas - Canvas rendering and interaction
 */

import { CONFIG } from './config.js';
import { isValidHexColor } from './utils.js';

export class PixelCanvas {
  constructor(canvasEl, config) {
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext('2d');
    this.gridWidth = config.width;
    this.gridHeight = config.height;
    this.pixelSize = config.displayScale;
    
    canvasEl.width = this.gridWidth * this.pixelSize;
    canvasEl.height = this.gridHeight * this.pixelSize;
    
    this.pixels = this._createGrid();
    this.selectedColor = CONFIG.PALETTE[0];
    this.isAuthorized = false;
    this.eraserMode = false;
    this.onPixelPlace = null;
    this.onCursorMove = null;
    
    this._setupEvents();
    this._render();
  }
  
  _createGrid() {
    return Array(this.gridHeight).fill(null).map(() => Array(this.gridWidth).fill(null));
  }
  
  _setupEvents() {
    // Single pixel placement only - no drag drawing
    const placePixel = (x, y) => {
      if (x < 0 || x >= this.gridWidth || y < 0 || y >= this.gridHeight) return;
      const color = this.eraserMode ? null : this.selectedColor;
      this.pixels[y][x] = color;
      this._renderPixel(x, y, color);
      this.onPixelPlace?.(x, y, color);
    };
    
    const pos = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const style = getComputedStyle(this.canvas);
      const bl = parseFloat(style.borderLeftWidth) || 0;
      const bt = parseFloat(style.borderTopWidth) || 0;
      const iw = rect.width - bl - (parseFloat(style.borderRightWidth) || 0);
      const ih = rect.height - bt - (parseFloat(style.borderBottomWidth) || 0);
      if (iw <= 0 || ih <= 0) return { x: 0, y: 0 };
      
      const rx = (e.clientX - rect.left - bl) / iw * this.gridWidth;
      const ry = (e.clientY - rect.top - bt) / ih * this.gridHeight;
      return {
        x: Math.max(0, Math.min(this.gridWidth - 1, Math.floor(rx))),
        y: Math.max(0, Math.min(this.gridHeight - 1, Math.floor(ry)))
      };
    };
    
    // Only place pixel on click - no drag support
    this.canvas.addEventListener('click', (e) => {
      if (!this.isAuthorized) return;
      e.preventDefault();
      const { x, y } = pos(e);
      placePixel(x, y);
    });
    
    // Cursor tracking for UI feedback only
    this.canvas.addEventListener('pointermove', (e) => {
      const { x, y } = pos(e);
      this.onCursorMove?.(x, y);
    });
    
    this.canvas.addEventListener('pointerleave', () => this.onCursorMove?.(null, null));
  }
  
  handleRemotePixel(x, y, color) {
    if (x < 0 || x >= this.gridWidth || y < 0 || y >= this.gridHeight) return;
    this.pixels[y][x] = color;
    this._renderPixel(x, y, color);
  }
  
  _renderPixel(x, y, color) {
    this.ctx.fillStyle = color || '#ffffff';
    this.ctx.fillRect(x * this.pixelSize, y * this.pixelSize, this.pixelSize, this.pixelSize);
  }
  
  _render() {
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    for (let y = 0; y < this.gridHeight; y++) {
      for (let x = 0; x < this.gridWidth; x++) {
        if (this.pixels[y][x]) this._renderPixel(x, y, this.pixels[y][x]);
      }
    }
  }
  
  setColor(color) {
    if (isValidHexColor(color) && CONFIG.PALETTE.includes(color)) this.selectedColor = color;
  }
  
  setAuthorized(auth) {
    this.isAuthorized = auth;
    this.canvas.style.cursor = auth ? 'crosshair' : 'not-allowed';
  }
  
  clear() { this.pixels = this._createGrid(); this._render(); this._saveToStorage(); }
  
  _saveToStorage() {
    const pixels = [];
    for (let y = 0; y < this.gridHeight; y++) {
      for (let x = 0; x < this.gridWidth; x++) {
        if (this.pixels[y][x]) pixels.push({ x, y, color: this.pixels[y][x] });
      }
    }
    try { localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify({ pixels })); } catch {}
  }
  
  loadFromArray(pixels) {
    this.pixels = this._createGrid();
    for (const { x, y, color } of pixels) {
      if (x >= 0 && x < this.gridWidth && y >= 0 && y < this.gridHeight) {
        this.pixels[y][x] = color;
      }
    }
    this._render();
  }
  
  loadFromStorage() {
    try {
      const data = localStorage.getItem(CONFIG.STORAGE_KEY);
      if (data) { this.loadFromArray(JSON.parse(data).pixels || []); return true; }
    } catch {}
    return false;
  }
}
