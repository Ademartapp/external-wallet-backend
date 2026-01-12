import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { generateEVMWallet, getEVMBalance, validateEVMAddress } from '../services/alchemy';
import { generateBTCWallet, generateLTCWallet, generateDOGEWallet, getUTXOBalance } from '../services/cryptoapis';
import { generateTRONWallet, getTRONBalance, validateTRONAddress } from '../services/tron';
import { encrypt } from '../utils/encryption';

const router = Router();

// Apply auth to all routes
router.use(authMiddleware);

interface GenerateRequest {
  symbol: string;
  chain: string;
  userId: string;
}

interface BalanceRequest {
  address: string;
  chain: string;
  symbol: string;
}

interface ValidateRequest {
  address: string;
  chain: string;
}

// Generate wallet
router.post('/generate', async (req: Request<{}, {}, GenerateRequest>, res: Response) => {
  try {
    const { symbol, chain, userId } = req.body;

    if (!symbol || !chain || !userId) {
      res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: symbol, chain, userId' 
      });
      return;
    }

    let walletData: { address: string; privateKey: string; xpub?: string };

    switch (chain.toUpperCase()) {
      case 'ETHEREUM':
      case 'BSC':
      case 'POLYGON':
        walletData = await generateEVMWallet();
        break;
      case 'BITCOIN':
        walletData = await generateBTCWallet();
        break;
      case 'LITECOIN':
        walletData = await generateLTCWallet();
        break;
      case 'DOGECOIN':
        walletData = await generateDOGEWallet();
        break;
      case 'TRON':
        walletData = await generateTRONWallet();
        break;
      default:
        res.status(400).json({ 
          success: false, 
          error: `Unsupported chain: ${chain}` 
        });
        return;
    }

    const encryptedPrivateKey = encrypt(walletData.privateKey);

    res.json({
      success: true,
      data: {
        address: walletData.address,
        encryptedPrivateKey,
        chain: chain.toUpperCase(),
        symbol: symbol.toUpperCase(),
        xpub: walletData.xpub || null
      }
    });
  } catch (error) {
    console.error('Wallet generation error:', error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to generate wallet' 
    });
  }
});

// Get balance
router.post('/balance', async (req: Request<{}, {}, BalanceRequest>, res: Response) => {
  try {
    const { address, chain, symbol } = req.body;

    if (!address || !chain || !symbol) {
      res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: address, chain, symbol' 
      });
      return;
    }

    let balance: string;

    switch (chain.toUpperCase()) {
      case 'ETHEREUM':
      case 'BSC':
      case 'POLYGON':
        balance = await getEVMBalance(address, chain.toUpperCase());
        break;
      case 'BITCOIN':
      case 'LITECOIN':
      case 'DOGECOIN':
        balance = await getUTXOBalance(address, chain.toUpperCase());
        break;
      case 'TRON':
        balance = await getTRONBalance(address);
        break;
      default:
        res.status(400).json({ 
          success: false, 
          error: `Unsupported chain: ${chain}` 
        });
        return;
    }

    res.json({
      success: true,
      data: {
        address,
        chain: chain.toUpperCase(),
        symbol: symbol.toUpperCase(),
        balance
      }
    });
  } catch (error) {
    console.error('Balance fetch error:', error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to fetch balance' 
    });
  }
});

// Validate address
router.post('/validate', async (req: Request<{}, {}, ValidateRequest>, res: Response) => {
  try {
    const { address, chain } = req.body;

    if (!address || !chain) {
      res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: address, chain' 
      });
      return;
    }

    let isValid = false;

    switch (chain.toUpperCase()) {
      case 'ETHEREUM':
      case 'BSC':
      case 'POLYGON':
        isValid = validateEVMAddress(address);
        break;
      case 'BITCOIN':
        isValid = /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,39}$/.test(address);
        break;
      case 'LITECOIN':
        isValid = /^[LM3][a-km-zA-HJ-NP-Z1-9]{26,33}$/.test(address) || 
                  /^ltc1[a-z0-9]{39,59}$/.test(address);
        break;
      case 'DOGECOIN':
        isValid = /^D[5-9A-HJ-NP-U][1-9A-HJ-NP-Za-km-z]{32}$/.test(address);
        break;
      case 'TRON':
        isValid = validateTRONAddress(address);
        break;
      default:
        res.status(400).json({ 
          success: false, 
          error: `Unsupported chain: ${chain}` 
        });
        return;
    }

    res.json({
      success: true,
      data: {
        address,
        chain: chain.toUpperCase(),
        isValid
      }
    });
  } catch (error) {
    console.error('Validation error:', error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to validate address' 
    });
  }
});

export default router;
