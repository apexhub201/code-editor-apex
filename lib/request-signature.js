// lib/request-signature.js - HMAC Request Signing
import crypto from 'crypto';

export default class RequestSigner {
    /**
     * Sign a request payload
     */
    static sign(payload, secret) {
        if (!secret || typeof secret !== 'string' || secret.length < 16) {
            throw new Error('Invalid signing secret');
        }
        
        const hmac = crypto.createHmac('sha256', secret);
        const data = RequestSigner.canonicalize(payload);
        hmac.update(data);
        return hmac.digest('hex');
    }
    
    /**
     * Verify a signature
     */
    static verify(payload, signature, secret) {
        try {
            const expected = RequestSigner.sign(payload, secret);
            return RequestSigner.constantTimeCompare(signature, expected);
        } catch (error) {
            return false;
        }
    }
    
    /**
     * Canonicalize payload for consistent signing
     */
    static canonicalize(payload) {
        if (typeof payload === 'string') return payload;
        if (typeof payload === 'object') {
            return JSON.stringify(payload, Object.keys(payload).sort());
        }
        return String(payload);
    }
    
    /**
     * Generate a nonce
     */
    static generateNonce() {
        return crypto.randomBytes(16).toString('hex');
    }
    
    /**
     * Constant-time comparison
     */
    static constantTimeCompare(a, b) {
        if (typeof a !== 'string' || typeof b !== 'string') return false;
        
        try {
            const bufA = Buffer.from(a);
            const bufB = Buffer.from(b);
            
            if (bufA.length !== bufB.length) {
                crypto.timingSafeEqual(bufA, bufA);
                return false;
            }
            
            return crypto.timingSafeEqual(bufA, bufB);
        } catch {
            return false;
        }
    }
    
    /**
     * Verify timestamp is within window
     */
    static verifyTimestamp(timestamp, windowMs = 300000) {
        const now = Date.now();
        const ts = parseInt(timestamp);
        
        if (isNaN(ts)) return false;
        
        return Math.abs(now - ts) <= windowMs;
    }
}
