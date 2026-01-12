// @ts-ignore - TronWeb doesn't have proper TypeScript types
import TronWeb from 'tronweb';
import { decrypt } from '../utils/encryption';

// ==================== CONFIGURATION ====================
const TRONGRID_API_KEY = process.env.TRONGRID_API_KEY || '';

const TRON_ENDPOINTS = [
  'https://api.trongrid.io',
  'https://api.tronstack.io'
];

const TRC20_TOKENS: Record<string, { address: string; decimals: number }> = {
  USDT: { address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', decimals: 6 },
  USDC: { address: 'TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8', decimals: 6 }
};

// ==================== TRONWEB INSTANCE ====================

function getTronWeb(privateKey?: string): any {
  const headers: Record<string, string> = {};
  if (TRONGRID_API_KEY) {
    headers['TRON-PRO-API-KEY'] = TRONGRID_API_KEY;
  }

  return new TronWeb({
    fullHost: TRON_ENDPOINTS[0],
    headers,
    privateKey: privateKey || undefined
  });
}

// ==================== TRANSACTION SENDING ====================

export interface TronSendResult {
  success: boolean;
  txHash?: string;
  explorerUrl?: string;
  error?: string;
  retryable?: boolean;
}

export async function sendTronTransaction(
  encryptedPrivateKey: string,
  toAddress: string,
  amount: string,
  symbol: string
): Promise<TronSendResult> {
  try {
    // Decrypt private key
    const privateKey = decrypt(encryptedPrivateKey);
    if (!privateKey || privateKey.length < 64) {
      return { success: false, error: 'Invalid or corrupted private key', retryable: false };
    }

    const tronWeb = getTronWeb(privateKey);
    const fromAddress = tronWeb.address.fromPrivateKey(privateKey);

    console.log(`[TronTxManager] Sending ${amount} ${symbol} from ${fromAddress} to ${toAddress}`);

    // Parse amount
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return { success: false, error: 'Invalid amount', retryable: false };
    }

    // Validate addresses
    if (!tronWeb.isAddress(fromAddress) || !tronWeb.isAddress(toAddress)) {
      return { success: false, error: 'Invalid TRON address', retryable: false };
    }

    let txHash: string;

    if (symbol === 'TRX') {
      // Native TRX transfer
      const amountSun = Math.floor(numAmount * 1e6);
      
      // Check balance
      const balance = await tronWeb.trx.getBalance(fromAddress);
      if (balance < amountSun) {
        return {
          success: false,
          error: `Insufficient TRX balance. Have: ${balance / 1e6}, Need: ${numAmount}`,
          retryable: false
        };
      }

      // Create and sign transaction
      const tx = await tronWeb.transactionBuilder.sendTrx(toAddress, amountSun, fromAddress);
      const signedTx = await tronWeb.trx.sign(tx, privateKey);
      const result = await tronWeb.trx.sendRawTransaction(signedTx);

      if (result.result) {
        txHash = result.txid;
      } else {
        return {
          success: false,
          error: result.message || 'Transaction failed',
          retryable: true
        };
      }
    } else if (TRC20_TOKENS[symbol]) {
      // TRC20 token transfer
      const tokenConfig = TRC20_TOKENS[symbol];
      const tokenAmount = Math.floor(numAmount * Math.pow(10, tokenConfig.decimals));

      // Check TRX balance for fees (need ~15-30 TRX for energy)
      const trxBalance = await tronWeb.trx.getBalance(fromAddress);
      if (trxBalance < 15 * 1e6) {
        return {
          success: false,
          error: `Insufficient TRX for network fees. Need at least 15 TRX, have: ${trxBalance / 1e6}`,
          retryable: false
        };
      }

      // Get token contract
      const contract = await tronWeb.contract().at(tokenConfig.address);
      
      // Check token balance
      const tokenBalance = await contract.balanceOf(fromAddress).call();
      if (Number(tokenBalance) < tokenAmount) {
        return {
          success: false,
          error: `Insufficient ${symbol} balance`,
          retryable: false
        };
      }

      // Send TRC20
      const result = await contract.transfer(toAddress, tokenAmount).send({
        feeLimit: 150000000, // 150 TRX max fee
        callValue: 0,
        shouldPollResponse: false
      });

      txHash = result;
    } else {
      return { success: false, error: `Unsupported token: ${symbol}`, retryable: false };
    }

    console.log(`[TronTxManager] Transaction sent: ${txHash}`);

    return {
      success: true,
      txHash,
      explorerUrl: `https://tronscan.org/#/transaction/${txHash}`
    };

  } catch (error: any) {
    console.error('[TronTxManager] Transaction error:', error);
    
    const message = error.message || String(error);
    
    // Decode hex error messages
    let decodedMessage = message;
    if (/^[0-9a-fA-F]+$/.test(message) && message.length % 2 === 0) {
      try {
        const decoded: string[] = [];
        for (let i = 0; i < message.length; i += 2) {
          decoded.push(String.fromCharCode(parseInt(message.slice(i, i + 2), 16)));
        }
        decodedMessage = decoded.join('').replace(/[^\x20-\x7E]/g, '').trim();
      } catch {}
    }

    const isRetryable = decodedMessage.includes('timeout') ||
                       decodedMessage.includes('network') ||
                       decodedMessage.includes('bandwidth');

    return {
      success: false,
      error: decodedMessage,
      retryable: isRetryable
    };
  }
}

// ==================== BALANCE FETCHING ====================

export async function getTronBalance(
  address: string,
  symbol: string
): Promise<{ balance: string; error?: string }> {
  try {
    const tronWeb = getTronWeb();

    if (symbol === 'TRX') {
      const balance = await tronWeb.trx.getBalance(address);
      return { balance: (balance / 1e6).toString() };
    } else if (TRC20_TOKENS[symbol]) {
      const tokenConfig = TRC20_TOKENS[symbol];
      const contract = await tronWeb.contract().at(tokenConfig.address);
      const balance = await contract.balanceOf(address).call();
      return { balance: (Number(balance) / Math.pow(10, tokenConfig.decimals)).toString() };
    } else {
      return { balance: '0', error: `Unknown token: ${symbol}` };
    }
  } catch (error: any) {
    console.error('[TronTxManager] Balance error:', error.message);
    return { balance: '0', error: error.message };
  }
}

// ==================== GAS/ENERGY ESTIMATION ====================

export async function estimateTronFee(
  fromAddress: string,
  toAddress: string,
  amount: string,
  symbol: string
): Promise<{ estimatedFee: string; energyNeeded?: number; bandwidthNeeded?: number }> {
  try {
    const tronWeb = getTronWeb();
    
    if (symbol === 'TRX') {
      // TRX transfers cost bandwidth (free if account has enough)
      const bandwidth = await tronWeb.trx.getBandwidth(fromAddress);
      const bandwidthNeeded = 265; // Typical TRX transfer
      
      if (bandwidth >= bandwidthNeeded) {
        return { estimatedFee: '0', bandwidthNeeded };
      } else {
        // ~0.001 TRX per bandwidth point burned
        return { estimatedFee: ((bandwidthNeeded - bandwidth) * 0.001).toString(), bandwidthNeeded };
      }
    } else {
      // TRC20 transfers need energy
      const energyNeeded = 65000; // Typical TRC20 transfer
      // ~420 SUN per energy (approximately 0.025 TRX per 1000 energy)
      const estimatedFee = (energyNeeded * 420 / 1e6).toString();
      
      return { estimatedFee, energyNeeded };
    }
  } catch (error) {
    // Default fallback
    return { estimatedFee: symbol === 'TRX' ? '0.1' : '20' };
  }
}
