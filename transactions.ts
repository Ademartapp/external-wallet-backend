import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { 
  sendEVMTransaction, 
  queueTransaction, 
  processQueuedTransaction,
  getQueuedTransaction,
  getQueueStats,
  getEVMBalanceRobust,
  estimateTransactionFee
} from '../services/transactionManager';
import { sendTronTransaction, getTronBalance, estimateTronFee } from '../services/tronTransactionManager';
import { sendUTXOTransaction, getUTXOBalance, estimateUTXOFee, registerUTXOWebhook } from '../services/utxoTransactionManager';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Apply auth to all routes
router.use(authMiddleware);

// Chain type detection
function getChainType(chain: string): 'evm' | 'tron' | 'utxo' {
  const evmChains = ['ETHEREUM', 'BSC', 'POLYGON'];
  const utxoChains = ['BITCOIN', 'LITECOIN', 'DOGECOIN'];
  
  if (evmChains.includes(chain.toUpperCase())) return 'evm';
  if (chain.toUpperCase() === 'TRON') return 'tron';
  if (utxoChains.includes(chain.toUpperCase())) return 'utxo';
  
  throw new Error(`Unsupported chain: ${chain}`);
}

// ==================== SEND TRANSACTION ====================
router.post('/send', async (req: Request, res: Response) => {
  try {
    const { 
      chain, 
      symbol, 
      toAddress, 
      amount, 
      encryptedPrivateKey,
      encryptedXpub,
      encryptedWif,
      feeLevel = 'standard',
      useQueue = false 
    } = req.body;

    if (!chain || !symbol || !toAddress || !amount) {
      res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: chain, symbol, toAddress, amount' 
      });
      return;
    }

    const chainType = getChainType(chain);

    // Validate we have the right keys for chain type
    if (chainType === 'evm' || chainType === 'tron') {
      if (!encryptedPrivateKey) {
        res.status(400).json({ success: false, error: 'Missing encryptedPrivateKey' });
        return;
      }
    } else if (chainType === 'utxo') {
      if (!encryptedXpub || !encryptedWif) {
        res.status(400).json({ success: false, error: 'Missing encryptedXpub or encryptedWif' });
        return;
      }
    }

    console.log(`[Transactions] Send request: ${amount} ${symbol} on ${chain} to ${toAddress}`);

    let result;

    if (chainType === 'evm') {
      if (useQueue) {
        const queueId = queueTransaction(
          uuidv4(),
          chain.toUpperCase(),
          '', // from address not needed, derived from private key
          toAddress,
          amount,
          symbol.toUpperCase(),
          encryptedPrivateKey
        );
        result = await processQueuedTransaction(queueId);
      } else {
        result = await sendEVMTransaction(
          chain.toUpperCase(),
          encryptedPrivateKey,
          toAddress,
          amount,
          symbol.toUpperCase(),
          feeLevel
        );
      }
    } else if (chainType === 'tron') {
      result = await sendTronTransaction(
        encryptedPrivateKey,
        toAddress,
        amount,
        symbol.toUpperCase()
      );
    } else if (chainType === 'utxo') {
      result = await sendUTXOTransaction(
        chain.toUpperCase(),
        encryptedXpub,
        encryptedWif,
        toAddress,
        amount,
        feeLevel
      );
    }

    if (result?.success) {
      res.json({
        success: true,
        txHash: result.txHash,
        explorerUrl: result.explorerUrl
      });
    } else {
      res.status(result?.retryable ? 503 : 400).json({
        success: false,
        error: result?.error || 'Transaction failed',
        retryable: result?.retryable,
        queueId: result?.queueId
      });
    }
  } catch (error: any) {
    console.error('[Transactions] Send error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Transaction failed' 
    });
  }
});

// ==================== GET BALANCE ====================
router.post('/balance', async (req: Request, res: Response) => {
  try {
    const { chain, address, symbol } = req.body;

    if (!chain || !address || !symbol) {
      res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: chain, address, symbol' 
      });
      return;
    }

    const chainType = getChainType(chain);
    let result;

    if (chainType === 'evm') {
      result = await getEVMBalanceRobust(chain.toUpperCase(), address, symbol.toUpperCase());
    } else if (chainType === 'tron') {
      result = await getTronBalance(address, symbol.toUpperCase());
    } else if (chainType === 'utxo') {
      result = await getUTXOBalance(chain.toUpperCase(), address);
    }

    res.json({
      success: true,
      balance: result?.balance || '0',
      chain: chain.toUpperCase(),
      symbol: symbol.toUpperCase(),
      address
    });
  } catch (error: any) {
    console.error('[Transactions] Balance error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      balance: '0'
    });
  }
});

// ==================== ESTIMATE FEE ====================
router.post('/estimate-fee', async (req: Request, res: Response) => {
  try {
    const { chain, from, to, amount, symbol } = req.body;

    if (!chain || !amount) {
      res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: chain, amount' 
      });
      return;
    }

    const chainType = getChainType(chain);
    let estimate;

    if (chainType === 'evm') {
      estimate = await estimateTransactionFee(
        chain.toUpperCase(),
        from || '0x0000000000000000000000000000000000000000',
        to || '0x0000000000000000000000000000000000000000',
        amount,
        symbol?.toUpperCase() || chain.toUpperCase()
      );
    } else if (chainType === 'tron') {
      estimate = await estimateTronFee(
        from || 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb',
        to || 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb',
        amount,
        symbol?.toUpperCase() || 'TRX'
      );
    } else if (chainType === 'utxo') {
      estimate = await estimateUTXOFee(
        chain.toUpperCase(),
        from || '',
        to || '',
        amount
      );
    }

    res.json({
      success: true,
      ...estimate
    });
  } catch (error: any) {
    console.error('[Transactions] Fee estimate error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ==================== QUEUE STATUS ====================
router.get('/queue/stats', async (_req: Request, res: Response) => {
  try {
    const stats = getQueueStats();
    res.json({ success: true, ...stats });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/queue/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const queuedTx = getQueuedTransaction(id);
    
    if (!queuedTx) {
      res.status(404).json({ success: false, error: 'Transaction not found in queue' });
      return;
    }

    res.json({
      success: true,
      transaction: {
        id: queuedTx.id,
        chain: queuedTx.chain,
        to: queuedTx.to,
        amount: queuedTx.amount,
        symbol: queuedTx.symbol,
        retryCount: queuedTx.retryCount,
        maxRetries: queuedTx.maxRetries,
        lastError: queuedTx.lastError,
        nextRetryAt: queuedTx.nextRetryAt
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/queue/:id/retry', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await processQueuedTransaction(id);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== WEBHOOK REGISTRATION ====================
router.post('/webhook/register', async (req: Request, res: Response) => {
  try {
    const { chain, address, callbackUrl } = req.body;

    if (!chain || !address || !callbackUrl) {
      res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: chain, address, callbackUrl' 
      });
      return;
    }

    const chainType = getChainType(chain);

    if (chainType === 'utxo') {
      const result = await registerUTXOWebhook(
        chain.toUpperCase(),
        address,
        callbackUrl,
        'confirmed'
      );
      
      res.json({
        success: !result.error,
        webhookId: result.webhookId,
        error: result.error
      });
    } else {
      // EVM and TRON webhooks are handled via Alchemy/TronGrid notification services
      res.json({
        success: true,
        message: 'Webhook registration for EVM/TRON chains should be done via Alchemy/TronGrid dashboard'
      });
    }
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
