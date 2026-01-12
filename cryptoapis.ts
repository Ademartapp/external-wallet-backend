import axios from 'axios';

const CRYPTOAPIS_BASE = 'https://rest.cryptoapis.io/v2';

const getApiKey = (): string => {
  const apiKey = process.env.CRYPTOAPIS_API_KEY;
  if (!apiKey) {
    throw new Error('CRYPTOAPIS_API_KEY not configured');
  }
  return apiKey;
};

const getNetwork = (): string => {
  return process.env.NETWORK === 'testnet' ? 'testnet' : 'mainnet';
};

interface CryptoApisWalletResponse {
  data: {
    item: {
      addresses: Array<{
        address: string;
      }>;
      extendedPrivateKey?: string;
      extendedPublicKey?: string;
    };
  };
}

interface CryptoApisBalanceResponse {
  data: {
    item: {
      confirmedBalance: {
        amount: string;
      };
    };
  };
}

export const generateBTCWallet = async (): Promise<{ address: string; privateKey: string; xpub?: string }> => {
  const apiKey = getApiKey();
  const network = getNetwork();

  const response = await axios.post<CryptoApisWalletResponse>(
    `${CRYPTOAPIS_BASE}/wallet-as-a-service/wallets/generate`,
    {
      blockchain: 'bitcoin',
      network,
      context: 'wallet-generation'
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey
      }
    }
  );

  const wallet = response.data.data.item;
  
  return {
    address: wallet.addresses[0]?.address || '',
    privateKey: wallet.extendedPrivateKey || '',
    xpub: wallet.extendedPublicKey
  };
};

export const generateLTCWallet = async (): Promise<{ address: string; privateKey: string; xpub?: string }> => {
  const apiKey = getApiKey();
  const network = getNetwork();

  const response = await axios.post<CryptoApisWalletResponse>(
    `${CRYPTOAPIS_BASE}/wallet-as-a-service/wallets/generate`,
    {
      blockchain: 'litecoin',
      network,
      context: 'wallet-generation'
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey
      }
    }
  );

  const wallet = response.data.data.item;
  
  return {
    address: wallet.addresses[0]?.address || '',
    privateKey: wallet.extendedPrivateKey || '',
    xpub: wallet.extendedPublicKey
  };
};

export const generateDOGEWallet = async (): Promise<{ address: string; privateKey: string; xpub?: string }> => {
  const apiKey = getApiKey();
  const network = getNetwork();

  const response = await axios.post<CryptoApisWalletResponse>(
    `${CRYPTOAPIS_BASE}/wallet-as-a-service/wallets/generate`,
    {
      blockchain: 'dogecoin',
      network,
      context: 'wallet-generation'
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey
      }
    }
  );

  const wallet = response.data.data.item;
  
  return {
    address: wallet.addresses[0]?.address || '',
    privateKey: wallet.extendedPrivateKey || '',
    xpub: wallet.extendedPublicKey
  };
};

export const getUTXOBalance = async (address: string, chain: string): Promise<string> => {
  const apiKey = getApiKey();
  const network = getNetwork();
  
  const blockchainMap: Record<string, string> = {
    'BITCOIN': 'bitcoin',
    'LITECOIN': 'litecoin',
    'DOGECOIN': 'dogecoin'
  };

  const blockchain = blockchainMap[chain];
  if (!blockchain) {
    throw new Error(`Unsupported UTXO chain: ${chain}`);
  }

  const response = await axios.get<CryptoApisBalanceResponse>(
    `${CRYPTOAPIS_BASE}/blockchain-data/${blockchain}/${network}/addresses/${address}/balance`,
    {
      headers: {
        'X-API-Key': apiKey
      }
    }
  );

  return response.data.data.item.confirmedBalance.amount;
};
