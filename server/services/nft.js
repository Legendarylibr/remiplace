/**
 * NFT Verification Service - Alchemy API
 */

import config from '../config/index.js';
import logger from '../utils/logger.js';

const ALCHEMY_URLS = {
  1: 'https://eth-mainnet.g.alchemy.com/nft/v3',
  8453: 'https://base-mainnet.g.alchemy.com/nft/v3',
  42161: 'https://arb-mainnet.g.alchemy.com/nft/v3',
  10: 'https://opt-mainnet.g.alchemy.com/nft/v3',
  137: 'https://polygon-mainnet.g.alchemy.com/nft/v3',
};

function getApiKey(chainId) {
  const url = config.nft.rpcUrls[chainId];
  if (!url) return null;
  const match = url.match(/alchemy\.com\/(?:v2|nft\/v3)\/([^/]+)/);
  return match ? match[1] : null;
}

async function checkOwnership(contract, wallet, chainId) {
  const key = getApiKey(chainId);
  const base = ALCHEMY_URLS[chainId];
  if (!key || !base) return false;
  
  try {
    const res = await fetch(`${base}/${key}/isHolderOfContract?wallet=${wallet}&contractAddress=${contract}`);
    if (!res.ok) return false;
    const data = await res.json();
    return data.isHolderOfContract === true;
  } catch (e) {
    logger.error({ err: e, contract }, 'NFT check failed');
    return false;
  }
}

export async function checkNFTAuthorization(address, chainId) {
  if (!config.nft.enabled) return true;
  
  const contracts = config.nft.contracts.erc721 || [];
  if (!contracts.length) return true;
  
  for (const c of contracts) {
    try {
      if (await checkOwnership(c.address, address, c.chainId || 1)) return true;
    } catch {}
  }
  return false;
}

export default { checkNFTAuthorization };
