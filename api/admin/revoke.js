// api/admin/revoke.js - Admin session revocation
import Crypto from '../../lib/crypto.js';
import FirebaseManager from '../../lib/firebase.js';
import { SessionManager } from '../../lib/sessions.js';
import { ErrorCodes, createErrorResponse } from '../../lib/errors.js';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || 'https://apexhubeditor.vercel.app');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    
    if (req.method === 'OPTIONS') return res.status(200).end();
    
    const requestId = Crypto.randomString(12);
    
    // Admin auth
    const authHeader = req.headers['authorization'] || '';
    const adminSecret = process.env.ADMIN_API_SECRET;
    
    if (!adminSecret || !Crypto.timingSafeEqual(authHeader.replace('Bearer ', ''), adminSecret)) {
        return res.status(403).json(createErrorResponse(ErrorCodes.ADMIN_REQUIRED, 403, null, requestId));
    }
    
    try {
        const body = req.body || {};
        const { sessionToken, sessionHash } = body;
        
        if (sessionHash) {
            const result = await SessionManager.revokeSession(sessionHash);
            return res.status(200).json({
                success: true,
                requestId,
                revoked: result
            });
        }
        
        if (sessionToken) {
            const tokenHash = Crypto.hash(sessionToken);
            const result = await SessionManager.revokeSession(tokenHash);
            return res.status(200).json({
                success: true,
                requestId,
                revoked: result
            });
        }
        
        return res.status(400).json(createErrorResponse(ErrorCodes.MISSING_FIELDS, 400, null, requestId));
        
    } catch (error) {
        console.error('[ADMIN:REVOKE] Error:', error.message);
        return res.status(500).json(createErrorResponse(ErrorCodes.INTERNAL_ERROR, 500, null, requestId));
    }
}
