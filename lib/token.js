// lib/token.js - One-time Token Management
import Crypto from './crypto.js';

export default class TokenManager {
    constructor() {
        this.tokens = new Map();
        this.usedTokens = new Set();
    }

    generateToken(options = {}) {
        const {
            type = 'session',
            maxUses = 1,
            ttl = 300000, // 5 minutes default
            metadata = {}
        } = options;

        const token = Crypto.generateToken(this.getPrefix(type));
        const tokenData = {
            token,
            type,
            maxUses,
            usedCount: 0,
            createdAt: Date.now(),
            expiresAt: Date.now() + ttl,
            metadata,
            active: true
        };

        this.tokens.set(token, tokenData);

        // Auto cleanup
        setTimeout(() => {
            this.invalidateToken(token);
        }, ttl);

        return token;
    }

    validateToken(token, type = null) {
        const tokenData = this.tokens.get(token);
        
        if (!tokenData) return false;
        if (!tokenData.active) return false;
        if (this.usedTokens.has(token)) return false;
        if (Date.now() > tokenData.expiresAt) {
            this.invalidateToken(token);
            return false;
        }
        if (type && tokenData.type !== type) return false;

        tokenData.usedCount++;
        
        if (tokenData.usedCount >= tokenData.maxUses) {
            this.usedTokens.add(token);
            this.tokens.delete(token);
        }

        return true;
    }

    useToken(token) {
        const tokenData = this.tokens.get(token);
        if (!tokenData || !tokenData.active) return false;
        
        tokenData.usedCount++;
        tokenData.lastUsedAt = Date.now();

        if (tokenData.usedCount >= tokenData.maxUses) {
            this.invalidateToken(token);
        }

        return {
            success: true,
            remaining: tokenData.maxUses - tokenData.usedCount,
            expiresAt: tokenData.expiresAt
        };
    }

    invalidateToken(token) {
        const tokenData = this.tokens.get(token);
        if (tokenData) {
            tokenData.active = false;
            this.tokens.delete(token);
            this.usedTokens.add(token);
        }
    }

    getTokenInfo(token) {
        const tokenData = this.tokens.get(token);
        if (!tokenData) return null;

        return {
            type: tokenData.type,
            maxUses: tokenData.maxUses,
            usedCount: tokenData.usedCount,
            remaining: tokenData.maxUses - tokenData.usedCount,
            createdAt: tokenData.createdAt,
            expiresAt: tokenData.expiresAt,
            timeRemaining: tokenData.expiresAt - Date.now()
        };
    }

    cleanup() {
        const now = Date.now();
        for (const [token, data] of this.tokens.entries()) {
            if (now > data.expiresAt || !data.active) {
                this.tokens.delete(token);
                this.usedTokens.add(token);
            }
        }
    }

    getPrefix(type) {
        const prefixes = {
            'session': 'SESS_',
            'challenge': 'CHAL_',
            'api': 'API_',
            'one-time': 'OT_',
            'refresh': 'REF_'
        };
        return prefixes[type] || 'TOKEN_';
    }
}

// Auto cleanup mỗi 10 phút
const tokenManager = new TokenManager();
setInterval(() => tokenManager.cleanup(), 600000);
