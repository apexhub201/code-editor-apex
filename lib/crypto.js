// lib/crypto.js - Cryptographic Utilities (Refactored)
import crypto from 'crypto';

export default class CryptoUtil {
    static ALGORITHM = 'aes-256-gcm';
    static KEY_LENGTH = 32;
    static IV_LENGTH = 16;
    static TAG_LENGTH = 16;
    
    /**
     * Generate random bytes
     */
    static randomBytes(length = 32) {
        return crypto.randomBytes(length);
    }
    
    /**
     * Generate random string
     */
    static randomString(length = 32) {
        return crypto.randomBytes(length).toString('hex');
    }
    
    /**
     * Generate encryption key
     */
    static generateKey() {
        return crypto.randomBytes(CryptoUtil.KEY_LENGTH);
    }
    
    /**
     * Encrypt data using AES-256-GCM
     */
    static encrypt(data, key) {
        const iv = crypto.randomBytes(CryptoUtil.IV_LENGTH);
        const cipher = crypto.createCipheriv(CryptoUtil.ALGORITHM, key, iv);
        
        const encrypted = Buffer.concat([
            cipher.update(data, 'utf8'),
            cipher.final()
        ]);
        
        const tag = cipher.getAuthTag();
        
        // Return IV + Tag + Encrypted
        return Buffer.concat([iv, tag, encrypted]);
    }
    
    /**
     * Decrypt data using AES-256-GCM
     */
    static decrypt(encryptedData, key) {
        const iv = encryptedData.slice(0, CryptoUtil.IV_LENGTH);
        const tag = encryptedData.slice(CryptoUtil.IV_LENGTH, CryptoUtil.IV_LENGTH + CryptoUtil.TAG_LENGTH);
        const encrypted = encryptedData.slice(CryptoUtil.IV_LENGTH + CryptoUtil.TAG_LENGTH);
        
        const decipher = crypto.createDecipheriv(CryptoUtil.ALGORITHM, key, iv);
        decipher.setAuthTag(tag);
        
        const decrypted = Buffer.concat([
            decipher.update(encrypted),
            decipher.final()
        ]);
        
        return decrypted.toString('utf8');
    }
    
    /**
     * HMAC-SHA256
     */
    static hmac(data, key) {
        return crypto.createHmac('sha256', key).update(data).digest('hex');
    }
    
    /**
     * SHA256 hash
     */
    static sha256(data) {
        return crypto.createHash('sha256').update(data).digest('hex');
    }
    
    /**
     * Constant-time comparison
     */
    static constantTimeCompare(a, b) {
        try {
            return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
        } catch {
            return false;
        }
    }
}
