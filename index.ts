import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import walletRoutes from './routes/wallet';
import transactionRoutes from './routes/transactions';
import quidaxRoutes from './routes/quidax';
import webhookRoutes from './routes/webhooks';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());

// CORS configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
  'http://localhost:5173',
  'http://localhost:8080'
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) {
      callback(null, true);
      return;
    }
    
    // Check exact match or lovable domains
    const isAllowed = allowedOrigins.some(allowed => origin.startsWith(allowed)) ||
                     origin.includes('.lovableproject.com') ||
                     origin.includes('.lovable.app');
    
    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));

// Request logging
app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    services: {
      alchemy: !!process.env.ALCHEMY_API_KEY,
      cryptoapis: !!process.env.CRYPTOAPIS_API_KEY,
      trongrid: !!process.env.TRONGRID_API_KEY,
      encryption: !!process.env.ENCRYPTION_KEY
    },
    endpoints: {
      wallet: '/api/wallet',
      transactions: '/api/transactions'
    }
  });
});

// Readiness check for container orchestration
app.get('/ready', async (_req: Request, res: Response) => {
  try {
    // Check critical environment variables
    const checks = {
      encryption_key: !!process.env.ENCRYPTION_KEY,
      backend_token: !!process.env.WALLET_BACKEND_TOKEN,
      any_provider: !!(process.env.ALCHEMY_API_KEY || process.env.CRYPTOAPIS_API_KEY)
    };
    
    const allPassed = Object.values(checks).every(Boolean);
    
    if (allPassed) {
      res.json({ ready: true, checks });
    } else {
      res.status(503).json({ ready: false, checks });
    }
  } catch (error) {
    res.status(503).json({ ready: false, error: 'Health check failed' });
  }
});

// API Routes
app.use('/api/wallet', walletRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/quidax', quidaxRoutes);
app.use('/api/webhooks', webhookRoutes);

// Error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ 
    success: false, 
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message 
  });
});

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ success: false, error: 'Endpoint not found' });
});

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════════╗
║                  WALLET BACKEND v3.0.0 STARTED                   ║
╠═══════════════════════════════════════════════════════════════════╣
║  Port: ${PORT}                                                        ║
║  Environment: ${process.env.NODE_ENV || 'development'}                                         ║
╠═══════════════════════════════════════════════════════════════════╣
║  Services:                                                        ║
║    • Alchemy:    ${process.env.ALCHEMY_API_KEY ? '✓ Configured' : '✗ Not configured'}                               ║
║    • CryptoAPIs: ${process.env.CRYPTOAPIS_API_KEY ? '✓ Configured' : '✗ Not configured'}                               ║
║    • TronGrid:   ${process.env.TRONGRID_API_KEY ? '✓ Configured' : '✗ Not configured'}                               ║
║    • Quidax:     ${process.env.QUIDAX_API_KEY ? '✓ Configured' : '✗ Not configured'}                               ║
║    • Encryption: ${process.env.ENCRYPTION_KEY ? '✓ Configured' : '✗ Not configured'}                               ║
╠═══════════════════════════════════════════════════════════════════╣
║  Wallet Endpoints:                                                ║
║    POST /api/wallet/generate         - Generate wallet            ║
║    POST /api/wallet/balance          - Get balance                ║
║    POST /api/wallet/validate         - Validate address           ║
╠═══════════════════════════════════════════════════════════════════╣
║  Transaction Endpoints:                                           ║
║    POST /api/transactions/send       - Send transaction           ║
║    POST /api/transactions/balance    - Get balance                ║
║    POST /api/transactions/estimate-fee - Estimate fees            ║
║    GET  /api/transactions/queue/stats - Queue statistics          ║
╠═══════════════════════════════════════════════════════════════════╣
║  Quidax Endpoints:                                                ║
║    GET  /api/quidax/wallets          - Get Quidax wallets         ║
║    POST /api/quidax/withdraw         - Create withdrawal          ║
║    POST /api/quidax/trade            - Execute trade              ║
║    POST /api/quidax/quote            - Get quote                  ║
║    GET  /api/quidax/markets          - Get markets                ║
╠═══════════════════════════════════════════════════════════════════╣
║  Webhook Endpoints:                                               ║
║    POST /api/webhooks/alchemy        - Alchemy webhooks           ║
║    POST /api/webhooks/cryptoapis     - CryptoAPIs webhooks        ║
║    POST /api/webhooks/quidax         - Quidax webhooks            ║
║    POST /api/webhooks/trongrid       - TronGrid webhooks          ║
║    GET  /api/webhooks/status/:txHash - Get transaction status     ║
╠═══════════════════════════════════════════════════════════════════╣
║  Health Endpoints:                                                ║
║    GET  /health                      - Health status              ║
║    GET  /ready                       - Readiness check            ║
╚═══════════════════════════════════════════════════════════════════╝
  `);
});
