import { ethers } from 'ethers';
import axios from 'axios';
import { decrypt } from '../utils/encryption';

// ==================== CONFIGURATION ====================
const CHAIN_CONFIG: Record<string, {
  rpc: string[];
  chainId: number;
  nativeCurrency: string;
  explorer: string;
  gasMultiplier: number;
}> = {
  ETHEREUM: {
    rpc: [
      process.env.ALCHEMY_ETH_RPC || 'https://eth.llamarpc.com',
      'https://rpc.ankr.com/eth',
      'https://cloudflare-eth.com'
    ],
    chainId: 1,
    nativeCurrency: 'ETH',
    explorer: 'https://etherscan.io/tx/',
    gasMultiplier: 1.2
  },
  BSC: {
    rpc: [
      process.env.ALCHEMY_BSC_RPC || 'https://bsc-dataseed.binance.org',
      'https://bsc-dataseed1.defibit.io',
      'https://rpc.ankr.com/bsc'
    ],
    chainId: 56,
    nativeCurrency: 'BNB',
    explorer: 'https://bscscan.com/tx/',
    gasMultiplier: 1.1
  },
  POLYGON: {
    rpc: [
      process.env.ALCHEMY_POLYGON_RPC || 'https://polygon-rpc.com',
      'https://rpc.ankr.com/polygon',
      'https://polygon.llamarpc.com'
    ],
    chainId: 137,
    nativeCurrency: 'MATIC',
    explorer: 'https://polygonscan.com/tx/',
    gasMultiplier: 1.3
  }
};

// ERC20 Token contracts
const ERC20_TOKENS: Record<string, Record<string, { address: string; decimals: number }>> = {
  ETHEREUM: {
    USDT: { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 },
    USDC: { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 }
  },
  BSC: {
    USDT: { address: '0x55d398326f99059fF775485246999027B3197955', decimals: 18 },
    USDC: { address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', decimals: 18 }
  },
  POLYGON: {
    USDT: { address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6 },
    USDC: { address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', decimals: 6 }
  }
};

// ERC20 ABI for transfers
const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)'
];

// Nonce management per address
const nonceCache = new Map<string, { nonce: number; timestamp: number }>();
const NONCE_CACHE_TTL = 30000; // 30 seconds

// Transaction queue for retries
interface QueuedTransaction {
  id: string;
  chain: string;
  from: string;
  to: string;
  amount: string;
  symbol: string;
  encryptedPrivateKey: string;
  retryCount: number;
  maxRetries: number;
  lastError?: string;
  createdAt: Date;
  nextRetryAt?: Date;
}

const transactionQueue = new Map<string, QueuedTransaction>();

// ==================== PROVIDER MANAGEMENT ====================

async function getProvider(chain: string): Promise<ethers.JsonRpcProvider> {
  const config = CHAIN_CONFIG[chain];
  if (!config) {
    throw new Error(`Unsupported chain: ${chain}`);
  }

  // Try each RPC endpoint
  for (const rpc of config.rpc) {
    try {
      const provider = new ethers.JsonRpcProvider(rpc);
      // Test connection
      await provider.getBlockNumber();
      return provider;
    } catch (error) {
      console.warn(`RPC ${rpc} failed, trying next...`);
    }
  }

  throw new Error(`All RPC endpoints failed for ${chain}`);
}

// ==================== NONCE MANAGEMENT ====================

async function getNextNonce(provider: ethers.JsonRpcProvider, address: string): Promise<number> {
  const cacheKey = `${provider._network?.chainId || 'unknown'}-${address.toLowerCase()}`;
  const cached = nonceCache.get(cacheKey);
  const now = Date.now();

  // Get on-chain nonce
  const onChainNonce = await provider.getTransactionCount(address, 'pending');

  if (cached && now - cached.timestamp < NONCE_CACHE_TTL) {
    // Use higher of cached or on-chain
    const nextNonce = Math.max(cached.nonce, onChainNonce);
    nonceCache.set(cacheKey, { nonce: nextNonce + 1, timestamp: now });
    return nextNonce;
  }

  // Cache the nonce + 1 for next use
  nonceCache.set(cacheKey, { nonce: onChainNonce + 1, timestamp: now });
  return onChainNonce;
}

function invalidateNonceCache(chainId: number | string, address: string): void {
  const cacheKey = `${chainId}-${address.toLowerCase()}`;
  nonceCache.delete(cacheKey);
}

// ==================== GAS ESTIMATION ====================

interface GasEstimate {
  gasLimit: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  estimatedCost: string;
}

