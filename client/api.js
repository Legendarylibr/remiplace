/**
 * API Client
 */

const API_BASE = '/api';
let authToken = null;

export function setToken(token) {
  authToken = token;
  token ? localStorage.setItem('romelia_token', token) : localStorage.removeItem('romelia_token');
}

export function getToken() {
  if (!authToken) authToken = localStorage.getItem('romelia_token');
  return authToken;
}

export function clearToken() {
  authToken = null;
  localStorage.removeItem('romelia_token');
}

async function apiFetch(endpoint, options = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
  
  if (res.status === 401) {
    const data = await res.json();
    if (data.code === 'TOKEN_EXPIRED') {
      clearToken();
      window.dispatchEvent(new CustomEvent('auth:expired'));
    }
    throw new Error(data.error || 'Authentication required');
  }
  
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  
  return res.json();
}

export const authAPI = {
  async connect(address, chainId) {
    const result = await apiFetch('/auth/connect', {
      method: 'POST',
      body: JSON.stringify({ address, chainId }),
    });
    
    if (result.token) setToken(result.token);
    return result;
  },
  
  async refresh(chainId) {
    const result = await apiFetch('/auth/refresh', { method: 'POST', body: JSON.stringify({ chainId }) });
    if (result.token) setToken(result.token);
    return result;
  },
  
  verify: () => apiFetch('/auth/verify'),
  logout: () => clearToken(),
};

export const canvasAPI = {
  getCanvas: () => apiFetch('/canvas'),
  getConfig: () => apiFetch('/canvas/config'),
};
