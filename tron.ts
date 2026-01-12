// @ts-ignore - TronWeb doesn't have proper TypeScript types
import TronWeb from 'tronweb';

const getTronWeb = (): any => {
  return new TronWeb({
    fullHost: 'https://api.trongrid.io',
    headers: process.env.TRONGRID_API_KEY 
      ? { 'TRON-PRO-API-KEY': process.env.TRONGRID_API_KEY }
      : {}
  });
};

export const generateTRONWallet = async (): Promise<{ address: string; privateKey: string }> => {
  const tronWeb = getTronWeb();
  const account = await tronWeb.createAccount();
  
  return {
    address: account.address.base58,
    privateKey: account.privateKey
  };
};

export const getTRONBalance = async (address: string): Promise<string> => {
  const tronWeb = getTronWeb();
  const balance = await tronWeb.trx.getBalance(address);
  
  // Convert from SUN to TRX (1 TRX = 1,000,000 SUN)
  return (balance / 1_000_000).toString();
};

export const validateTRONAddress = (address: string): boolean => {
  const tronWeb = getTronWeb();
  return tronWeb.isAddress(address);
};

export const getTRC20Balance = async (
  walletAddress: string, 
  contractAddress: string
): Promise<string> => {
  const tronWeb = getTronWeb();
  
  try {
    const contract = await tronWeb.contract().at(contractAddress);
    const balance = await contract.balanceOf(walletAddress).call();
    const decimals = await contract.decimals().call();
    
    return (Number(balance) / Math.pow(10, decimals)).toString();
  } catch (error) {
    console.error('TRC20 balance fetch error:', error);
    throw error;
  }
};
