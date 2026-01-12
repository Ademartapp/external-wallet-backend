import CryptoJS from 'crypto-js';

const getEncryptionKey = (): string => {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error('ENCRYPTION_KEY not configured');
  }
  if (key.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be exactly 32 characters');
  }
  return key;
};

export const encrypt = (data: string): string => {
  const key = getEncryptionKey();
  return CryptoJS.AES.encrypt(data, key).toString();
};

export const decrypt = (encryptedData: string): string => {
  const key = getEncryptionKey();
  const bytes = CryptoJS.AES.decrypt(encryptedData, key);
  return bytes.toString(CryptoJS.enc.Utf8);
};
