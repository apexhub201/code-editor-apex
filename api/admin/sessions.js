// api/admin/sessions.js - List active sessions
import Crypto from '../../lib/crypto.js';
import FirebaseManager from '../../lib/firebase.js';
import { ErrorCodes, createErrorResponse } from '../../lib/errors.js';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || 'https://apexhubeditor.vercel.app');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json(createErrorResponse('METHOD_NOT_ALLOWED', 405));
    
    const requestId = Crypto.randomString(12);
    
    // Admin auth
    const authHeader = req.headers['authorization'] || '';
    const adminSecret = process.env.ADMIN_API_SECRET;
    
    if (!adminSecret || !Crypto.timingSafeEqual(authHeader.replace('Bearer ', ''), adminSecret)) {
        return res.status(403).json(createErrorResponse(ErrorCodes.ADMIN_REQUIRED, 403, null, requestId));
    }
    
    if (!FirebaseManager.isAvailable()) {
        return res.status(500).json(createErrorResponse(ErrorCodes.INTERNAL_ERROR, 500, null, requestId));
    }
    
    try {
        const db = FirebaseManager.getDB();
        const snapshot = await db.collection('sessions')
            .where('active', '==', true)
            .limit(100)
            .get();
        
        const sessions = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                tokenHash: doc.id.substring(0, 16) + '...',
                keyId: data.keyId?.substring(0, 12) + '...',
                hwidHash: data.hwidHash?.substring(0, 16) + '...',
                createdAt: data.createdAt,
                expiresAt: data.expiresAt,
                lastSeen: data.lastSeen,
                version: data.version
            };
        });
        
        return res.status(200).json({
            success: true,
            requestId,
            count: sessions.length,
            sessions
        });
        
    } catch (error) {
        console.error('[ADMIN:SESSIONS] Error:', error.message);
        return res.status(500).json(createErrorResponse(ErrorCodes.INTERNAL_ERROR, 500, null, requestId));
    }
}
