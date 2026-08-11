// lib/security.js
import Crypto from './crypto.js';

// Khởi tạo global stores
if (!global._secInit) {
    global.rateLimits = new Map();
    global.bannedIPs = new Map();
    global.challenges = new Map();
    global.accessTokens = new Map();
    global.nonces = new Map();
    global._secInit = true;
}

class Security {
    static getClientIP(req) {
        return req.headers['cf-connecting-ip'] ||
               req.headers['x-real-ip'] ||
               (req.headers['x-forwarded-for'] || '').split(',')[0]?.trim() ||
               req.socket?.remoteAddress ||
               'unknown';
    }

    static checkRateLimit(key, limit = 15, windowMs = 60000) {
        const now = Date.now();
        let entry = global.rateLimits.get(key);
        if (!entry || now > entry.resetTime) {
            entry = { count: 1, resetTime: now + windowMs };
            global.rateLimits.set(key, entry);
            return { allowed: true, remaining: limit - 1 };
        }
        entry.count++;
        if (entry.count > limit) {
            return { allowed: false, remaining: 0 };
        }
        return { allowed: true, remaining: limit - entry.count };
    }

    static isIPBanned(ip) {
        const ban = global.bannedIPs.get(ip);
        if (!ban) return false;
        if (Date.now() > ban.until) {
            global.bannedIPs.delete(ip);
            return false;
        }
        return true;
    }

    static banIP(ip, durationMs = 300000) {
        global.bannedIPs.set(ip, {
            bannedAt: Date.now(),
            until: Date.now() + durationMs
        });
    }

    static addStrike(ip) {
        let strikes = (global.bannedIPs.get(ip)?.strikes || 0) + 1;
        if (strikes >= 3) {
            Security.banIP(ip, 600000);
        }
    }

    static generateNonce() {
        return Crypto.generateRandomString(40);
    }

    static validateNonce(nonce) {
        if (!nonce || nonce.length < 8) return false;
        if (global.nonces.has(nonce)) return false;
        global.nonces.set(nonce, Date.now());
        return true;
    }

    static generateChallenge() {
        const a = Math.floor(Math.random() * 50) + 1;
        const b = Math.floor(Math.random() * 50) + 1;
        const answer = String(a + b);
        const question = a + ' + ' + b + ' = ?';
        const token = Crypto.generateRandomString(40);

        global.challenges.set(token, {
            answer,
            createdAt: Date.now(),
            attempts: 0,
            maxAttempts: 2,
            solved: false
        });

        return { question, token, type: 'math', expiresIn: 45 };
    }

    static verifyChallenge(token, answer, ip) {
        const challenge = global.challenges.get(token);
        if (!challenge) {
            return { success: false, error: 'Challenge not found' };
        }
        if (challenge.solved) {
            global.challenges.delete(token);
            return { success: false, error: 'Already used' };
        }
        if (Date.now() - challenge.createdAt > 45000) {
            global.challenges.delete(token);
            return { success: false, error: 'Expired' };
        }

        challenge.attempts++;
        if (String(answer || '').trim() !== String(challenge.answer).trim()) {
            if (challenge.attempts >= challenge.maxAttempts) {
                global.challenges.delete(token);
                Security.addStrike(ip);
                return { success: false, error: 'Max attempts', locked: true };
            }
            return { success: false, error: 'Wrong answer', attemptsLeft: challenge.maxAttempts - challenge.attempts };
        }

        challenge.solved = true;
        global.challenges.delete(token);
        return { success: true, verified: true };
    }

    static generateAccessToken() {
        const token = Crypto.generateRandomString(64);
        const nonce = Security.generateNonce();
        const now = Date.now();

        global.accessTokens.set(token, {
            nonce,
            issuedAt: now,
            expiresAt: now + 90000,
            used: false
        });

        return { accessToken: token, nonce, expiresIn: 90 };
    }

    static validateAccessToken(token, nonce) {
        if (!token) return { valid: false, error: 'No token' };
        const data = global.accessTokens.get(token);
        if (!data) return { valid: false, error: 'Token not found' };
        if (Date.now() > data.expiresAt) {
            global.accessTokens.delete(token);
            return { valid: false, error: 'Expired' };
        }
        if (data.used) {
            global.accessTokens.delete(token);
            return { valid: false, error: 'Already used' };
        }
        if (nonce && nonce !== data.nonce) {
            global.accessTokens.delete(token);
            return { valid: false, error: 'Nonce mismatch' };
        }

        data.used = true;
        global.accessTokens.set(token, data);
        return { valid: true };
    }

    static setSecurityHeaders(res) {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.removeHeader('X-Powered-By');
    }
}

// Cleanup mỗi 5 phút
setInterval(() => {
    const now = Date.now();
    for (const [k, v] of global.challenges) {
        if (now - v.createdAt > 45000) global.challenges.delete(k);
    }
    for (const [k, v] of global.accessTokens) {
        if (now > v.expiresAt) global.accessTokens.delete(k);
    }
    for (const [k, v] of global.nonces) {
        if (now - v > 120000) global.nonces.delete(k);
    }
    for (const [k, v] of global.rateLimits) {
        if (now > v.resetTime) global.rateLimits.delete(k);
    }
    for (const [k, v] of global.bannedIPs) {
        if (now > v.until) global.bannedIPs.delete(k);
    }
}, 5 * 60 * 1000);

export default Security;
