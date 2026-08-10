// api/verify.js - Session verification endpoint
import Crypto from '../lib/crypto.js';
import { SessionManager } from '../lib/sessions.js';
import { ErrorCodes, createErrorResponse } from '../lib/errors.js';

export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    const requestId = Crypto.randomString(12);
    
    if (req.method === 'GET') {
        return res.status(200).json({
            success: true,
            requestId,
            timestamp: Date.now(),
            status: 'operational'
        });
    }
    
    if (req.method !== 'POST') {
        return res.status(405).json(createErrorResponse('METHOD_NOT_ALLOWED', 405, null, requestId));
    }
    
    try {
        const body = req.body || {};
        const { sessionToken } = body;
        
        if (!sessionToken) {
            return res.status(400).json(createErrorResponse(ErrorCodes.MISSING_FIELDS, 400, null, requestId));
        }
        
        const result = await SessionManager.validateSession(sessionToken);
        
        if (!result.valid) {
            return res.status(401).json({
                success: false,
                requestId,
                error: result.reason,
                valid: false
            });
        }
        
        return res.status(200).json({
            success: true,
            requestId,
            valid: true,
            expiresAt: result.session.expiresAt,
            remaining: Math.floor((result.session.expiresAt - Date.now()) / 1000)
        });
        
    } catch (error) {
        console.error('[VERIFY] Error:', error.message);
        return res.status(500).json(createErrorResponse(ErrorCodes.INTERNAL_ERROR, 500, null, requestId));
    }
}
