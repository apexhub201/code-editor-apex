// lib/token.js - Cryptographic Token Management
import crypto from 'crypto';

export default class TokenManager {
    /**
     * Generate cryptographically secure token
     */
    static generate(bytes = 48) {
        return crypto.randomBytes(bytes).toString('hex');
    }
    
    /**
     * Generate token with prefix
     */
    static generatePrefixed(prefix = 'tk') {
        return `${prefix}_${TokenManager.generate(32)}`;
    }
    
    /**
     * Create a one-time token
     */
    static createOneTimeToken() {
        return {
            token: TokenManager.generate(),
            createdAt: Date.now(),
            expiresAt: Date.now() + 300000, // 5 minutes
            maxUses: 1,
            used: false
        };
    }
    
    /**
     * Hash a token for storage/logging
     */
    static hashToken(token) {
        return crypto.createHash('sha256').update(token).digest('hex').substring(0, 16);
    }
    
    /**
     * Constant-time comparison for tokens
     */
    static compare(a, b) {
        if (typeof a !== 'string' || typeof b !== 'string') return false;
        
        const bufA = Buffer.from(a);
        const bufB = Buffer.from(b);
        
        if (bufA.length !== bufB.length) {
            // Still perform comparison to avoid timing leak
            crypto.timingSafeEqual(bufA, bufA);
            return false;
        }
        
        return crypto.timingSafeEqual(bufA, bufB);
    }
}
