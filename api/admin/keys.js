// api/admin/keys.js - Admin key management endpoint
// REQUIRES ADMIN_API_SECRET for all operations

import Crypto from '../../lib/crypto.js';
import Security from '../../lib/security.js';
import FirebaseManager from '../../lib/firebase.js';
import { ErrorCodes, createErrorResponse } from '../../lib/errors.js';

export default async function handler(req, res) {
    // CORS - restricted
    res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || 'https://apexhubeditor.vercel.app');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    const requestId = Crypto.randomString(12);
    
    // Verify admin authentication
    const authHeader = req.headers['authorization'] || '';
    const adminSecret = process.env.ADMIN_API_SECRET;
    
    if (!adminSecret) {
        return res.status(500).json(createErrorResponse(ErrorCodes.INTERNAL_ERROR, 500, null, requestId));
    }
    
    const token = authHeader.replace('Bearer ', '');
    
    if (!Crypto.timingSafeEqual(token, adminSecret)) {
        return res.status(403).json(createErrorResponse(ErrorCodes.ADMIN_REQUIRED, 403, null, requestId));
    }
    
    if (!FirebaseManager.isAvailable()) {
        return res.status(500).json(createErrorResponse(ErrorCodes.INTERNAL_ERROR, 500, null, requestId));
    }
    
    const db = FirebaseManager.getDB();
    
    try {
        switch (req.method) {
            case 'GET':
                return await handleListKeys(req, res, db, requestId);
            case 'POST':
                return await handleCreateKey(req, res, db, requestId);
            case 'DELETE':
                return await handleRevokeKey(req, res, db, requestId);
            default:
                return res.status(405).json(createErrorResponse('METHOD_NOT_ALLOWED', 405, null, requestId));
        }
    } catch (error) {
        console.error('[ADMIN:KEYS] Error:', error.message);
        return res.status(500).json(createErrorResponse(ErrorCodes.INTERNAL_ERROR, 500, null, requestId));
    }
}

async function handleListKeys(req, res, db, requestId) {
    const snapshot = await db.collection('keys')
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get();
    
    const keys = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
            key: doc.id,
            tier: data.tier,
            active: data.active,
            maxDevices: data.maxDevices,
            devices: data.devices?.length || 0,
            createdAt: data.createdAt,
            expiresAt: data.expiresAt
        };
    });
    
    return res.status(200).json({
        success: true,
        requestId,
        keys
    });
}

async function handleCreateKey(req, res, db, requestId) {
    const body = req.body || {};
    const { tier = 'standard', duration = '30d', maxDevices = 3 } = body;
    
    const durationMs = parseDuration(duration);
    const keySegments = [];
    for (let i = 0; i < 4; i++) {
        keySegments.push(Crypto.randomString(4).toUpperCase());
    }
    const key = `APEX-${keySegments.join('-')}`;
    
    await db.collection('keys').doc(key).set({
        key,
        tier,
        maxDevices,
        createdAt: Date.now(),
        expiresAt: Date.now() + durationMs,
        devices: [],
        active: true,
        createdBy: 'admin'
    });
    
    return res.status(200).json({
        success: true,
        requestId,
        key,
        tier,
        expiresAt: Date.now() + durationMs,
        expiresIn: Math.floor(durationMs / 1000),
        maxDevices
    });
}

async function handleRevokeKey(req, res, db, requestId) {
    const { key } = req.query;
    
    if (!key) {
        return res.status(400).json(createErrorResponse(ErrorCodes.MISSING_FIELDS, 400, null, requestId));
    }
    
    const keyDoc = await db.collection('keys').doc(key).get();
    
    if (!keyDoc.exists) {
        return res.status(404).json(createErrorResponse('KEY_NOT_FOUND', 404, null, requestId));
    }
    
    await db.collection('keys').doc(key).update({
        active: false,
        revokedAt: Date.now()
    });
    
    return res.status(200).json({
        success: true,
        requestId,
        key,
        revoked: true
    });
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
