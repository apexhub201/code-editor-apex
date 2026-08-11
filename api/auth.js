// api/auth.js — Authentication System V10
// ============================================================
// POST: Xác thực key và cấp session + access token
// ============================================================

import Crypto from '../lib/crypto.js';
import Security from '../lib/security.js';

// ============================================================
// GLOBAL KEY STORE
// Trong production, nên dùng database thay vì memory
// ============================================================
global.keys = global.keys || new Map();

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Nonce, X-Signature, X-HWID');
    
    // Security headers
    Security.setSecurityHeaders(res);

    // Handle OPTIONS preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Chỉ chấp nhận POST
    if (req.method !== 'POST') {
        return res.status(405).json({
            success: false,
            error: 'Method not allowed',
            message: 'Only POST method is supported.'
        });
    }

    // Lấy IP client
    const clientIP = Security.getClientIP(req);

    // Kiểm tra IP ban
    if (Security.isIPBanned(clientIP)) {
        return res.status(403).json({
            success: false,
            error: 'IP_BANNED',
            message: 'Your IP has been temporarily banned.'
        });
    }

    // Rate limit cho auth (nghiêm ngặt - 10 requests/phút)
    const rateCheck = Security.checkRateLimit(`auth:${clientIP}`, 10, 60000);
    if (!rateCheck.allowed) {
        Security.addStrike(clientIP, 'Auth rate limit exceeded');
        return res.status(429).json({
            success: false,
            error: 'RATE_LIMITED',
            retryAfter: rateCheck.retryAfter || 60,
            message: 'Too many authentication attempts. Please wait.'
        });
    }

    // Risk scoring
    const risk = Security.calculateRiskScore(req);
    if (risk.score >= 50) {
        Security.addStrike(clientIP, `High risk auth: ${risk.reasons.join(', ')}`);
        return res.status(403).json({
            success: false,
            error: 'ACCESS_DENIED',
            risk: risk.level,
            message: 'Request blocked due to security concerns.'
        });
    }

    // Parse body
    const { action, key, hwid, version, nonce } = req.body || {};

    // Validate nonce (anti-replay)
    if (!Security.validateNonce(nonce)) {
        Security.addStrike(clientIP, 'Nonce reuse in auth');
        return res.status(403).json({
            success: false,
            error: 'INVALID_NONCE',
            message: 'Invalid or reused nonce.'
        });
    }

    // Route theo action
    try {
        switch (action) {
            case 'generate-key':
                return handleGenerateKey(req, res, clientIP);
            case 'authenticate':
                return handleAuthenticate(req, res, clientIP);
            case 'validate-key':
                return handleValidateKey(req, res);
            default:
                // Mặc định là authenticate
                return handleAuthenticate(req, res, clientIP);
        }
    } catch (error) {
        console.error('[AUTH] Handler error:', error);
        return res.status(500).json({
            success: false,
            error: 'INTERNAL_ERROR',
            message: 'An internal error occurred.'
        });
    }
}

/**
 * Tạo key mới
 * POST /api/auth
 * Body: { action: "generate-key", tier, duration, maxDevices, nonce }
 */
function handleGenerateKey(req, res, clientIP) {
    try {
        const { tier = 'standard', duration = '30d', maxDevices = 3 } = req.body || {};

        // Validate tier
        const validTiers = ['standard', 'premium', 'enterprise', 'admin'];
        if (!validTiers.includes(tier)) {
            return res.status(400).json({
                success: false,
                error: 'INVALID_TIER',
                message: `Tier must be one of: ${validTiers.join(', ')}`
            });
        }

        // Validate maxDevices
        const maxDev = Math.min(Math.max(1, parseInt(maxDevices) || 3), 25);
        
        // Parse duration
        const durationMs = parseDuration(duration);

        // Tạo key với format APEX-XXXX-XXXX-XXXX-XXXX
        const segments = 4;
        const keyParts = [];
        for (let i = 0; i < segments; i++) {
            keyParts.push(Crypto.generateRandomString(4).toUpperCase());
        }
        const keyString = 'APEX-' + keyParts.join('-');
        
        // Tạo key data
        const keyData = {
            key: keyString,
            keyId: Crypto.generateRandomString(16),
            tier: tier,
            maxSessions: maxDev,
            createdAt: Date.now(),
            expiresAt: Date.now() + durationMs,
            devices: [],
            active: true,
            createdFrom: clientIP
        };
        
        // Lưu key
        global.keys.set(keyString, keyData);

        // Log
        console.log(`[AUTH] Key generated: ${keyString} (tier: ${tier}, devices: ${maxDev}, duration: ${duration})`);

        return res.json({
            success: true,
            key: keyString,
            keyId: keyData.keyId,
            tier: tier,
            expiresAt: keyData.expiresAt,
            expiresIn: Math.floor(durationMs / 1000),
            maxDevices: maxDev,
            message: 'Key generated successfully.'
        });
    } catch (error) {
        console.error('[AUTH] Generate key error:', error);
        return res.status(500).json({
            success: false,
            error: 'GENERATE_FAILED',
            message: error.message
        });
    }
}

/**
 * Xác thực với key
 * POST /api/auth
 * Body: { action: "authenticate", key, hwid, version, nonce }
 */
