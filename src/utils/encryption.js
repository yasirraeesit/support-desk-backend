import crypto from 'crypto';

// Encryption key from environment variable
// Generate with: crypto.randomBytes(32).toString('hex')
// const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY; // Moved inside functions for safer lazy loading
const algorithm = 'aes-256-cbc';

/**
 * Encrypt text using AES-256-CBC
 * @param {string} text - Text to encrypt
 * @returns {string} - Encrypted text in format: iv:encryptedData
 */
export function encrypt(text) {
    if (!text) return '';

    try {
        const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
        if (!ENCRYPTION_KEY) {
            // Dev-friendly fallback: store plaintext when no key is provided.
            // This avoids breaking local setups, but you should set ENCRYPTION_KEY in production.
            console.warn('⚠️  ENCRYPTION_KEY is not set; storing sensitive values in plaintext.');
            return text;
        }

        const key = Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex');
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(algorithm, key, iv);

        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');

        return iv.toString('hex') + ':' + encrypted;
    } catch (error) {
        console.error('Encryption error:', error);
        throw new Error('Failed to encrypt data');
    }
}

/**
 * Decrypt text encrypted with encrypt()
 * @param {string} text - Encrypted text in format: iv:encryptedData
 * @returns {string} - Decrypted text
 */
export function decrypt(text) {
    if (!text) return '';

    try {
        const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
        if (!ENCRYPTION_KEY) {
            // If we never encrypted (plaintext fallback), just return as-is.
            return text;
        }

        const parts = text.split(':');
        if (parts.length !== 2) {
            // Not encrypted (plaintext)
            return text;
        }

        const key = Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex');
        const iv = Buffer.from(parts[0], 'hex');
        const encrypted = parts[1];

        const decipher = crypto.createDecipheriv(algorithm, key, iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    } catch (error) {
        console.error('Decryption error:', error);
        throw new Error('Failed to decrypt data');
    }
}
