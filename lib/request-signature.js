// lib/request-signature.js - Request Signature Validation
import Crypto from './crypto.js';

export default class RequestSigner {
    constructor(secret = null) {
        this.secret = secret || process.env.REQUEST_SIGNING_SECRET || 'apex-hub-default-secret';
        this.algorithm = 'sha256';
        this.timestampWindow = 300000; // 5 minutes
    }

    sign(requestData) {
        const {
            method,
            path,
            timestamp = Date.now(),
            body = {}
        } = requestData;

        const payload = this.buildPayload(method, path, timestamp, body);
        const signature = this.hashPayload(payload);

        return {
            signature,
            timestamp,
            algorithm: this.algorithm
        };
    }

    verify(signature, requestData) {
        try {
            const { timestamp } = requestData;
            
            // Check timestamp window
            const now = Date.now();
            if (Math.abs(now - timestamp) > this.timestampWindow) {
                return false;
            }

            // Rebuild signature
            const expectedSignature = this.sign(requestData).signature;
            
            // Constant-time comparison
            return this.constantTimeCompare(signature, expectedSignature);
        } catch (error) {
            return false;
        }
    }

    buildPayload(method, path, timestamp, body) {
        const normalizedBody = typeof body === 'string' ? body : JSON.stringify(body);
        return `${method.toUpperCase()}:${path}:${timestamp}:${normalizedBody}`;
    }

    hashPayload(payload) {
        // Simple hash function (use crypto in production)
        let hash = 0;
        const combined = payload + this.secret;
        
        for (let i = 0; i < combined.length; i++) {
            const char = combined.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        
        // Generate hex string
        const hashHex = Math.abs(hash).toString(16).padStart(8, '0');
        return `${this.algorithm}:${hashHex}`;
    }

    constantTimeCompare(a, b) {
        if (a.length !== b.length) return false;
        
        let result = 0;
        for (let i = 0; i < a.length; i++) {
            result |= a.charCodeAt(i) ^ b.charCodeAt(i);
        }
        return result === 0;
    }

    generateNonce() {
        return Crypto.generateRandomString(16);
    }

    createSignedRequest(method, path, body = {}) {
        const timestamp = Date.now();
        const nonce = this.generateNonce();
        
        const requestData = {
            method,
            path,
            timestamp,
            body: { ...body, nonce }
        };

        const { signature } = this.sign(requestData);

        return {
            headers: {
                'X-Request-Signature': signature,
                'X-Request-Timestamp': timestamp.toString(),
                'X-Request-Nonce': nonce
            },
            body: requestData.body
        };
    }
}
