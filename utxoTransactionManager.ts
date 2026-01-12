import axios from 'axios';
import { decrypt } from '../utils/encryption';

// ==================== CONFIGURATION ====================
const CRYPTOAPIS_BASE = 'https://rest.cryptoapis.io/v2';
const CRYPTOAPIS_API_KEY = process.env.CRYPTOAPIS_API_KEY || '';

const CHAIN_CONFIG: Record<string, {
  blockchain: string;
  network: string;
  explorer: string;
  minConfirmations: number;
}> = {
  BITCOIN: {
    blockchain: 'bitcoin',
    network: process.env.NETWORK === 'testnet' ? 'testnet' : 'mainnet',
    explorer: 'https://blockstream.info/tx/',
    minConfirmations: 2
  },
  LITECOIN: {
    blockchain: 'litecoin',
    network: process.env.NETWORK === 'testnet' ? 'testnet' : 'mainnet',
    explorer: 'https://blockchair.com/litecoin/transaction/',
    minConfirmations: 6
  },
  DOGECOIN: {
    blockchain: 'dogecoin',
    network: process.env.NETWORK === 'testnet' ? 'testnet' : 'mainnet',
    explorer: 'https://dogechain.info/tx/',
    minConfirmations: 6
  }
};

// ==================== CRYPTOAPIS HELPERS ====================

function getHeaders(): Record<string, string> {
  if (!CRYPTOAPIS_API_KEY) {
    throw new Error('CRYPTOAPIS_API_KEY not configured');
  }
  return {
    'Content-Type': 'application/json',
    'X-API-Key': CRYPTOAPIS_API_KEY
  };
}

// ==================== TRANSACTION SENDING ====================

export interface UTXOSendResult {
  success: boolean;
  txHash?: string;
  explorerUrl?: string;
  error?: string;
  retryable?: boolean;
}

export async function sendUTXOTransaction(
  chain: string,
  encryptedXpub: string,
  encryptedWif: string,
  toAddress: string,
  amount: string,
  feeLevel: 'slow' | 'standard' | 'fast' = 'standard'
): Promise<UTXOSendResult> {
  const config = CHAIN_CONFIG[chain];
  if (!config) {
    return { success: false, error: `Unsupported chain: ${chain}`, retryable: false };
  }

  try {
    // Decrypt keys
    const xpub = decrypt(encryptedXpub);
    const wif = decrypt(encryptedWif);

    if (!xpub || !wif) {
      return { success: false, error: 'Invalid or corrupted wallet keys', retryable: false };
    }

    console.log(`[UTXOTxManager] Sending ${amount} ${chain} to ${toAddress}`);

    // Create HD wallet transaction request via CryptoAPIs
    // CryptoAPIs handles UTXO selection, fee calculation, and signing internally
    const response = await axios.post(
      `${CRYPTOAPIS_BASE}/wallet-as-a-service/wallets/${xpub}/transactions/create-and-sign`,
      {
        blockchain: config.blockchain,
        network: config.network,
        recipients: [
          {
            address: toAddress,
            amount: amount
          }
        ],
        feeLevel,
        prepareStrategy: 'minimize-dust'
      },
      { headers: getHeaders() }
    );

    const txData = response.data?.data?.item;
    
    if (!txData?.transactionId) {
      console.error('[UTXOTxManager] No transaction ID in response:', response.data);
      return { 
        success: false, 
        error: 'Failed to create transaction', 
        retryable: true 
      };
    }

    // Broadcast the signed transaction
    const broadcastResponse = await axios.post(
      `${CRYPTOAPIS_BASE}/blockchain-tools/${config.blockchain}/${config.network}/transactions/broadcast`,
      {
        signedTransactionHex: txData.signedTransactionHex
      },
      { headers: getHeaders() }
    );

    const txHash = broadcastResponse.data?.data?.item?.transactionId;

    if (!txHash) {
      return {
        success: false,
        error: 'Failed to broadcast transaction',
        retryable: true
      };
    }

    console.log(`[UTXOTxManager] Transaction broadcast: ${txHash}`);

    return {
      success: true,
      txHash,
      explorerUrl: `${config.explorer}${txHash}`
    };

  } catch (error: any) {
    console.error('[UTXOTxManager] Transaction error:', error.response?.data || error.message);
    
    const message = error.response?.data?.error?.message || error.message || 'Unknown error';
    
    const isRetryable = message.includes('insufficient') === false &&
                       message.includes('invalid') === false;

    return {
      success: false,
      error: message,
      retryable: isRetryable
    };
  }
}

