// api/auth.js
const Crypto = require('../lib/crypto.js');
const Security = require('../lib/security.js');

global.sessions = global.sessions || {};
global.keys = global.keys || {};

export default function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { action } = req.body;

    switch(action) {
        case 'generate-key':
            return handleGenerateKey(req, res);
        case 'authenticate':
            return handleAuthenticate(req, res);
        case 'validate-key':
            return handleValidateKey(req, res);
        default:
            return handleAuthenticate(req, res);
    }
}

function handleGenerateKey(req, res) {
    try {
        const { tier = 'standard', duration = '30d', maxDevices = 3 } = req.body;
        const durationMs = parseDuration(duration);
        
        const segments = 4;
        const keyParts = [];
        for (let i = 0; i < segments; i++) {
            keyParts.push(Crypto.generateRandomString(4).toUpperCase());
        }
        const key = 'APEX-' + keyParts.join('-');
        
        global.keys[key] = {
            key: key,
            tier: tier,
            maxSessions: maxDevices,
            createdAt: Date.now(),
            expiresAt: Date.now() + durationMs,
            devices: [],
            active: true
        };
        
        return res.json({
            success: true,
            key: key,
            tier: tier,
            expiresAt: Date.now() + durationMs,
            expiresIn: Math.floor(durationMs / 1000),
            maxDevices: maxDevices
        });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
}

function handleAuthenticate(req, res) {
    try {
        const { key, hwid, version } = req.body;
        
        if (!key) {
            return res.json({ success: false, error: 'Key is required' });
        }
        
        if (!hwid) {
            return res.json({ success: false, error: 'HWID is required' });
        }
        
        let hwidData;
        try {
            hwidData = typeof hwid === 'string' ? JSON.parse(hwid) : hwid;
        } catch {
            hwidData = { hwid: hwid };
        }
        
        const deviceId = hwidData.hwid || hwid;
        
        const keyData = global.keys[key];
        if (!keyData) {
            return res.json({ success: false, error: 'INVALID_KEY', message: 'Key không tồn tại' });
        }
        
        if (!keyData.active) {
            return res.json({ success: false, error: 'KEY_REVOKED', message: 'Key đã bị thu hồi' });
        }
        
        if (Date.now() > keyData.expiresAt) {
            return res.json({ success: false, error: 'KEY_EXPIRED', message: 'Key đã hết hạn' });
        }
        
        if (!keyData.devices.includes(deviceId)) {
            if (keyData.devices.length >= keyData.maxSessions) {
                return res.json({ 
                    success: false, 
                    error: 'MAX_DEVICES',
                    message: `Đã đạt giới hạn ${keyData.maxSessions} thiết bị`
                });
            }
            keyData.devices.push(deviceId);
        }
        
        const sessionToken = Security.generateSessionToken();
        const sessionDuration = 24 * 60 * 60 * 1000;
        
        global.sessions[sessionToken] = {
            token: sessionToken,
            key: key,
            hwid: deviceId,
            tier: keyData.tier,
            createdAt: Date.now(),
            expiresAt: Date.now() + sessionDuration,
            active: true,
            version: version || 'unknown'
        };
        
        return res.json({
            success: true,
            sessionToken: sessionToken,
            tier: keyData.tier,
            expiresIn: Math.floor(sessionDuration / 1000),
            expiresAt: Date.now() + sessionDuration
        });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
}

function handleValidateKey(req, res) {
    try {
        const { key } = req.body;
        
        if (!key) {
            return res.json({ valid: false, error: 'Key is required' });
        }
        
        const keyData = global.keys[key];
        
        if (!keyData) {
            return res.json({ valid: false, error: 'Key not found' });
        }
        
        if (!keyData.active) {
            return res.json({ valid: false, error: 'Key revoked' });
        }
        
        if (Date.now() > keyData.expiresAt) {
            return res.json({ valid: false, error: 'Key expired' });
        }
        
        return res.json({
            valid: true,
            tier: keyData.tier,
            devices: keyData.devices.length,
            maxDevices: keyData.maxSessions,
            expiresAt: keyData.expiresAt,
            remaining: Math.floor((keyData.expiresAt - Date.now()) / 1000)
        });
    } catch (error) {
        return res.status(500).json({ valid: false, error: error.message });
    }
}

function parseDuration(duration) {
    const match = duration.match(/^(\d+)([dhms])$/);
    if (!match) return 30 * 24 * 60 * 60 * 1000;
    
    const value = parseInt(match[1]);
    const unit = match[2];
    
    switch(unit) {
        case 'd': return value * 24 * 60 * 60 * 1000;
        case 'h': return value * 60 * 60 * 1000;
        case 'm': return value * 60 * 1000;
        case 's': return value * 1000;
        default: return 30 * 24 * 60 * 60 * 1000;
    }
}
