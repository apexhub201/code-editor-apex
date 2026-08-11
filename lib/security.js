// lib/security.js
import Crypto from './crypto.js';

if (!global._s) {
    global._s = {
        rateLimits: new Map(),
        bannedIPs: new Map(),
        challenges: new Map(),
        accessTokens: new Map(),
        nonces: new Map(),
        scripts: new Map()
    };
}

const S = global._s;

class Security {
    static getIP(req) {
        return req.headers['cf-connecting-ip'] ||
               req.headers['x-real-ip'] ||
               (req.headers['x-forwarded-for'] || '').split(',')[0]?.trim() ||
               req.socket?.remoteAddress || 'unknown';
    }

    static rateLimit(key, max = 10, windowMs = 60000) {
        const now = Date.now();
        const entry = S.rateLimits.get(key);
        if (!entry || now > entry.reset) {
            S.rateLimits.set(key, { count: 1, reset: now + windowMs });
            return true;
        }
        entry.count++;
        return entry.count <= max;
    }

    static isBanned(ip) {
        const ban = S.bannedIPs.get(ip);
        if (!ban) return false;
        if (Date.now() > ban.until) { S.bannedIPs.delete(ip); return false; }
        return true;
    }

    static banIP(ip, ms = 300000) {
        S.bannedIPs.set(ip, { until: Date.now() + ms });
    }

    static genNonce() {
        const n = Crypto.randomStr(32);
        S.nonces.set(n, Date.now());
        return n;
    }

    static checkNonce(n) {
        if (!n || S.nonces.has(n)) return false;
        S.nonces.set(n, Date.now());
        return true;
    }

    static genChallenge() {
        const a = Math.floor(Math.random() * 50) + 1;
        const b = Math.floor(Math.random() * 50) + 1;
        const ans = String(a + b);
        const q = `${a} + ${b} = ?`;
        const token = Crypto.randomStr(32);
        S.challenges.set(token, { ans, time: Date.now(), tries: 0 });
        return { q, token };
    }

    static verifyChallenge(token, answer) {
        const c = S.challenges.get(token);
        if (!c) return false;
        if (Date.now() - c.time > 45000) { S.challenges.delete(token); return false; }
        c.tries++;
        if (String(answer).trim() !== c.ans) {
            if (c.tries >= 3) { S.challenges.delete(token); return false; }
            return false;
        }
        S.challenges.delete(token);
        return true;
    }

    static genAccessToken() {
        const token = Crypto.randomStr(48);
        const nonce = Security.genNonce();
        S.accessTokens.set(token, { nonce, time: Date.now(), used: false });
        return { token, nonce };
    }

    static checkAccessToken(token, nonce) {
        const d = S.accessTokens.get(token);
        if (!d) return false;
        if (Date.now() - d.time > 90000) { S.accessTokens.delete(token); return false; }
        if (d.used) { S.accessTokens.delete(token); return false; }
        if (nonce && nonce !== d.nonce) { S.accessTokens.delete(token); return false; }
        d.used = true;
        return true;
    }

    static setHeaders(res) {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
    }
}

// Cleanup
setInterval(() => {
    const now = Date.now();
    for (const [k, v] of S.challenges) { if (now - v.time > 60000) S.challenges.delete(k); }
    for (const [k, v] of S.accessTokens) { if (now - v.time > 120000) S.accessTokens.delete(k); }
}, 60000);

export default Security;
export { S };
