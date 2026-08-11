// api/session.js - Session Management (Persistent)
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getApps, cert, initializeApp } from 'firebase-admin/app';
import crypto from 'crypto';

if (!getApps().length) {
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && privateKey) {
        initializeApp({
            credential: cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: privateKey
            })
        });
    }
}

const db = getFirestore();
const SESSIONS_COLLECTION = 'security_sessions';

/**
 * Generate cryptographically secure token
 */
function generateToken(length = 48) {
    return crypto.randomBytes(length).toString('hex');
}

/**
 * Get session duration based on tier
 */
function getSessionDuration(tier = 'standard') {
    const durations = {
        premium: 3600000,    // 1 hour
        standard: 1800000,   // 30 minutes
        basic: 600000        // 10 minutes
    };
    return durations[tier] || 600000;
}

/**
 * Get max requests based on tier
 */
function getMaxRequests(tier = 'standard') {
    const limits = {
        premium: 200,
        standard: 100,
        basic: 30
    };
    return limits[tier] || 30;
}

/**
 * Create a new session
 */
async function createSession(req, res) {
    try {
        const { challengeToken, challengeAnswer, tier = 'standard', metadata = {} } = req.body;
        const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
        
        // Validate challenge if provided
        if (challengeToken && challengeAnswer) {
            const challengeValid = await validateChallenge(challengeToken, challengeAnswer);
            if (!challengeValid) {
                return res.status(403).json({
                    success: false,
                    error: 'INVALID_CHALLENGE'
                });
            }
        }
        
        const duration = getSessionDuration(tier);
        const maxRequests = getMaxRequests(tier);
        const sessionToken = generateToken();
        
        const sessionData = {
            token: sessionToken,
            tier,
            active: true,
            requestCount: 0,
            maxRequests,
            createdAt: FieldValue.serverTimestamp(),
            expiresAt: new Date(Date.now() + duration),
            lastActivity: FieldValue.serverTimestamp(),
            metadata: {
                ip,
                userAgent: req.headers['user-agent'] || 'unknown',
                createdVia: challengeToken ? 'challenge' : 'direct',
                ...metadata
            }
        };
        
        await db.collection(SESSIONS_COLLECTION).doc(sessionToken).set(sessionData);
        
        return res.json({
            success: true,
            sessionToken,
            expiresIn: Math.floor(duration / 1000),
            maxRequests,
            tier
        });
        
    } catch (error) {
        console.error('[SESSION] Create error:', error.message);
        return res.status(500).json({ error: 'SESSION_CREATE_FAILED' });
    }
}

/**
 * Validate a challenge
 */
async function validateChallenge(token, answer) {
    try {
        const doc = await db.collection('security_challenges').doc(token).get();
        if (!doc.exists) return false;
        
        const challenge = doc.data();
        
        if (challenge.used) return false;
        if (challenge.expiresAt && challenge.expiresAt.toDate() < new Date()) return false;
        
        const isValid = answer?.toString().trim().toUpperCase() === challenge.answer?.toString().trim().toUpperCase();
        
        if (isValid) {
            await doc.ref.update({ 
                used: true, 
                consumedAt: FieldValue.serverTimestamp() 
            });
        }
        
        return isValid;
    } catch (error) {
        console.error('[SESSION] Challenge validation error:', error.message);
        return false;
    }
}

/**
 * Destroy/revoke a session
 */
async function destroySession(req, res) {
    try {
        const sessionToken = req.headers['x-session-token'] || req.body.sessionToken;
        
        if (!sessionToken) {
            return res.status(400).json({ error: 'SESSION_TOKEN_REQUIRED' });
        }
        
        const docRef = db.collection(SESSIONS_COLLECTION).doc(sessionToken);
        const doc = await docRef.get();
        
        if (!doc.exists) {
            return res.status(404).json({ error: 'SESSION_NOT_FOUND' });
        }
        
        await docRef.update({
            active: false,
            revokedAt: FieldValue.serverTimestamp(),
            revokeReason: 'user_requested'
        });
        
        return res.json({ success: true, message: 'Session revoked' });
        
    } catch (error) {
        console.error('[SESSION] Destroy error:', error.message);
        return res.status(500).json({ error: 'SESSION_DESTROY_FAILED' });
    }
}

/**
 * Get session info
 */
async function getSessionInfo(sessionToken) {
    try {
        const doc = await db.collection(SESSIONS_COLLECTION).doc(sessionToken).get();
        if (!doc.exists) return null;
        
        const data = doc.data();
        if (!data.active) return null;
        if (data.expiresAt?.toDate() < new Date()) return null;
        
        return {
            token: sessionToken,
            tier: data.tier,
            requestCount: data.requestCount,
            maxRequests: data.maxRequests,
            expiresAt: data.expiresAt?.toDate(),
            remaining: Math.max(0, data.maxRequests - data.requestCount)
        };
    } catch (error) {
        return null;
    }
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Session-Token');
    
    if (req.method === 'OPTIONS') return res.status(200).end();
    
    switch (req.method) {
        case 'POST':
            return createSession(req, res);
        case 'DELETE':
            return destroySession(req, res);
        default:
            return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    }
}

export { createSession, destroySession, getSessionInfo, generateToken };
