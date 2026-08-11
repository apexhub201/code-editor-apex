// api/heartbeat.js - Client Heartbeat
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getApps, cert, initializeApp } from 'firebase-admin/app';
import guard from './guard.js';

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

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Session-Token');
    
    if (req.method === 'OPTIONS') return res.status(200).end();
    
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    }
    
    // Apply light guard
    const guardResult = await guard(req, res, {
        requireSession: true,
        rateLimit: true,
        rateLimitMax: 60,
        rateLimitWindow: 60000,
        endpoint: 'heartbeat'
    });
    
    if (guardResult.blocked) {
        return res.status(guardResult.status).json(guardResult.body);
    }
    
    try {
        const sessionToken = req.headers['x-session-token'] || req.body.sessionToken;
        
        // Update session activity
        await db.collection(SESSIONS_COLLECTION).doc(sessionToken).update({
            lastActivity: FieldValue.serverTimestamp()
        });
        
        return res.json({
            alive: true,
            timestamp: Date.now()
        });
    } catch (error) {
        console.error('[HEARTBEAT] Error:', error.message);
        return res.status(500).json({ error: 'HEARTBEAT_FAILED' });
    }
}
