/**
 * Client Configuration
 */

export const CONFIG = {
  APP_NAME: '(r) EMI / Place',
  USE_BACKEND: true,
  FALLBACK_TO_LOCAL: true,
  OPEN_MODE: false,
  
  ALLOWED_CHAINS: [
    { chainId: 1, chainIdHex: '0x1', name: 'Ethereum' },
    { chainId: 8453, chainIdHex: '0x2105', name: 'Base' },
    { chainId: 42161, chainIdHex: '0xa4b1', name: 'Arbitrum' },
    { chainId: 10, chainIdHex: '0xa', name: 'Optimism' },
    { chainId: 137, chainIdHex: '0x89', name: 'Polygon' },
    { chainId: 324, chainIdHex: '0x144', name: 'zkSync Era' },
  ],
  
  CANVAS: { width: 220, height: 150, displayScale: 4 },
  
  PALETTE: [
    '#ff0000', '#ff7f00', '#ffff00', '#00ff00',
    '#0000ff', '#4b0082', '#9400d3', '#000000', '#ffffff'
  ],
  
  STORAGE_KEY: 'romelia_house_canvas',
};

export const DEBUG = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