function handleAuthenticate(req, res, clientIP) {
    try {
        const { key, hwid, version } = req.body || {};

        // Validate key
        if (!key || typeof key !== 'string' || key.trim().length === 0) {
            Security.addStrike(clientIP, 'Auth with empty key');
            return res.status(400).json({
                success: false,
                error: 'KEY_REQUIRED',
                message: 'License key is required.'
            });
        }

        // Validate HWID
        if (!hwid) {
            Security.addStrike(clientIP, 'Auth without HWID');
            return res.status(400).json({
                success: false,
                error: 'HWID_REQUIRED',
                message: 'Hardware ID is required.'
            });
        }

        // Parse HWID (có thể là JSON hoặc string)
        let deviceId;
        try {
            const hwidData = typeof hwid === 'string' ? JSON.parse(hwid) : hwid;
            deviceId = hwidData.hwid || hwidData.synapse_hwid || hwidData.krnl_hwid || hwid;
            if (typeof deviceId === 'object') {
                deviceId = JSON.stringify(deviceId);
            }
        } catch {
            deviceId = String(hwid);
        }

        // Chuẩn hóa key
        const normalizedKey = key.trim().toUpperCase();

        // Tìm key trong store
        const keyData = global.keys.get(normalizedKey);
        
        if (!keyData) {
            Security.addStrike(clientIP, `Invalid key attempt: ${normalizedKey.substring(0, 10)}...`);
            return res.status(401).json({
                success: false,
                error: 'INVALID_KEY',
                message: 'License key does not exist.'
            });
        }

        // Kiểm tra key active
        if (!keyData.active) {
            return res.status(403).json({
                success: false,
                error: 'KEY_REVOKED',
                message: 'This license key has been revoked.'
            });
        }

        // Kiểm tra hết hạn
        if (Date.now() > keyData.expiresAt) {
            return res.status(403).json({
                success: false,
                error: 'KEY_EXPIRED',
                message: 'This license key has expired.',
                expiredAt: keyData.expiresAt
            });
        }

        // Kiểm tra và đăng ký thiết bị
        if (!keyData.devices.includes(deviceId)) {
            if (keyData.devices.length >= keyData.maxSessions) {
                return res.status(403).json({
                    success: false,
                    error: 'MAX_DEVICES',
                    message: `Maximum devices reached (${keyData.maxSessions}).`,
                    currentDevices: keyData.devices.length,
                    maxDevices: keyData.maxSessions
                });
            }
            // Đăng ký thiết bị mới
            keyData.devices.push(deviceId);
            keyData.lastDeviceAdded = Date.now();
            global.keys.set(normalizedKey, keyData);
        }

        // Tạo session
        const session = Security.createSession({
            keyId: keyData.keyId,
            hwid: deviceId,
            tier: keyData.tier,
            fingerprint: Security.getFingerprint(req),
            metadata: {
                version: version || 'unknown',
                authTime: Date.now()
            }
        });

        // Tạo access token ngắn hạn
        const accessTokenData = Security.generateAccessToken({
            sessionId: session.sessionId,
            keyId: keyData.keyId,
            tier: keyData.tier,
            hwid: deviceId,
            fingerprint: session.fingerprint,
            purpose: 'script_access'
        });

        // Log
        console.log(`[AUTH] Authenticated: key=${normalizedKey.substring(0, 10)}... device=${deviceId.substring(0, 8)}... tier=${keyData.tier}`);

        return res.json({
            success: true,
            sessionToken: session.sessionId,
            accessToken: accessTokenData.accessToken,
            nonce: accessTokenData.nonce,
            tier: keyData.tier,
            expiresIn: accessTokenData.expiresIn,
            expiresAt: accessTokenData.expiresAt,
            message: 'Authentication successful.'
        });
    } catch (error) {
        console.error('[AUTH] Authenticate error:', error);
        return res.status(500).json({
            success: false,
            error: 'AUTH_FAILED',
            message: error.message
        });
    }
}

/**
 * Kiểm tra key có hợp lệ không
 * POST /api/auth
 * Body: { action: "validate-key", key }
 */
function handleValidateKey(req, res) {
    try {
        const { key } = req.body || {};

        if (!key) {
            return res.status(400).json({
                valid: false,
                error: 'Key is required'
            });
        }

        const normalizedKey = key.trim().toUpperCase();
        const keyData = global.keys.get(normalizedKey);

        if (!keyData) {
            return res.json({
                valid: false,
                error: 'Key not found'
            });
        }

        if (!keyData.active) {
            return res.json({
                valid: false,
                error: 'Key revoked',
                reason: 'revoked'
            });
        }

        if (Date.now() > keyData.expiresAt) {
            return res.json({
                valid: false,
                error: 'Key expired',
                reason: 'expired',
                expiredAt: keyData.expiresAt
            });
        }

        return res.json({
            valid: true,
            tier: keyData.tier,
            devices: keyData.devices.length,
            maxDevices: keyData.maxSessions,
            expiresAt: keyData.expiresAt,
            remaining: Math.floor((keyData.expiresAt - Date.now()) / 1000),
            createdAt: keyData.createdAt
        });
    } catch (error) {
        console.error('[AUTH] Validate error:', error);
        return res.status(500).json({
            valid: false,
            error: error.message
        });
    }
}

/**
 * Parse duration string sang milliseconds
 * Hỗ trợ: 30d, 24h, 60m, 3600s
 */
function parseDuration(duration) {
    if (!duration || typeof duration !== 'string') {
        return 30 * 24 * 60 * 60 * 1000; // Mặc định 30 ngày
    }

    const match = duration.match(/^(\d+)([dhms])$/i);
    if (!match) {
        return 30 * 24 * 60 * 60 * 1000;
    }

    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();

    switch (unit) {
        case 'd':
            return value * 24 * 60 * 60 * 1000;
        case 'h':
            return value * 60 * 60 * 1000;
        case 'm':
            return value * 60 * 1000;
        case 's':
            return value * 1000;
        default:
            return 30 * 24 * 60 * 60 * 1000;
    }
}

export { handler as default };
