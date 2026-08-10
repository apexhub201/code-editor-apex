// lib/crypto.js - Cryptographic operations using Node.js crypto module
import crypto from 'crypto';

export class Crypto {
    static ALGORITHM = 'aes-256-gcm';
    static KEY_LENGTH = 32;
    static IV_LENGTH = 12;
    static TAG_LENGTH = 16;
    static SALT_LENGTH = 32;
    
    /**
     * Generate cryptographically secure random bytes as hex string
     */
    static randomBytes(length = 32) {
        return crypto.randomBytes(length).toString('hex');
    }
    
    /**
     * Generate random string with specified character set
     */
    static randomString(length = 32) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        const bytes = crypto.randomBytes(length);
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(bytes[i] % chars.length);
        }
        return result;
    }
    
    /**
     * Generate a random token
     */
    static generateToken(prefix = '') {
        return `${prefix}${crypto.randomBytes(48).toString('base64url')}`;
    }
    
    /**
     * Generate encryption key from password + salt using PBKDF2
     */
    static deriveKey(password, salt, iterations = 100000) {
        return crypto.pbkdf2Sync(
            password,
            salt,
            iterations,
            Crypto.KEY_LENGTH,
            'sha512'
        );
    }
    
    /**
     * Encrypt data using AES-256-GCM with authentication
     * Returns: { version, algorithm, nonce, ciphertext, tag }
     */
    static encrypt(plaintext, key) {
        const iv = crypto.randomBytes(Crypto.IV_LENGTH);
        const cipher = crypto.createCipheriv(
            Crypto.ALGORITHM,
            Buffer.isBuffer(key) ? key : Buffer.from(key, 'hex'),
            iv,
            { authTagLength: Crypto.TAG_LENGTH }
        );
        
        let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
        ciphertext += cipher.final('base64');
        const authTag = cipher.getAuthTag();
        
        return {
            version: 2,
            algorithm: Crypto.ALGORITHM,
            nonce: iv.toString('base64'),
            ciphertext: ciphertext,
            tag: authTag.toString('base64')
        };
    }
    
    /**
     * Decrypt data using AES-256-GCM
     */
    static decrypt(encryptedData, key) {
        const iv = Buffer.from(encryptedData.nonce, 'base64');
        const authTag = Buffer.from(encryptedData.tag, 'base64');
        
        const decipher = crypto.createDecipheriv(
            Crypto.ALGORITHM,
            Buffer.isBuffer(key) ? key : Buffer.from(key, 'hex'),
            iv,
            { authTagLength: Crypto.TAG_LENGTH }
        );
        
        decipher.setAuthTag(authTag);
        
        let plaintext = decipher.update(encryptedData.ciphertext, 'base64', 'utf8');
        plaintext += decipher.final('utf8');
        
        return plaintext;
    }
    
    /**
     * Generate nonce for anti-replay
     */
    static generateNonce() {
        return crypto.randomBytes(24).toString('base64url');
    }
    
    /**
     * Hash using SHA-512
     */
    static hash(data) {
        return crypto.createHash('sha512').update(data).digest('hex');
    }
    
    /**
     * Hash using SHA-256
     */
    static hash256(data) {
        return crypto.createHash('sha256').update(data).digest('hex');
    }
    
    /**
     * Hash with salt
     */
    static hashWithSalt(data, salt) {
        return crypto.createHash('sha512')
            .update(salt)
            .update(data)
            .digest('hex');
    }
    
    /**
     * Constant-time comparison to prevent timing attacks
     */
    static timingSafeEqual(a, b) {
        try {
            return crypto.timingSafeEqual(
                Buffer.from(a),
                Buffer.from(b)
            );
        } catch {
            return false;
        }
    }
    
    /**
     * Hash IP for privacy
     */
    static hashIP(ip) {
        return Crypto.hash256(`ip:${ip}`);
    }
    
    /**
     * Generate a short-lived encryption key for payload delivery
     */
    static generatePayloadKey() {
        return crypto.randomBytes(Crypto.KEY_LENGTH);
    }
}

export default Crypto;