async function estimateGas(
  provider: ethers.JsonRpcProvider,
  chain: string,
  tx: ethers.TransactionRequest
): Promise<GasEstimate> {
  const config = CHAIN_CONFIG[chain];
  
  // Estimate gas limit
  let gasLimit: bigint;
  try {
    gasLimit = await provider.estimateGas(tx);
    // Add buffer
    gasLimit = (gasLimit * BigInt(Math.floor(config.gasMultiplier * 100))) / BigInt(100);
  } catch (error) {
    // Default gas limits
    gasLimit = tx.data ? BigInt(100000) : BigInt(21000);
  }

  // Get fee data
  const feeData = await provider.getFeeData();
  
  // Calculate gas prices with buffer
  const maxFeePerGas = feeData.maxFeePerGas 
    ? (feeData.maxFeePerGas * BigInt(120)) / BigInt(100) 
    : ethers.parseUnits('50', 'gwei');
  
  const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas
    ? (feeData.maxPriorityFeePerGas * BigInt(120)) / BigInt(100)
    : ethers.parseUnits('2', 'gwei');

  const estimatedCost = ethers.formatEther(gasLimit * maxFeePerGas);

  return {
    gasLimit,
    maxFeePerGas,
    maxPriorityFeePerGas,
    estimatedCost
  };
}

// ==================== TRANSACTION SENDING ====================

export interface SendResult {
  success: boolean;
  txHash?: string;
  explorerUrl?: string;
  error?: string;
  retryable?: boolean;
  queueId?: string;
}

export async function sendEVMTransaction(
  chain: string,
  encryptedPrivateKey: string,
  toAddress: string,
  amount: string,
  symbol: string,
  feeLevel: 'economy' | 'standard' | 'fast' = 'standard'
): Promise<SendResult> {
  const config = CHAIN_CONFIG[chain];
  if (!config) {
    return { success: false, error: `Unsupported chain: ${chain}`, retryable: false };
  }

  try {
    // Decrypt private key
    const privateKey = decrypt(encryptedPrivateKey);
    if (!privateKey || privateKey.length < 64) {
      return { success: false, error: 'Invalid or corrupted private key', retryable: false };
    }

    // Get provider
    const provider = await getProvider(chain);
    const wallet = new ethers.Wallet(privateKey, provider);
    
    console.log(`[TxManager] Sending ${amount} ${symbol} on ${chain} from ${wallet.address}`);

    // Parse amount
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return { success: false, error: 'Invalid amount', retryable: false };
    }

    // Determine if token or native transfer
    const tokenConfig = ERC20_TOKENS[chain]?.[symbol];
    const isToken = !!tokenConfig;

    let tx: ethers.TransactionRequest;
    
    if (isToken) {
      // ERC20 token transfer
      const tokenContract = new ethers.Contract(tokenConfig.address, ERC20_ABI, wallet);
      const tokenAmount = ethers.parseUnits(amount, tokenConfig.decimals);
      
      // Check token balance
      const balance = await tokenContract.balanceOf(wallet.address);
      if (balance < tokenAmount) {
        return { 
          success: false, 
          error: `Insufficient ${symbol} balance. Have: ${ethers.formatUnits(balance, tokenConfig.decimals)}, Need: ${amount}`,
          retryable: false 
        };
      }

      tx = await tokenContract.transfer.populateTransaction(toAddress, tokenAmount);
      tx.from = wallet.address;
    } else {
      // Native currency transfer
      const amountWei = ethers.parseEther(amount);
      
      // Check native balance
      const balance = await provider.getBalance(wallet.address);
      if (balance < amountWei) {
        return { 
          success: false, 
          error: `Insufficient ${symbol} balance. Have: ${ethers.formatEther(balance)}, Need: ${amount}`,
          retryable: false 
        };
      }

      tx = {
        to: toAddress,
        value: amountWei,
        from: wallet.address
      };
    }

    // Get nonce
    const nonce = await getNextNonce(provider, wallet.address);
    tx.nonce = nonce;

    // Estimate gas
    const gasEstimate = await estimateGas(provider, chain, tx);
    
    // Apply fee level multiplier
    const feeMultiplier = feeLevel === 'fast' ? 150 : feeLevel === 'economy' ? 80 : 100;
    tx.gasLimit = gasEstimate.gasLimit;
    tx.maxFeePerGas = (gasEstimate.maxFeePerGas * BigInt(feeMultiplier)) / BigInt(100);
    tx.maxPriorityFeePerGas = (gasEstimate.maxPriorityFeePerGas * BigInt(feeMultiplier)) / BigInt(100);
    tx.chainId = config.chainId;
    tx.type = 2; // EIP-1559

    // Check if user has enough for gas
    if (!isToken) {
      const totalCost = (tx.value as bigint) + (tx.gasLimit as bigint) * (tx.maxFeePerGas as bigint);
      const balance = await provider.getBalance(wallet.address);
      if (balance < totalCost) {
        return {
          success: false,
          error: `Insufficient balance for amount + gas. Need: ${ethers.formatEther(totalCost)} ${symbol}`,
          retryable: false
        };
      }
    }

    console.log(`[TxManager] Signing tx with nonce ${nonce}, gasLimit ${tx.gasLimit}`);

    // Sign and send
    const signedTx = await wallet.signTransaction(tx);
    const txResponse = await provider.broadcastTransaction(signedTx);

    console.log(`[TxManager] Broadcast success: ${txResponse.hash}`);

    return {
      success: true,
      txHash: txResponse.hash,
      explorerUrl: `${config.explorer}${txResponse.hash}`
    };

  } catch (error: any) {
    console.error('[TxManager] Transaction error:', error);
    
    const message = error.message || 'Unknown error';
    
    // Determine if retryable
    const isRetryable = message.includes('nonce') || 
                       message.includes('replacement') ||
                       message.includes('timeout') ||
                       message.includes('network') ||
                       message.includes('ETIMEDOUT') ||
                       message.includes('rate limit');

    // Invalidate nonce cache on nonce errors
    if (message.includes('nonce')) {
      invalidateNonceCache(config.chainId, 'unknown'); // Will be refreshed on next attempt
    }

    return {
      success: false,
      error: message,
      retryable: isRetryable
    };
  }
}

