// api/get-script.js - Secure script delivery endpoint
import Crypto from '../lib/crypto.js';
import Security from '../lib/security.js';
import { RateLimiter } from '../lib/rate-limit.js';
import { SessionManager } from '../lib/sessions.js';
import { ScriptManager } from '../lib/scripts.js';
import { ErrorCodes, createErrorResponse } from '../lib/errors.js';

export default async function handler(req, res) {
    // CORS - restricted for this endpoint
    res.setHeader('Access-Control-Allow-Origin', '*'); // Required for Roblox HttpService
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method !== 'POST') {
        return res.status(405).json(createErrorResponse('METHOD_NOT_ALLOWED', 405));
    }
    
    const requestId = Crypto.randomString(12);
    const clientIP = Security.getClientIP(req);
    
    try {
        // Validate body size
        if (!Security.validateBodySize(req, 4096)) {
            return res.status(413).json(createErrorResponse(ErrorCodes.INVALID_REQUEST, 413, null, requestId));
        }
        
        const body = req.body || {};
        const { sessionToken, scriptName, nonce } = body;
        
        // Validate required fields
        const missingFields = Security.validateFields(body, ['sessionToken']);
        if (missingFields.length > 0) {
            return res.status(400).json(createErrorResponse(ErrorCodes.MISSING_FIELDS, 400, null, requestId));
        }
        
        // Validate session
        const sessionResult = await SessionManager.validateSession(sessionToken);
        
        if (!sessionResult.valid) {
            return res.status(401).json(createErrorResponse(
                sessionResult.reason, 401, null, requestId
            ));
        }
        
        // Rate limit per session
        const allowed = await RateLimiter.checkLimit(
            'session',
            sessionResult.session.tokenHash,
            'get-script'
        );
        
        if (!allowed) {
            return res.status(429).json(createErrorResponse(ErrorCodes.RATE_LIMIT_SESSION, 429, null, requestId));
        }
        
        // Get script
        const scriptNameToUse = scriptName || 'main';
        const script = await ScriptManager.getScript(scriptNameToUse);
        
        if (!script) {
            return res.status(404).json(createErrorResponse(ErrorCodes.SCRIPT_NOT_FOUND, 404, null, requestId));
        }
        
        // Encrypt payload for delivery
        const payloadKey = Crypto.generatePayloadKey();
        const encryptedPayload = Crypto.encrypt(script.code, payloadKey);
        
        console.log(`[GET-SCRIPT] Delivered ${scriptNameToUse} to session ${sessionResult.session.tokenHash.substring(0, 8)}...`);
        
        return res.status(200).json({
            success: true,
            requestId,
            payload: {
                version: encryptedPayload.version,
                algorithm: encryptedPayload.algorithm,
                nonce: encryptedPayload.nonce,
                ciphertext: encryptedPayload.ciphertext,
                tag: encryptedPayload.tag
            },
            key: payloadKey.toString('base64'),
            scriptInfo: {
                name: scriptNameToUse,
                target: script.target || 'lua',
                size: script.size || 0,
                timestamp: Date.now()
            }
        });
        
    } catch (error) {
        console.error('[GET-SCRIPT] Error:', error.message);
        return res.status(500).json(createErrorResponse(ErrorCodes.INTERNAL_ERROR, 500, null, requestId));
    }
}