// Alternative: Use CryptoAPIs Transaction Request API for managed transactions
export async function createManagedUTXOTransaction(
  chain: string,
  fromAddress: string,
  toAddress: string,
  amount: string,
  callbackUrl: string
): Promise<{ requestId?: string; error?: string }> {
  const config = CHAIN_CONFIG[chain];
  if (!config) {
    return { error: `Unsupported chain: ${chain}` };
  }

  try {
    const response = await axios.post(
      `${CRYPTOAPIS_BASE}/wallet-as-a-service/transactions/create`,
      {
        blockchain: config.blockchain,
        network: config.network,
        senderAddress: fromAddress,
        recipients: [
          {
            address: toAddress,
            amount: amount
          }
        ],
        feeLevel: 'standard',
        callbackUrl
      },
      { headers: getHeaders() }
    );

    return { requestId: response.data?.data?.item?.transactionRequestId };
  } catch (error: any) {
    return { error: error.response?.data?.error?.message || error.message };
  }
}

// ==================== BALANCE FETCHING ====================

export async function getUTXOBalance(
  chain: string,
  address: string
): Promise<{ balance: string; error?: string }> {
  const config = CHAIN_CONFIG[chain];
  if (!config) {
    return { balance: '0', error: `Unsupported chain: ${chain}` };
  }

  try {
    const response = await axios.get(
      `${CRYPTOAPIS_BASE}/blockchain-data/${config.blockchain}/${config.network}/addresses/${address}/balance`,
      { headers: getHeaders() }
    );

    return { balance: response.data?.data?.item?.confirmedBalance?.amount || '0' };
  } catch (error: any) {
    console.error('[UTXOTxManager] Balance error:', error.response?.data || error.message);
    return { balance: '0', error: error.message };
  }
}

// ==================== FEE ESTIMATION ====================

export async function estimateUTXOFee(
  chain: string,
  fromAddress: string,
  toAddress: string,
  amount: string
): Promise<{ estimatedFee: string; feeRate: string; error?: string }> {
  const config = CHAIN_CONFIG[chain];
  if (!config) {
    return { estimatedFee: '0', feeRate: '0', error: `Unsupported chain: ${chain}` };
  }

  try {
    const response = await axios.post(
      `${CRYPTOAPIS_BASE}/blockchain-tools/${config.blockchain}/${config.network}/transactions/estimate-fee`,
      {
        senderAddress: fromAddress,
        recipients: [
          {
            address: toAddress,
            amount: amount
          }
        ],
        feeLevel: 'standard'
      },
      { headers: getHeaders() }
    );

    const item = response.data?.data?.item;
    return {
      estimatedFee: item?.estimatedFee || '0',
      feeRate: item?.feeRate || '0'
    };
  } catch (error: any) {
    console.error('[UTXOTxManager] Fee estimation error:', error.response?.data || error.message);
    
    // Return default estimates
    const defaults: Record<string, string> = {
      BITCOIN: '0.00005',
      LITECOIN: '0.001',
      DOGECOIN: '1'
    };
    
    return {
      estimatedFee: defaults[chain] || '0.001',
      feeRate: '0',
      error: 'Using default fee estimate'
    };
  }
}

// ==================== WEBHOOK REGISTRATION ====================

export async function registerUTXOWebhook(
  chain: string,
  address: string,
  callbackUrl: string,
  eventType: 'confirmed' | 'unconfirmed' = 'confirmed'
): Promise<{ webhookId?: string; error?: string }> {
  const config = CHAIN_CONFIG[chain];
  if (!config) {
    return { error: `Unsupported chain: ${chain}` };
  }

  try {
    const response = await axios.post(
      `${CRYPTOAPIS_BASE}/blockchain-events/${config.blockchain}/${config.network}/addresses/${address}`,
      {
        callbackUrl,
        confirmationsCount: eventType === 'confirmed' ? config.minConfirmations : 0,
        context: `${chain}-${address}`
      },
      { headers: getHeaders() }
    );

    return { webhookId: response.data?.data?.item?.referenceId };
  } catch (error: any) {
    // Webhook might already exist
    if (error.response?.status === 409) {
      return { webhookId: 'already-exists' };
    }
    return { error: error.response?.data?.error?.message || error.message };
  }
}