// ==================== TRANSACTION QUEUE ====================

export function queueTransaction(
  id: string,
  chain: string,
  from: string,
  to: string,
  amount: string,
  symbol: string,
  encryptedPrivateKey: string,
  maxRetries: number = 3
): string {
  const queuedTx: QueuedTransaction = {
    id,
    chain,
    from,
    to,
    amount,
    symbol,
    encryptedPrivateKey,
    retryCount: 0,
    maxRetries,
    createdAt: new Date()
  };

  transactionQueue.set(id, queuedTx);
  console.log(`[TxQueue] Transaction ${id} queued for ${chain}`);

  return id;
}

export async function processQueuedTransaction(id: string): Promise<SendResult> {
  const queuedTx = transactionQueue.get(id);
  if (!queuedTx) {
    return { success: false, error: 'Transaction not found in queue', retryable: false };
  }

  const result = await sendEVMTransaction(
    queuedTx.chain,
    queuedTx.encryptedPrivateKey,
    queuedTx.to,
    queuedTx.amount,
    queuedTx.symbol
  );

  if (result.success) {
    transactionQueue.delete(id);
    return result;
  }

  if (result.retryable && queuedTx.retryCount < queuedTx.maxRetries) {
    queuedTx.retryCount++;
    queuedTx.lastError = result.error;
    queuedTx.nextRetryAt = new Date(Date.now() + Math.pow(2, queuedTx.retryCount) * 1000);
    transactionQueue.set(id, queuedTx);
    
    return {
      ...result,
      queueId: id,
      error: `${result.error} (retry ${queuedTx.retryCount}/${queuedTx.maxRetries} scheduled)`
    };
  }

  transactionQueue.delete(id);
  return result;
}

export function getQueuedTransaction(id: string): QueuedTransaction | undefined {
  return transactionQueue.get(id);
}

export function getQueueStats(): { pending: number; retrying: number } {
  let pending = 0;
  let retrying = 0;
  
  for (const tx of transactionQueue.values()) {
    if (tx.retryCount > 0) retrying++;
    else pending++;
  }
  
  return { pending, retrying };
}

// ==================== BALANCE FETCHING ====================

export async function getEVMBalanceRobust(
  chain: string,
  address: string,
  symbol: string
): Promise<{ balance: string; error?: string }> {
  const config = CHAIN_CONFIG[chain];
  if (!config) {
    return { balance: '0', error: `Unsupported chain: ${chain}` };
  }

  try {
    const provider = await getProvider(chain);
    const tokenConfig = ERC20_TOKENS[chain]?.[symbol];

    if (tokenConfig) {
      // Token balance
      const contract = new ethers.Contract(tokenConfig.address, ERC20_ABI, provider);
      const balance = await contract.balanceOf(address);
      return { balance: ethers.formatUnits(balance, tokenConfig.decimals) };
    } else {
      // Native balance
      const balance = await provider.getBalance(address);
      return { balance: ethers.formatEther(balance) };
    }
  } catch (error: any) {
    console.error(`[TxManager] Balance fetch error for ${chain}:`, error.message);
    return { balance: '0', error: error.message };
  }
}

// ==================== GAS ESTIMATION ENDPOINT ====================

export async function estimateTransactionFee(
  chain: string,
  from: string,
  to: string,
  amount: string,
  symbol: string
): Promise<{ 
  success: boolean;
  estimatedFee?: string;
  estimatedFeeUSD?: string;
  gasLimit?: string;
  error?: string;
}> {
  const config = CHAIN_CONFIG[chain];
  if (!config) {
    return { success: false, error: `Unsupported chain: ${chain}` };
  }

  try {
    const provider = await getProvider(chain);
    const tokenConfig = ERC20_TOKENS[chain]?.[symbol];
    
    let tx: ethers.TransactionRequest;
    
    if (tokenConfig) {
      const iface = new ethers.Interface(ERC20_ABI);
      const tokenAmount = ethers.parseUnits(amount, tokenConfig.decimals);
      tx = {
        to: tokenConfig.address,
        from,
        data: iface.encodeFunctionData('transfer', [to, tokenAmount])
      };
    } else {
      tx = {
        to,
        from,
        value: ethers.parseEther(amount)
      };
    }

    const gasEstimate = await estimateGas(provider, chain, tx);

    return {
      success: true,
      estimatedFee: gasEstimate.estimatedCost,
      gasLimit: gasEstimate.gasLimit.toString()
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
