// api/auth.js
import Crypto from '../lib/crypto.js';
import Security from '../lib/security.js';

// Key store
if (!global._keys) {
    global._keys = new Map();
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Nonce');
    Security.setSecurityHeaders(res);

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const clientIP = Security.getClientIP(req);

    // Rate limit
    const rateCheck = Security.checkRateLimit('auth:' + clientIP, 10, 60000);
    if (!rateCheck.allowed) {
        return res.status(429).json({ error: 'Rate limited' });
    }

    const { action, key, hwid, nonce, tier, duration, maxDevices } = req.body || {};

    // Validate nonce
    if (!Security.validateNonce(nonce)) {
        return res.status(403).json({ success: false, error: 'Invalid nonce' });
    }

    // Generate key
    if (action === 'generate-key') {
        const segments = 4;
        const parts = [];
        for (let i = 0; i < segments; i++) {
            parts.push(Crypto.generateRandomString(4).toUpperCase());
        }
        const keyStr = 'APEX-' + parts.join('-');
        const durationMs = parseDuration(duration || '30d');

        global._keys.set(keyStr, {
            key: keyStr,
            tier: tier || 'standard',
            maxSessions: Math.min(parseInt(maxDevices) || 3, 25),
            createdAt: Date.now(),
            expiresAt: Date.now() + durationMs,
            devices: [],
            active: true
        });

        return res.json({
            success: true,
            key: keyStr,
            tier: tier || 'standard',
            expiresAt: Date.now() + durationMs,
            expiresIn: Math.floor(durationMs / 1000),
            maxDevices: Math.min(parseInt(maxDevices) || 3, 25)
        });
    }

    // Authenticate
    if (!key || !hwid) {
        return res.status(400).json({ success: false, error: 'Key and HWID required' });
    }

    const keyData = global._keys.get(key.trim().toUpperCase());
    if (!keyData) {
        Security.addStrike(clientIP);
        return res.json({ success: false, error: 'INVALID_KEY' });
    }
    if (!keyData.active) return res.json({ success: false, error: 'KEY_REVOKED' });
    if (Date.now() > keyData.expiresAt) return res.json({ success: false, error: 'KEY_EXPIRED' });

    // Parse HWID
    let deviceId = hwid;
    try {
        const parsed = typeof hwid === 'string' ? JSON.parse(hwid) : hwid;
        deviceId = parsed.hwid || parsed.synapse_hwid || hwid;
    } catch (e) {}

    // Check devices
    if (!keyData.devices.includes(deviceId)) {
        if (keyData.devices.length >= keyData.maxSessions) {
            return res.json({ success: false, error: 'MAX_DEVICES' });
        }
        keyData.devices.push(deviceId);
    }

    // Create session
    const session = Security.createSession({ hwid: deviceId, tier: keyData.tier });
    const accessData = Security.generateAccessToken();

    return res.json({
        success: true,
        sessionToken: session.sessionId,
        accessToken: accessData.accessToken,
        nonce: accessData.nonce,
        tier: keyData.tier,
        expiresIn: accessData.expiresIn
    });
}

function parseDuration(duration) {
    const match = String(duration).match(/^(\d+)([dhms])$/);
    if (!match) return 30 * 24 * 60 * 60 * 1000;
    const v = parseInt(match[1]);
    switch (match[2]) {
        case 'd': return v * 86400000;
        case 'h': return v * 3600000;
        case 'm': return v * 60000;
        case 's': return v * 1000;
        default: return 30 * 86400000;
    }
}
