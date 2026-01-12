import axios from 'axios';

const QUIDAX_API_URL = process.env.QUIDAX_API_URL || 'https://www.quidax.com/api/v1';
const QUIDAX_API_KEY = process.env.QUIDAX_API_KEY || '';

interface QuidaxHeaders {
  'Authorization': string;
  'Content-Type': string;
}

function getHeaders(): QuidaxHeaders {
  return {
    'Authorization': `Bearer ${QUIDAX_API_KEY}`,
    'Content-Type': 'application/json'
  };
}

// ==================== ACCOUNT & USER ====================

export async function getQuidaxUser(): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const response = await axios.get(`${QUIDAX_API_URL}/users/me`, {
      headers: getHeaders()
    });
    return { success: true, data: response.data.data };
  } catch (error: any) {
    console.error('[Quidax] Get user error:', error.response?.data || error.message);
    return { success: false, error: error.response?.data?.message || error.message };
  }
}

export async function createQuidaxSubAccount(email: string, firstName: string, lastName: string): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const response = await axios.post(`${QUIDAX_API_URL}/users`, {
      email,
      first_name: firstName,
      last_name: lastName
    }, {
      headers: getHeaders()
    });
    return { success: true, data: response.data.data };
  } catch (error: any) {
    console.error('[Quidax] Create sub-account error:', error.response?.data || error.message);
    return { success: false, error: error.response?.data?.message || error.message };
  }
}

// ==================== WALLETS ====================

export async function getQuidaxWallets(userId: string = 'me'): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const response = await axios.get(`${QUIDAX_API_URL}/users/${userId}/wallets`, {
      headers: getHeaders()
    });
    return { success: true, data: response.data.data };
  } catch (error: any) {
    console.error('[Quidax] Get wallets error:', error.response?.data || error.message);
    return { success: false, error: error.response?.data?.message || error.message };
  }
}

export async function getQuidaxWallet(userId: string = 'me', currency: string): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const response = await axios.get(`${QUIDAX_API_URL}/users/${userId}/wallets/${currency.toLowerCase()}`, {
      headers: getHeaders()
    });
    return { success: true, data: response.data.data };
  } catch (error: any) {
    console.error('[Quidax] Get wallet error:', error.response?.data || error.message);
    return { success: false, error: error.response?.data?.message || error.message };
  }
}

export async function getQuidaxDepositAddress(userId: string = 'me', currency: string): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const response = await axios.get(`${QUIDAX_API_URL}/users/${userId}/wallets/${currency.toLowerCase()}/address`, {
      headers: getHeaders()
    });
    return { success: true, data: response.data.data };
  } catch (error: any) {
    console.error('[Quidax] Get deposit address error:', error.response?.data || error.message);
    return { success: false, error: error.response?.data?.message || error.message };
  }
}

// ==================== WITHDRAWALS ====================

export async function createQuidaxWithdrawal(
  userId: string = 'me',
  currency: string,
  amount: string,
  address: string,
  network?: string,
  narration?: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const payload: any = {
      currency: currency.toLowerCase(),
      amount,
      fund_uid: address
    };

    if (network) payload.network = network;
    if (narration) payload.narration = narration;

    const response = await axios.post(
      `${QUIDAX_API_URL}/users/${userId}/withdraws`,
      payload,
      { headers: getHeaders() }
    );
    return { success: true, data: response.data.data };
  } catch (error: any) {
    console.error('[Quidax] Create withdrawal error:', error.response?.data || error.message);
    return { success: false, error: error.response?.data?.message || error.message };
  }
}

export async function getQuidaxWithdrawals(userId: string = 'me', currency?: string): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    let url = `${QUIDAX_API_URL}/users/${userId}/withdraws`;
    if (currency) url += `?currency=${currency.toLowerCase()}`;
    
    const response = await axios.get(url, { headers: getHeaders() });
    return { success: true, data: response.data.data };
  } catch (error: any) {
    console.error('[Quidax] Get withdrawals error:', error.response?.data || error.message);
    return { success: false, error: error.response?.data?.message || error.message };
  }
}

export async function getQuidaxWithdrawal(userId: string = 'me', withdrawalId: string): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const response = await axios.get(`${QUIDAX_API_URL}/users/${userId}/withdraws/${withdrawalId}`, {
      headers: getHeaders()
    });
    return { success: true, data: response.data.data };
  } catch (error: any) {
    console.error('[Quidax] Get withdrawal error:', error.response?.data || error.message);
    return { success: false, error: error.response?.data?.message || error.message };
  }
}

// ==================== DEPOSITS ====================

export async function getQuidaxDeposits(userId: string = 'me', currency?: string): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    let url = `${QUIDAX_API_URL}/users/${userId}/deposits`;
    if (currency) url += `?currency=${currency.toLowerCase()}`;
    
    const response = await axios.get(url, { headers: getHeaders() });
    return { success: true, data: response.data.data };
  } catch (error: any) {
    console.error('[Quidax] Get deposits error:', error.response?.data || error.message);
    return { success: false, error: error.response?.data?.message || error.message };
  }
}

export async function getQuidaxDeposit(userId: string = 'me', depositId: string): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const response = await axios.get(`${QUIDAX_API_URL}/users/${userId}/deposits/${depositId}`, {
      headers: getHeaders()
    });
    return { success: true, data: response.data.data };
  } catch (error: any) {
    console.error('[Quidax] Get deposit error:', error.response?.data || error.message);
    return { success: false, error: error.response?.data?.message || error.message };
  }
}

// ==================== TRADES / INSTANT ORDERS ====================

