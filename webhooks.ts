import { Router, Request, Response } from 'express';
import crypto from 'crypto';

const router = Router();

// In-memory transaction status store (replace with Redis/DB in production)
interface TransactionStatus {
  txHash: string;
  status: 'pending' | 'confirmed' | 'failed';
  confirmations: number;
  chain: string;
  timestamp: Date;
  fromAddress?: string;
  toAddress?: string;
  amount?: string;
  blockNumber?: number;
  blockHash?: string;
}

const transactionStatuses: Map<string, TransactionStatus> = new Map();

// Notification callbacks (to be used with SSE or WebSocket in production)
type NotificationCallback = (data: TransactionStatus) => void;
const notificationCallbacks: NotificationCallback[] = [];

export function registerNotificationCallback(callback: NotificationCallback): void {
  notificationCallbacks.push(callback);
}

function notifyListeners(data: TransactionStatus): void {
  notificationCallbacks.forEach(cb => {
    try {
      cb(data);
    } catch (e) {
      console.error('[Webhooks] Notification callback error:', e);
    }
  });
}

// ==================== ALCHEMY WEBHOOK ====================

function verifyAlchemySignature(body: string, signature: string): boolean {
  const signingKey = process.env.ALCHEMY_WEBHOOK_SIGNING_KEY;
  if (!signingKey) {
    console.warn('[Webhooks] No Alchemy signing key configured, skipping verification');
    return true; // Allow in development
  }
  
  const hmac = crypto.createHmac('sha256', signingKey);
  hmac.update(body, 'utf8');
  const expectedSignature = hmac.digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

router.post('/alchemy', async (req: Request, res: Response) => {
  try {
    const signature = req.headers['x-alchemy-signature'] as string;
    const rawBody = JSON.stringify(req.body);
    
    // Verify signature in production
    if (process.env.NODE_ENV === 'production' && !verifyAlchemySignature(rawBody, signature)) {
      console.error('[Webhooks] Invalid Alchemy signature');
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    const { webhookId, id, createdAt, type, event } = req.body;
    
    console.log(`[Webhooks] Alchemy webhook received: ${type}`, {
      webhookId,
      id,
      createdAt
    });

    // Handle different webhook types
    switch (type) {
      case 'ADDRESS_ACTIVITY': {
        const { network, activity } = event;
        
        for (const tx of activity || []) {
          const txStatus: TransactionStatus = {
            txHash: tx.hash,
            status: tx.blockNum ? 'confirmed' : 'pending',
            confirmations: tx.blockNum ? 1 : 0,
            chain: network.toUpperCase(),
            timestamp: new Date(),
            fromAddress: tx.fromAddress,
            toAddress: tx.toAddress,
            amount: tx.value?.toString(),
            blockNumber: parseInt(tx.blockNum, 16),
            blockHash: tx.blockHash
          };
          
          transactionStatuses.set(tx.hash, txStatus);
          notifyListeners(txStatus);
          
          console.log(`[Webhooks] Transaction ${tx.hash} status: ${txStatus.status}`);
        }
        break;
      }
      
      case 'MINED_TRANSACTION': {
        const { transaction } = event;
        const txStatus: TransactionStatus = {
          txHash: transaction.hash,
          status: 'confirmed',
          confirmations: 1,
          chain: event.network?.toUpperCase() || 'ETHEREUM',
          timestamp: new Date(),
          fromAddress: transaction.from,
          toAddress: transaction.to,
          amount: transaction.value,
          blockNumber: parseInt(transaction.blockNumber, 16),
          blockHash: transaction.blockHash
        };
        
        transactionStatuses.set(transaction.hash, txStatus);
        notifyListeners(txStatus);
        break;
      }
      
      case 'DROPPED_TRANSACTION': {
        const { transaction } = event;
        const txStatus: TransactionStatus = {
          txHash: transaction.hash,
          status: 'failed',
          confirmations: 0,
          chain: event.network?.toUpperCase() || 'ETHEREUM',
          timestamp: new Date(),
          fromAddress: transaction.from,
          toAddress: transaction.to
        };
        
        transactionStatuses.set(transaction.hash, txStatus);
        notifyListeners(txStatus);
        break;
      }
      
      default:
        console.log(`[Webhooks] Unhandled Alchemy webhook type: ${type}`);
    }

    res.json({ success: true, received: true });
  } catch (error: any) {
    console.error('[Webhooks] Alchemy webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== CRYPTOAPIS WEBHOOK ====================

function verifyCryptoApisSignature(body: string, signature: string): boolean {
  const signingKey = process.env.CRYPTOAPIS_WEBHOOK_SECRET;
  if (!signingKey) {
    console.warn('[Webhooks] No CryptoAPIs signing key configured, skipping verification');
    return true;
  }
  
  const hmac = crypto.createHmac('sha512', signingKey);
  hmac.update(body, 'utf8');
  const expectedSignature = hmac.digest('hex');
  
  return signature === expectedSignature;
}

router.post('/cryptoapis', async (req: Request, res: Response) => {
  try {
    const signature = req.headers['x-signature'] as string;
    const rawBody = JSON.stringify(req.body);
    
    // Verify signature in production
    if (process.env.NODE_ENV === 'production' && !verifyCryptoApisSignature(rawBody, signature)) {
      console.error('[Webhooks] Invalid CryptoAPIs signature');
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    const { apiVersion, referenceId, idempotencyKey, data } = req.body;
    const { event, item } = data || {};
    
    console.log(`[Webhooks] CryptoAPIs webhook received: ${event}`, {
      referenceId,
      idempotencyKey,
      apiVersion
    });

    // Map CryptoAPIs blockchain to our chain names
    const chainMap: Record<string, string> = {
      'bitcoin': 'BITCOIN',
      'litecoin': 'LITECOIN',
      'dogecoin': 'DOGECOIN',
      'ethereum': 'ETHEREUM',
      'binance-smart-chain': 'BSC',
      'polygon': 'POLYGON'
    };

    switch (event) {
      case 'CONFIRMED_TX': {
        const txStatus: TransactionStatus = {
          txHash: item.transactionId,
          status: 'confirmed',
          confirmations: item.confirmations || 1,
          chain: chainMap[item.blockchain] || item.blockchain.toUpperCase(),
          timestamp: new Date(item.timestamp * 1000),
          fromAddress: item.senders?.[0]?.address,
          toAddress: item.recipients?.[0]?.address,
          amount: item.amount,
          blockNumber: item.minedInBlockHeight,
          blockHash: item.minedInBlockHash
        };
        
        transactionStatuses.set(item.transactionId, txStatus);
        notifyListeners(txStatus);
        
        console.log(`[Webhooks] UTXO Transaction ${item.transactionId} confirmed with ${item.confirmations} confirmations`);
        break;
      }
      
      case 'UNCONFIRMED_TX': {
        const txStatus: TransactionStatus = {
          txHash: item.transactionId,
          status: 'pending',
          confirmations: 0,
          chain: chainMap[item.blockchain] || item.blockchain.toUpperCase(),
          timestamp: new Date(),
          fromAddress: item.senders?.[0]?.address,
          toAddress: item.recipients?.[0]?.address,
          amount: item.amount
        };
        
        transactionStatuses.set(item.transactionId, txStatus);
        notifyListeners(txStatus);
        break;
      }
      
      case 'ADDRESS_COINS_TRANSACTION_CONFIRMED':
      case 'ADDRESS_TOKENS_TRANSACTION_CONFIRMED': {
        const txStatus: TransactionStatus = {
          txHash: item.transactionHash || item.transactionId,
          status: 'confirmed',
          confirmations: item.confirmations || 6,
          chain: chainMap[item.blockchain] || item.blockchain.toUpperCase(),
          timestamp: new Date(item.timestamp * 1000),
          fromAddress: item.sender,
          toAddress: item.recipient,
          amount: item.amount,
          blockNumber: item.blockHeight,
          blockHash: item.blockHash
        };
        
        transactionStatuses.set(txStatus.txHash, txStatus);
        notifyListeners(txStatus);
        break;
      }
      
      default:
        console.log(`[Webhooks] Unhandled CryptoAPIs event: ${event}`);
    }

    res.json({ success: true, received: true });
  } catch (error: any) {
    console.error('[Webhooks] CryptoAPIs webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== QUIDAX WEBHOOK ====================

function verifyQuidaxSignature(body: string, signature: string): boolean {
  const signingKey = process.env.QUIDAX_WEBHOOK_SECRET;
  if (!signingKey) {
    console.warn('[Webhooks] No Quidax signing key configured, skipping verification');
    return true;
  }
  
  const hmac = crypto.createHmac('sha256', signingKey);
  hmac.update(body, 'utf8');
  const expectedSignature = hmac.digest('hex');
  
  return signature === expectedSignature;
}

router.post('/quidax', async (req: Request, res: Response) => {
  try {
    const signature = req.headers['x-quidax-signature'] as string;
    const rawBody = JSON.stringify(req.body);
    
    // Verify signature in production
    if (process.env.NODE_ENV === 'production' && !verifyQuidaxSignature(rawBody, signature)) {
      console.error('[Webhooks] Invalid Quidax signature');
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    const { event, data } = req.body;
    
    console.log(`[Webhooks] Quidax webhook received: ${event}`, data);

    switch (event) {
      case 'deposit.successful': {
        const txStatus: TransactionStatus = {
          txHash: data.txid || data.id,
          status: 'confirmed',
          confirmations: data.confirmations || 1,
          chain: data.currency?.toUpperCase() || 'UNKNOWN',
          timestamp: new Date(data.created_at || Date.now()),
          toAddress: data.address,
          amount: data.amount
        };
        
        transactionStatuses.set(txStatus.txHash, txStatus);
        notifyListeners(txStatus);
        
        console.log(`[Webhooks] Quidax deposit confirmed: ${data.amount} ${data.currency}`);
        break;
      }
      
      case 'withdraw.successful': {
        const txStatus: TransactionStatus = {
          txHash: data.txid || data.id,
          status: 'confirmed',
          confirmations: 1,
          chain: data.currency?.toUpperCase() || 'UNKNOWN',
          timestamp: new Date(data.done_at || Date.now()),
          toAddress: data.fund_uid,
          amount: data.amount
        };
        
        transactionStatuses.set(txStatus.txHash, txStatus);
        notifyListeners(txStatus);
        
        console.log(`[Webhooks] Quidax withdrawal confirmed: ${data.amount} ${data.currency}`);
        break;
      }
      
      case 'withdraw.failed': {
        const txStatus: TransactionStatus = {
          txHash: data.id,
          status: 'failed',
          confirmations: 0,
          chain: data.currency?.toUpperCase() || 'UNKNOWN',
          timestamp: new Date(),
          toAddress: data.fund_uid,
          amount: data.amount
        };
        
        transactionStatuses.set(data.id, txStatus);
        notifyListeners(txStatus);
        break;
      }
      
      case 'trade.successful': {
        console.log(`[Webhooks] Quidax trade completed:`, {
          bid: data.bid,
          ask: data.ask,
          volume: data.volume,
          price: data.price
        });
        break;
      }
      
      default:
        console.log(`[Webhooks] Unhandled Quidax event: ${event}`);
    }

    res.json({ success: true, received: true });
  } catch (error: any) {
    console.error('[Webhooks] Quidax webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== TRONGRID WEBHOOK (TRC20) ====================

router.post('/trongrid', async (req: Request, res: Response) => {
  try {
    const { event, transaction } = req.body;
    
    console.log(`[Webhooks] TronGrid webhook received:`, { event });

    if (transaction) {
      const txStatus: TransactionStatus = {
        txHash: transaction.txID || transaction.hash,
        status: transaction.ret?.[0]?.contractRet === 'SUCCESS' ? 'confirmed' : 'pending',
        confirmations: transaction.ret?.[0]?.contractRet === 'SUCCESS' ? 1 : 0,
        chain: 'TRON',
        timestamp: new Date(transaction.raw_data?.timestamp || Date.now()),
        fromAddress: transaction.raw_data?.contract?.[0]?.parameter?.value?.owner_address,
        toAddress: transaction.raw_data?.contract?.[0]?.parameter?.value?.to_address,
        amount: transaction.raw_data?.contract?.[0]?.parameter?.value?.amount?.toString()
      };
      
      transactionStatuses.set(txStatus.txHash, txStatus);
      notifyListeners(txStatus);
    }

    res.json({ success: true, received: true });
  } catch (error: any) {
    console.error('[Webhooks] TronGrid webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== TRANSACTION STATUS QUERY ====================

router.get('/status/:txHash', (req: Request, res: Response) => {
  const { txHash } = req.params;
  const status = transactionStatuses.get(txHash);
  
  if (status) {
    res.json({ success: true, data: status });
  } else {
    res.status(404).json({ success: false, error: 'Transaction not found' });
  }
});

router.get('/statuses', (req: Request, res: Response) => {
  const chain = req.query.chain as string | undefined;
  const status = req.query.status as string | undefined;
  
  let results = Array.from(transactionStatuses.values());
  
  if (chain) {
    results = results.filter(tx => tx.chain === chain.toUpperCase());
  }
  
  if (status) {
    results = results.filter(tx => tx.status === status);
  }
  
  // Return most recent first
  results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  
  res.json({ success: true, data: results.slice(0, 100) });
});

export default router;
