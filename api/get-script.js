// api/get-script.js — Script Delivery V10
// ============================================================
// POST: Lấy script với access token
// Yêu cầu: sessionToken, accessToken, hwid, nonce
// ============================================================

import Crypto from '../lib/crypto.js';
import Security from '../lib/security.js';

// ============================================================
// GLOBAL SCRIPT STORE
// Trong production, nên dùng database
// ============================================================
global.scripts = global.scripts || new Map();

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Access-Token, X-Nonce, X-HWID, X-Session-Token');
    
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

    // Rate limit cho get-script (nghiêm ngặt - 5 requests/phút)
    const rateCheck = Security.checkRateLimit(`script:${clientIP}`, 5, 60000);
    if (!rateCheck.allowed) {
        Security.addStrike(clientIP, 'Script rate limit exceeded');
        return res.status(429).json({
            success: false,
            error: 'RATE_LIMITED',
            retryAfter: rateCheck.retryAfter || 60,
            message: 'Too many script requests. Please wait.'
        });
    }

    // Risk scoring
    const risk = Security.calculateRiskScore(req);
    if (risk.score >= 60) {
        Security.addStrike(clientIP, `High risk script request: ${risk.reasons.join(', ')}`);
        return res.status(403).json({
            success: false,
            error: 'ACCESS_DENIED',
            risk: risk.level,
            message: 'Request blocked due to security concerns.'
        });
    }

    try {
        const { sessionToken, accessToken, hwid, nonce, scriptName } = req.body || {};

        // ============================================================
        // VALIDATE ACCESS TOKEN (BẮT BUỘC)
        // ============================================================
        
        if (!accessToken) {
            return res.status(401).json({
                success: false,
                error: 'ACCESS_TOKEN_REQUIRED',
                message: 'Access token is required. Get one via /api/auth or /api/challenge.',
                requireChallenge: true
            });
        }

        // Xác thực access token
        const tokenValidation = Security.validateAccessToken(accessToken, hwid, nonce);
        if (!tokenValidation.valid) {
            Security.addStrike(clientIP, `Invalid access token: ${tokenValidation.error}`);
            return res.status(403).json({
                success: false,
                error: tokenValidation.error,
                message: 'Access token is invalid, expired, or already used.',
                requireChallenge: true
            });
        }

        // ============================================================
        // VALIDATE SESSION (NẾU CÓ)
        // ============================================================
        
        let session = null;
        if (sessionToken) {
            session = Security.getSession(sessionToken);
            if (!session) {
                return res.status(401).json({
                    success: false,
                    error: 'SESSION_INVALID',
                    message: 'Session is invalid or expired.'
                });
            }

            // Kiểm tra HWID khớp với session
            if (session.hwid && hwid) {
                let clientHwid = hwid;
                try {
                    const parsed = JSON.parse(hwid);
                    clientHwid = parsed.hwid || hwid;
                } catch {
                    // Giữ nguyên
                }

                if (session.hwid !== clientHwid) {
                    Security.addStrike(clientIP, 'HWID mismatch with session');
                    Security.invalidateSession(sessionToken);
                    return res.status(403).json({
                        success: false,
                        error: 'HWID_MISMATCH',
                        message: 'Hardware ID does not match the session.'
                    });
                }
            }
        }

        // ============================================================
        // LẤY SCRIPT
        // ============================================================
        
        const scriptNameToUse = scriptName || 'main';
        const script = global.scripts.get(scriptNameToUse);

        if (!script) {
            return res.status(404).json({
                success: false,
                error: 'SCRIPT_NOT_FOUND',
                message: `Script "${scriptNameToUse}" not found.`
            });
        }

        // ============================================================
        // MÃ HÓA RESPONSE
        // ============================================================
        
        // Tạo key mã hóa ngẫu nhiên cho response này
        const encryptKey = Crypto.generateRandomString(32);
        
        // Mã hóa script với AES-256-CBC
        const encryptedPayload = Crypto.encrypt(script.code, encryptKey);
        
        // Tạo nonce cho response (để client verify)
        const responseNonce = Crypto.generateRandomString(16);
        
        // Tạo checksum của encrypted data
        const checksum = Crypto.hashString(encryptedPayload.data);

        // Log
        const logInfo = session 
            ? `session=${sessionToken.substring(0, 8)}... tier=${session.tier}` 
            : `token auth`;
        console.log(`[SCRIPT] Delivered "${scriptNameToUse}" to ${logInfo}`);

        // ============================================================
        // TRẢ RESPONSE
        // ============================================================
        
        return res.json({
            success: true,
            scriptName: scriptNameToUse,
            payload: encryptedPayload.data,
            iv: encryptedPayload.iv,
            decryptKey: encryptKey,
            checksum: checksum,
            responseNonce: responseNonce,
            timestamp: Date.now(),
            message: 'Script delivered successfully.'
        });
    } catch (error) {
        console.error('[SCRIPT] Delivery error:', error);
        return res.status(500).json({
            success: false,
            error: 'DELIVERY_FAILED',
            message: 'Failed to deliver script.'
        });
    }
}

export { handler as default };