export async function createQuidaxInstantOrder(
  userId: string = 'me',
  bid: string, // currency to receive
  ask: string, // currency to spend
  type: 'buy' | 'sell',
  volume: string,
  unit: 'bid' | 'ask' = 'bid'
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const response = await axios.post(
      `${QUIDAX_API_URL}/users/${userId}/instant_orders`,
      {
        bid: bid.toLowerCase(),
        ask: ask.toLowerCase(),
        type,
        volume,
        unit
      },
      { headers: getHeaders() }
    );
    return { success: true, data: response.data.data };
  } catch (error: any) {
    console.error('[Quidax] Create instant order error:', error.response?.data || error.message);
    return { success: false, error: error.response?.data?.message || error.message };
  }
}

export async function confirmQuidaxInstantOrder(userId: string = 'me', orderId: string): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const response = await axios.post(
      `${QUIDAX_API_URL}/users/${userId}/instant_orders/${orderId}/confirm`,
      {},
      { headers: getHeaders() }
    );
    return { success: true, data: response.data.data };
  } catch (error: any) {
    console.error('[Quidax] Confirm instant order error:', error.response?.data || error.message);
    return { success: false, error: error.response?.data?.message || error.message };
  }
}

export async function getQuidaxInstantOrders(userId: string = 'me', pair?: string, state?: string): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    let url = `${QUIDAX_API_URL}/users/${userId}/instant_orders`;
    const params: string[] = [];
    if (pair) params.push(`pair=${pair.toLowerCase()}`);
    if (state) params.push(`state=${state}`);
    if (params.length) url += `?${params.join('&')}`;
    
    const response = await axios.get(url, { headers: getHeaders() });
    return { success: true, data: response.data.data };
  } catch (error: any) {
    console.error('[Quidax] Get instant orders error:', error.response?.data || error.message);
    return { success: false, error: error.response?.data?.message || error.message };
  }
}

// ==================== MARKETS & PRICES ====================

export async function getQuidaxMarkets(): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const response = await axios.get(`${QUIDAX_API_URL}/markets`, {
      headers: getHeaders()
    });
    return { success: true, data: response.data.data };
  } catch (error: any) {
    console.error('[Quidax] Get markets error:', error.response?.data || error.message);
    return { success: false, error: error.response?.data?.message || error.message };
  }
}

export async function getQuidaxTicker(pair: string): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const response = await axios.get(`${QUIDAX_API_URL}/markets/tickers/${pair.toLowerCase()}`, {
      headers: getHeaders()
    });
    return { success: true, data: response.data.data };
  } catch (error: any) {
    console.error('[Quidax] Get ticker error:', error.response?.data || error.message);
    return { success: false, error: error.response?.data?.message || error.message };
  }
}

export async function getQuidaxOrderBook(pair: string): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const response = await axios.get(`${QUIDAX_API_URL}/markets/${pair.toLowerCase()}/order_book`, {
      headers: getHeaders()
    });
    return { success: true, data: response.data.data };
  } catch (error: any) {
    console.error('[Quidax] Get order book error:', error.response?.data || error.message);
    return { success: false, error: error.response?.data?.message || error.message };
  }
}

// ==================== BANKS (for NGN withdrawals) ====================

export async function getQuidaxBanks(): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const response = await axios.get(`${QUIDAX_API_URL}/banks`, {
      headers: getHeaders()
    });
    return { success: true, data: response.data.data };
  } catch (error: any) {
    console.error('[Quidax] Get banks error:', error.response?.data || error.message);
    return { success: false, error: error.response?.data?.message || error.message };
  }
}

export async function validateBankAccount(accountNumber: string, bankCode: string): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const response = await axios.get(
      `${QUIDAX_API_URL}/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
      { headers: getHeaders() }
    );
    return { success: true, data: response.data.data };
  } catch (error: any) {
    console.error('[Quidax] Validate bank account error:', error.response?.data || error.message);
    return { success: false, error: error.response?.data?.message || error.message };
  }
}

// ==================== BENEFICIARIES ====================

export async function createQuidaxBeneficiary(
  userId: string = 'me',
  currency: string,
  address: string,
  network?: string,
  label?: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const payload: any = {
      currency: currency.toLowerCase(),
      fund_uid: address
    };
    if (network) payload.network = network;
    if (label) payload.label = label;

    const response = await axios.post(
      `${QUIDAX_API_URL}/users/${userId}/beneficiaries`,
      payload,
      { headers: getHeaders() }
    );
    return { success: true, data: response.data.data };
  } catch (error: any) {
    console.error('[Quidax] Create beneficiary error:', error.response?.data || error.message);
    return { success: false, error: error.response?.data?.message || error.message };
  }
}

export async function getQuidaxBeneficiaries(userId: string = 'me', currency?: string): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    let url = `${QUIDAX_API_URL}/users/${userId}/beneficiaries`;
    if (currency) url += `?currency=${currency.toLowerCase()}`;
    
    const response = await axios.get(url, { headers: getHeaders() });
    return { success: true, data: response.data.data };
  } catch (error: any) {
    console.error('[Quidax] Get beneficiaries error:', error.response?.data || error.message);
    return { success: false, error: error.response?.data?.message || error.message };
  }
}

// ==================== QUOTE ====================

export async function getQuidaxQuote(
  bid: string,
  ask: string,
  type: 'buy' | 'sell',
  volume: string,
  unit: 'bid' | 'ask' = 'bid'
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const response = await axios.post(
      `${QUIDAX_API_URL}/quotes`,
      {
        bid: bid.toLowerCase(),
        ask: ask.toLowerCase(),
        type,
        volume,
        unit
      },
      { headers: getHeaders() }
    );
    return { success: true, data: response.data.data };
  } catch (error: any) {
    console.error('[Quidax] Get quote error:', error.response?.data || error.message);
    return { success: false, error: error.response?.data?.message || error.message };
  }
}
