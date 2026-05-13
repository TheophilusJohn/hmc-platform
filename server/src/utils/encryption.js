// server/src/utils/encryption.js
// AES-256-GCM encryption for sensitive fields
// Fields: aadhaar, bank accounts, IFSC/routing/SWIFT, phone, email, emergency contact

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // bytes for AES-256

function getKey() {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length < KEY_LENGTH) {
    throw new Error('ENCRYPTION_KEY must be at least 32 characters');
  }
  return Buffer.from(key.slice(0, KEY_LENGTH), 'utf-8');
}

/**
 * Encrypt a string value
 * Returns: "iv:authTag:encryptedData" (all hex)
 */
function encrypt(plaintext) {
  if (!plaintext) return null;
  const key = getKey();
  const iv = crypto.randomBytes(12); // 96-bit IV for GCM
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(String(plaintext), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypt an encrypted string
 */
function decrypt(ciphertext) {
  if (!ciphertext) return null;
  try {
    const key = getKey();
    const [ivHex, authTagHex, encryptedHex] = ciphertext.split(':');
    
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (_e) {
    return null; // Decryption failed — return null safely
  }
}

/**
 * Hash for comparison without decryption (e.g. email uniqueness check)
 */
function hash(value) {
  if (!value) return null;
  return crypto.createHmac('sha256', getKey()).update(String(value)).digest('hex');
}

/**
 * Mask for display (e.g. Aadhaar: XXXX-XXXX-1234)
 */
function maskAadhaar(aadhaar) {
  if (!aadhaar || aadhaar.length < 4) return '****';
  return `XXXX-XXXX-${aadhaar.slice(-4)}`;
}

function maskAccount(account) {
  if (!account || account.length < 4) return '****';
  return `${'*'.repeat(account.length - 4)}${account.slice(-4)}`;
}

module.exports = { encrypt, decrypt, hash, maskAadhaar, maskAccount };
