# Wallet Backend (TypeScript)

Production-ready TypeScript backend using **Alchemy SDK** + **CryptoAPIs**.

## Supported Chains

| Chain | Symbol | Provider |
|-------|--------|----------|
| Ethereum | ETH | Alchemy |
| Polygon | MATIC | Alchemy |
| BNB Smart Chain | BNB | Public RPC |
| Bitcoin | BTC | CryptoAPIs |
| Litecoin | LTC | CryptoAPIs |
| Dogecoin | DOGE | CryptoAPIs |
| TRON | TRX | TronGrid |

---

## 🚀 Render Deployment

### Step 1: Download & Push to GitHub

1. Download the `external-wallet-backend` folder
2. Create a new GitHub repo and push:

```bash
cd external-wallet-backend
git init
git add .
git commit -m "Initial wallet backend"
git remote add origin https://github.com/YOUR_USERNAME/wallet-backend.git
git push -u origin main
```

### Step 2: Deploy on Render

1. Go to [render.com](https://render.com)
2. Click **New → Web Service**
3. Connect your GitHub repo
4. Configure:
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
5. Add environment variables (see below)
6. Click **Deploy**

### Step 3: Get Your URL

Render provides: `https://wallet-backend-xxxx.onrender.com`

---

## 🔐 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `WALLET_BACKEND_TOKEN` | Auth token for API calls | ✅ |
| `ENCRYPTION_KEY` | 32-char key for encrypting private keys | ✅ |
| `ALCHEMY_API_KEY` | Alchemy key for ETH/MATIC | ✅ |
| `CRYPTOAPIS_API_KEY` | CryptoAPIs key for BTC/LTC/DOGE | ✅ |
| `TRONGRID_API_KEY` | TronGrid key (optional) | ❌ |
| `NETWORK` | `mainnet` or `testnet` | ✅ |
| `ALLOWED_ORIGINS` | CORS origins | ✅ |

### Generate Secure Keys

```bash
# WALLET_BACKEND_TOKEN (64-char hex)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# ENCRYPTION_KEY (32-char)
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

---

## 📡 API Endpoints

### Health Check
```
GET /health
```

### Generate Wallet
```
POST /api/wallet/generate
Authorization: Bearer YOUR_TOKEN

{
  "symbol": "ETH",
  "chain": "ETHEREUM",
  "userId": "user-uuid"
}
```

### Get Balance
```
POST /api/wallet/balance
Authorization: Bearer YOUR_TOKEN

{
  "address": "0x...",
  "chain": "ETHEREUM",
  "symbol": "ETH"
}
```

### Validate Address
```
POST /api/wallet/validate
Authorization: Bearer YOUR_TOKEN

{
  "address": "0x...",
  "chain": "ETHEREUM"
}
```

---

## 🔒 Security

- Bearer token authentication
- AES-256 private key encryption
- CORS protection
- Helmet.js security headers
- Mainnet only (production)

---

## After Deployment

Add to Lovable secrets:
- `WALLET_BACKEND_URL`: Your Render URL
- `WALLET_BACKEND_TOKEN`: Same token from Render
