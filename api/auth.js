// api/auth.js - Secure authentication endpoint
import Crypto from '../lib/crypto.js';
import Security from '../lib/security.js';
import FirebaseManager from '../lib/firebase.js';
import { RateLimiter } from '../lib/rate-limit.js';
import { SessionManager } from '../lib/sessions.js';
import { ErrorCodes, createErrorResponse } from '../lib/errors.js';

export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || 'https://apexhubeditor.vercel.app');
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
    const ipHash = Crypto.hashIP(clientIP);
    
    try {
        // Validate body size
        if (!Security.validateBodySize(req, 4096)) {
            return res.status(413).json(createErrorResponse(ErrorCodes.INVALID_REQUEST, 413, null, requestId));
        }
        
        const body = req.body || {};
        const { key, hwid, version, nonce } = body;
        
        // Validate required fields
        const missingFields = Security.validateFields(body, ['key', 'hwid']);
        if (missingFields.length > 0) {
            return res.status(400).json(createErrorResponse(ErrorCodes.MISSING_FIELDS, 400, null, requestId));
        }
        
        // Validate HWID format
        if (!Security.isValidHWID(hwid)) {
            return res.status(400).json(createErrorResponse(ErrorCodes.INVALID_REQUEST, 400, null, requestId));
        }
        
        // Rate limit checks
        const rateLimits = await RateLimiter.checkAllLimits({
            ip: clientIP,
            key: Crypto.hash(key).substring(0, 32)
        }, 'auth');
        
        if (!rateLimits.allowed) {
            return res.status(429).json(createErrorResponse(
                `RATE_LIMIT_${rateLimits.dimension.toUpperCase()}`, 429, null, requestId
            ));
        }
        
        // Verify nonce (anti-replay)
        if (nonce) {
            const nonceValid = await verifyNonce(nonce, ipHash);
            if (!nonceValid) {
                return res.status(403).json(createErrorResponse(ErrorCodes.REPLAY_DETECTED, 403, null, requestId));
            }
        }
        
        // Look up key in Firestore
        if (!FirebaseManager.isAvailable()) {
            return res.status(500).json(createErrorResponse(ErrorCodes.INTERNAL_ERROR, 500, null, requestId));
        }
        
        const db = FirebaseManager.getDB();
        const keyDoc = await db.collection('keys').doc(key).get();
        
        if (!keyDoc.exists) {
            // Track failed attempts
            await trackFailedAuth(clientIP, key);
            return res.status(401).json(createErrorResponse(ErrorCodes.INVALID_KEY, 401, null, requestId));
        }
        
        const keyData = keyDoc.data();
        
        // Check key status
        if (!keyData.active) {
            return res.status(401).json(createErrorResponse(ErrorCodes.KEY_REVOKED, 401, null, requestId));
        }
        
        if (Date.now() > keyData.expiresAt) {
            return res.status(401).json(createErrorResponse(ErrorCodes.KEY_EXPIRED, 401, null, requestId));
        }
        
        // Check device limit
        const hwidHash = Crypto.hash(hwid);
        const existingSessions = await db.collection('sessions')
            .where('keyId', '==', key)
            .where('active', '==', true)
            .get();
        
        const uniqueDevices = new Set();
        existingSessions.docs.forEach(doc => uniqueDevices.add(doc.data().hwidHash));
        
        if (uniqueDevices.size >= keyData.maxDevices && !uniqueDevices.has(hwidHash)) {
            return res.status(403).json(createErrorResponse(ErrorCodes.MAX_DEVICES, 403, null, requestId));
        }
        
        // Create session
        const session = await SessionManager.createSession(
            key,
            hwid,
            version || 'unknown',
            ipHash
        );
        
        console.log(`[AUTH] Session created: ${session.tokenHash} for key ${key.substring(0, 8)}...`);
        
        return res.status(200).json({
            success: true,
            requestId,
            sessionToken: session.token,
            expiresAt: session.expiresAt,
            expiresIn: Math.floor((session.expiresAt - Date.now()) / 1000)
        });
        
    } catch (error) {
        console.error('[AUTH] Error:', error.message);
        return res.status(500).json(createErrorResponse(ErrorCodes.INTERNAL_ERROR, 500, null, requestId));
    }
}

/**
 * Verify nonce hasn't been used before
 */
async function verifyNonce(nonce, ipHash) {
    if (!FirebaseManager.isAvailable()) return true;
    
    try {
        const db = FirebaseManager.getDB();
        const nonceHash = Crypto.hash(nonce + ipHash);
        const nonceRef = db.collection('nonces').doc(nonceHash);
        
        const doc = await nonceRef.get();
        if (doc.exists) return false;
        
        // Store nonce with TTL
        await nonceRef.set({
            createdAt: Date.now(),
            expiresAt: Date.now() + 300000 // 5 minutes
        });
        
        return true;
    } catch (error) {
        return true; // Graceful degradation
    }
}

/**
 * Track failed authentication attempts for risk scoring
 */
async function trackFailedAuth(ip, key) {
    if (!FirebaseManager.isAvailable()) return;
    
    try {
        const db = FirebaseManager.getDB();
        const ipHash = Crypto.hashIP(ip);
        const keyHash = Crypto.hash(key).substring(0, 32);
        
        await db.collection('auth_failures').add({
            ipHash,
            keyHash: keyHash,
            timestamp: Date.now()
        });
    } catch (error) {
        // Silent failure
    }
}
