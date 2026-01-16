/**
 * Wallet Manager - EIP-6963 multi-wallet detection
 */

import { getChainInfo } from './utils.js';
import { clearToken } from './api.js';

export class WalletManager {
  constructor() {
    this.provider = null;
    this.signer = null;
    this.address = null;
    this.chainId = null;
    this.wallets = [];
    this.onAccountChange = null;
    this.onChainChange = null;
    this.onConnect = null;
    this.onDisconnect = null;
    this._seenProviders = new Set();
    this._activeProvider = null;
    
    this._initEIP6963();
  }
  
  _initEIP6963() {
    window.addEventListener('eip6963:announceProvider', (e) => {
      const { info, provider } = e.detail;
      const id = info.rdns || info.uuid;
      if (!this._seenProviders.has(id)) {
        this._seenProviders.add(id);
        this.wallets.push({ info: { ...info, uuid: id }, provider });
      }
    });
    
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    this._addLegacyWallets();
    setTimeout(() => this._addLegacyWallets(), 500);
  }
  
  refreshWallets() {
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    this._addLegacyWallets();
  }
  
  _addLegacyWallets() {
    const names = new Set(this.wallets.map(w => w.info.name.toLowerCase()));
    
    if (window.ethereum?.providers) {
      window.ethereum.providers.forEach((p, i) => {
        if (!p) return;
        const info = this._identify(p);
        const id = `legacy-${i}`;
        if (!names.has(info.name.toLowerCase()) && !this._seenProviders.has(id)) {
          this._seenProviders.add(id);
          this.wallets.push({ info: { ...info, uuid: id }, provider: p });
          names.add(info.name.toLowerCase());
        }
      });
    }
    
    if (window.ethereum && !this._seenProviders.has('legacy-main')) {
      const info = this._identify(window.ethereum);
      if (!names.has(info.name.toLowerCase())) {
        this._seenProviders.add('legacy-main');
        this.wallets.push({ info: { ...info, uuid: 'legacy-main' }, provider: window.ethereum });
      }
    }
  }
  
  _identify(p) {
    const checks = [
      [() => p.isMetaMask && !p.isRabby && !p.isBraveWallet, 'MetaMask', '#F6851B'],
      [() => p.isRabby, 'Rabby Wallet', '#8697FF'],
      [() => p.isCoinbaseWallet || p.isCoinbaseBrowser, 'Coinbase Wallet', '#0052FF'],
      [() => p.isPhantom, 'Phantom', '#AB9FF2'],
      [() => p.isTrust || p.isTrustWallet, 'Trust Wallet', '#0500FF'],
      [() => p.isRainbow, 'Rainbow', '#174299'],
      [() => p.isBraveWallet, 'Brave Wallet', '#FB542B'],
      [() => p.isFrame, 'Frame', '#1A1A1A'],
    ];
    
    for (const [check, name, color] of checks) {
      if (check()) return { name, icon: this._icon(color) };
    }
    return { name: 'Browser Wallet', icon: this._icon('#333') };
  }
  
  _icon(c) {
    return `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect fill="${encodeURIComponent(c)}" width="32" height="32" rx="6"/></svg>`;
  }
  
  getAvailableWallets() {
    return this.wallets.map(w => ({ name: w.info.name, uuid: w.info.uuid, icon: w.info.icon }));
  }
  
  async connect(walletUuid = null) {
    const wallet = walletUuid ? this.wallets.find(w => w.info.uuid === walletUuid) : this.wallets[0];
    if (!wallet) throw new Error('No wallet detected');
    
    const provider = wallet.provider;
    if (!provider) throw new Error(`${wallet.info.name} not available`);
    
    try {
      const accounts = await provider.request({ method: 'eth_requestAccounts' });
      if (!accounts?.length) throw new Error('No accounts returned');
      
      const { ethers } = await import('https://cdnjs.cloudflare.com/ajax/libs/ethers/6.7.0/ethers.min.js');
      
      this.provider = new ethers.BrowserProvider(provider);
      this.signer = await this.provider.getSigner();
      this.address = accounts[0];
      this._activeProvider = provider;
      
      const network = await this.provider.getNetwork();
      this.chainId = Number(network.chainId);
      
      this._setupListeners(provider);
      this.onConnect?.(this.address, this.chainId);
      
      return { address: this.address, chainId: this.chainId };
    } catch (e) {
      if (e.code === 4001) throw new Error('Connection rejected');
      throw e;
    }
  }
  
  _setupListeners(provider) {
    provider.on('accountsChanged', (accts) => {
      if (!accts.length) this.disconnect();
      else { this.address = accts[0]; this.onAccountChange?.(this.address); }
    });
    
    provider.on('chainChanged', (hex) => {
      this.chainId = parseInt(hex, 16);
      this.onChainChange?.(this.chainId);
    });
    
    provider.on('disconnect', () => this.disconnect());
  }
  
  async disconnect() {
    this.provider = this.signer = this.address = this.chainId = null;
    clearToken();
    this.onDisconnect?.();
  }
  
  async switchNetwork(chainId) {
    const chain = getChainInfo(chainId);
    if (!chain) throw new Error('Chain not allowed');
    
    const provider = this._activeProvider || window.ethereum;
    if (!provider) throw new Error('No provider');
    
    try {
      await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chain.chainIdHex }] });
    } catch (e) {
      if (e.code === 4902) {
        await provider.request({
          method: 'wallet_addEthereumChain',
          params: [{ chainId: chain.chainIdHex, chainName: chain.name, nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: [], blockExplorerUrls: [] }]
        });
      } else throw e;
    }
  }
  
  async signMessage(message) {
    if (!this.signer) throw new Error('No signer available');
    return this.signer.signMessage(message);
  }
  
  async tryRehydrate() {
    const provider = window.ethereum || this.wallets[0]?.provider;
    if (!provider) return false;
    
    try {
      const accounts = await provider.request({ method: 'eth_accounts' });
      if (accounts?.length) {
        const { ethers } = await import('https://cdnjs.cloudflare.com/ajax/libs/ethers/6.7.0/ethers.min.js');
        this.provider = new ethers.BrowserProvider(provider);
        this.signer = await this.provider.getSigner();
        this.address = accounts[0];
        const network = await this.provider.getNetwork();
        this.chainId = Number(network.chainId);
        this._setupListeners(provider);
        this.onConnect?.(this.address, this.chainId);
        return true;
      }
    } catch {}
    return false;
  }
  
  isConnected() { return this.address && this.provider; }
}
