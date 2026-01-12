import { Alchemy, Network, Utils } from 'alchemy-sdk';
import { ethers } from 'ethers';

const getAlchemyConfig = (chain: string) => {
  const apiKey = process.env.ALCHEMY_API_KEY;
  
  if (!apiKey) {
    throw new Error('ALCHEMY_API_KEY not configured');
  }

  let network: Network;
  
  switch (chain) {
    case 'ETHEREUM':
      network = Network.ETH_MAINNET;
      break;
    case 'POLYGON':
      network = Network.MATIC_MAINNET;
      break;
    case 'BSC':
      // Alchemy doesn't support BSC, fall back to public RPC
      throw new Error('BSC_FALLBACK');
    default:
      network = Network.ETH_MAINNET;
  }

  return new Alchemy({ apiKey, network });
};

export const generateEVMWallet = async (): Promise<{ address: string; privateKey: string }> => {
  const wallet = ethers.Wallet.createRandom();
  
  return {
    address: wallet.address,
    privateKey: wallet.privateKey
  };
};

export const getEVMBalance = async (address: string, chain: string): Promise<string> => {
  try {
    const alchemy = getAlchemyConfig(chain);
    const balance = await alchemy.core.getBalance(address);
    return Utils.formatEther(balance);
  } catch (error) {
    // Fallback to public RPC for BSC or if Alchemy fails
    if (error instanceof Error && error.message === 'BSC_FALLBACK') {
      const rpcUrl = 'https://bsc-dataseed1.binance.org';
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const balance = await provider.getBalance(address);
      return ethers.formatEther(balance);
    }
    
    // Try fallback RPCs
    const fallbackRpcs: Record<string, string> = {
      'ETHEREUM': 'https://eth.llamarpc.com',
      'POLYGON': 'https://polygon-rpc.com',
      'BSC': 'https://bsc-dataseed1.binance.org'
    };
    
    const rpcUrl = fallbackRpcs[chain];
    if (rpcUrl) {
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const balance = await provider.getBalance(address);
      return ethers.formatEther(balance);
    }
    
    throw error;
  }
};

export const validateEVMAddress = (address: string): boolean => {
  return ethers.isAddress(address);
};

export const getTokenBalance = async (
  walletAddress: string, 
  tokenAddress: string, 
  chain: string
): Promise<string> => {
  try {
    const alchemy = getAlchemyConfig(chain);
    const balances = await alchemy.core.getTokenBalances(walletAddress, [tokenAddress]);
    
    if (balances.tokenBalances.length > 0) {
      const balance = balances.tokenBalances[0];
      if (balance.tokenBalance) {
        return Utils.formatUnits(balance.tokenBalance, 18);
      }
    }
    
    return '0';
  } catch (error) {
    console.error('Token balance fetch error:', error);
    throw error;
  }
};
