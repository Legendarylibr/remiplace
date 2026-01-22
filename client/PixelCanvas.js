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
    this.onZoomChange = null;
    
    // Zoom state
    this.zoom = 1;
    this.minZoom = 0.5;
    this.maxZoom = 8;
    this.panX = 0;
    this.panY = 0;
    this.isPanning = false;
    this.lastPanPoint = null;
    
    // Calculate max zoom to fit screen
    this._updateMaxZoomForScreen();
    
    // Hover preview state
    this.hoverX = null;
    this.hoverY = null;
    
    this._setupEvents();
    this._setupZoom();
    this._setupContainerZoomIsolation();
    this._setupResizeHandler();
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
    
    // Only place pixel on click - no drag support (but not if we just panned)
    this.canvas.addEventListener('click', (e) => {
      if (!this.isAuthorized || this._justPanned) return;
      e.preventDefault();
      const { x, y } = pos(e);
      // Clear hover preview before placing to avoid visual artifacts
      this._clearHoverPreview();
      placePixel(x, y);
      // Re-show preview at current position
      this._updateHoverPreview(x, y);
    });
    
    // Cursor tracking for UI feedback and hover preview
    this.canvas.addEventListener('pointermove', (e) => {
      // Handle panning when middle mouse or holding space
      if (this.isPanning && this.lastPanPoint) {
        const dx = e.clientX - this.lastPanPoint.x;
        const dy = e.clientY - this.lastPanPoint.y;
        this.panX += dx;
        this.panY += dy;
        this.lastPanPoint = { x: e.clientX, y: e.clientY };
        this._applyTransform();
        return;
      }
      
      const { x, y } = pos(e);
      this._updateHoverPreview(x, y);
      this.onCursorMove?.(x, y);
    });
    
    this.canvas.addEventListener('pointerleave', () => {
      this._clearHoverPreview();
      this.onCursorMove?.(null, null);
    });
    
    // Panning with middle mouse button
    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.button === 1 || (e.button === 0 && e.altKey)) { // Middle click or Alt+click
        e.preventDefault();
        this.isPanning = true;
        this._justPanned = false;
        this.lastPanPoint = { x: e.clientX, y: e.clientY };
        this.canvas.style.cursor = 'grabbing';
      }
    });
    
    window.addEventListener('pointerup', (e) => {
      if (this.isPanning) {
        if (this.lastPanPoint) {
          const dx = Math.abs(e.clientX - this.lastPanPoint.x);
          const dy = Math.abs(e.clientY - this.lastPanPoint.y);
          if (dx > 3 || dy > 3) this._justPanned = true;
          setTimeout(() => this._justPanned = false, 100);
        }
        this.isPanning = false;
        this.lastPanPoint = null;
        this.canvas.style.cursor = this.isAuthorized ? 'crosshair' : 'not-allowed';
      }
    });
  }
  
  _setupZoom() {
    // Zoom with mouse wheel
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      // Calculate zoom
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * zoomFactor));
      
      if (newZoom !== this.zoom) {
        // Adjust pan to zoom toward mouse position
        const zoomRatio = newZoom / this.zoom;
        this.panX = mouseX - (mouseX - this.panX) * zoomRatio;
        this.panY = mouseY - (mouseY - this.panY) * zoomRatio;
        this.zoom = newZoom;
        this._applyTransform();
      }
    }, { passive: false });
    
    // Double-click to reset zoom
    this.canvas.addEventListener('dblclick', (e) => {
      if (this.zoom !== 1 || this.panX !== 0 || this.panY !== 0) {
        e.preventDefault();
        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;
        this._applyTransform();
      }
    });
    
    // Touch pinch zoom
    let lastTouchDist = 0;
    let lastTouchCenter = null;
    
    this.canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        lastTouchDist = Math.hypot(dx, dy);
        lastTouchCenter = {
          x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
          y: (e.touches[0].clientY + e.touches[1].clientY) / 2
        };
      }
    }, { passive: false });
    
    this.canvas.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        const center = {
          x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
          y: (e.touches[0].clientY + e.touches[1].clientY) / 2
        };
        
        if (lastTouchDist > 0) {
          const rect = this.canvas.getBoundingClientRect();
          const zoomFactor = dist / lastTouchDist;
          const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * zoomFactor));
          
          if (newZoom !== this.zoom) {
            const mouseX = center.x - rect.left;
            const mouseY = center.y - rect.top;
            const zoomRatio = newZoom / this.zoom;
            this.panX = mouseX - (mouseX - this.panX) * zoomRatio;
            this.panY = mouseY - (mouseY - this.panY) * zoomRatio;
            this.zoom = newZoom;
          }
          
          // Also handle panning with two fingers
          if (lastTouchCenter) {
            this.panX += center.x - lastTouchCenter.x;
            this.panY += center.y - lastTouchCenter.y;
          }
          
          this._applyTransform();
        }
        
        lastTouchDist = dist;
        lastTouchCenter = center;
      }
    }, { passive: false });
    
    this.canvas.addEventListener('touchend', () => {
      lastTouchDist = 0;
      lastTouchCenter = null;
    });
  }
  
  _applyTransform() {
    this.canvas.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
    this.onZoomChange?.(this.zoom);
  }
  
  _updateMaxZoomForScreen() {
    const container = this.canvas.parentElement;
    if (!container) return;
    
    const containerRect = container.getBoundingClientRect();
    const canvasWidth = this.canvas.width;
    const canvasHeight = this.canvas.height;
    
    // Calculate max zoom so canvas fits within container
    // Leave some padding (20px on each side)
    const availableWidth = containerRect.width - 40;
    const availableHeight = containerRect.height - 40;
    
    const maxZoomX = availableWidth / canvasWidth;
    const maxZoomY = availableHeight / canvasHeight;
    
    // Max zoom is the smaller of the two (to fit both dimensions)
    // But don't go below 1x or above 8x
    this.maxZoom = Math.max(1, Math.min(8, Math.min(maxZoomX, maxZoomY)));
    
    // If current zoom exceeds new max, clamp it
    if (this.zoom > this.maxZoom) {
      this.zoom = this.maxZoom;
      this._applyTransform();
    }
  }
  
  _setupResizeHandler() {
    // Recalculate max zoom when window resizes
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        this._updateMaxZoomForScreen();
      }, 100);
    });
    
    // Also update after a short delay to ensure container is properly sized
    setTimeout(() => this._updateMaxZoomForScreen(), 100);
  }
  
  _setupContainerZoomIsolation() {
    const container = this.canvas.parentElement;
    this._isMouseOverCanvas = false;
    
    // Track when mouse is over canvas area
    container?.addEventListener('mouseenter', () => { this._isMouseOverCanvas = true; });
    container?.addEventListener('mouseleave', () => { this._isMouseOverCanvas = false; });
    
    // Capture wheel events at document level to prevent ANY scrolling when over canvas
    document.addEventListener('wheel', (e) => {
      if (!this._isMouseOverCanvas) return;
      
      // Stop all scrolling behaviors
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      
      // Use combined delta for trackpad diagonal scrolling
      const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (delta === 0) return;
      
      // Zoom the canvas
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      const zoomFactor = delta > 0 ? 0.9 : 1.1;
      const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * zoomFactor));
      
      if (newZoom !== this.zoom) {
        const zoomRatio = newZoom / this.zoom;
        this.panX = mouseX - (mouseX - this.panX) * zoomRatio;
        this.panY = mouseY - (mouseY - this.panY) * zoomRatio;
        this.zoom = newZoom;
        this._applyTransform();
      }
    }, { passive: false, capture: true });
  }
  
  _updateHoverPreview(x, y) {
    // Clear previous preview
    if (this.hoverX !== null && this.hoverY !== null) {
      this._renderPixel(this.hoverX, this.hoverY, this.pixels[this.hoverY][this.hoverX]);
    }
    
    // Update hover position
    this.hoverX = x;
    this.hoverY = y;
    
    // Draw new preview if authorized
    if (this.isAuthorized && x !== null && y !== null) {
      this._renderHoverPreview(x, y);
    }
  }
  
  _clearHoverPreview() {
    if (this.hoverX !== null && this.hoverY !== null) {
      this._renderPixel(this.hoverX, this.hoverY, this.pixels[this.hoverY][this.hoverX]);
    }
    this.hoverX = null;
    this.hoverY = null;
  }
  
  _renderHoverPreview(x, y) {
    const previewColor = this.eraserMode ? null : this.selectedColor;
    const px = x * this.pixelSize;
    const py = y * this.pixelSize;
    
    // Draw the preview pixel with the selected color
    this.ctx.fillStyle = previewColor || '#ffffff';
    this.ctx.fillRect(px, py, this.pixelSize, this.pixelSize);
    
    // Draw a distinctive border to show it's a preview
    this.ctx.strokeStyle = this.eraserMode ? '#ff0000' : '#000000';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(px + 1, py + 1, this.pixelSize - 2, this.pixelSize - 2);
    
    // Add inner highlight for better visibility
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(px + 2, py + 2, this.pixelSize - 4, this.pixelSize - 4);
  }
  
  resetZoom() {
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this._applyTransform();
  }
  
  cycleZoom() {
    // Cycle through zoom levels: 1 → 2 → 4 → 1
    const zoomLevels = [1, 2, 4];
    const currentIndex = zoomLevels.findIndex(z => Math.abs(this.zoom - z) < 0.1);
    
    if (currentIndex === -1 || currentIndex === zoomLevels.length - 1) {
      // Not at a preset level or at max zoom - reset to 1x
      this.zoom = 1;
      this.panX = 0;
      this.panY = 0;
    } else {
      // Go to next zoom level, centered on canvas
      const newZoom = zoomLevels[currentIndex + 1];
      const rect = this.canvas.getBoundingClientRect();
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      
      const zoomRatio = newZoom / this.zoom;
      this.panX = centerX - (centerX - this.panX) * zoomRatio;
      this.panY = centerY - (centerY - this.panY) * zoomRatio;
      this.zoom = newZoom;
    }
    
    this._applyTransform();
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
    if (isValidHexColor(color) && CONFIG.PALETTE.includes(color)) {
      this.selectedColor = color;
      // Update hover preview with new color
      if (this.hoverX !== null && this.hoverY !== null) {
        this._updateHoverPreview(this.hoverX, this.hoverY);
      }
    }
  }
  
  setAuthorized(auth) {
    this.isAuthorized = auth;
    this.canvas.style.cursor = auth ? 'crosshair' : 'not-allowed';
    // Clear preview if no longer authorized
    if (!auth) {
      this._clearHoverPreview();
    }
  }
  
  setEraserMode(enabled) {
    this.eraserMode = enabled;
    // Update hover preview with new mode
    if (this.hoverX !== null && this.hoverY !== null) {
      this._updateHoverPreview(this.hoverX, this.hoverY);
    }
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
