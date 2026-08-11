// api/verify.js - Challenge Verification (Persistent)
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getApps, cert, initializeApp } from 'firebase-admin/app';
import crypto from 'crypto';
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
const CHALLENGES_COLLECTION = 'security_challenges';
const SESSIONS_COLLECTION = 'security_sessions';

function generateSessionToken() {
    return crypto.randomBytes(48).toString('hex');
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Challenge-Token, X-Challenge-Answer');
    
    if (req.method === 'OPTIONS') return res.status(200).end();
    
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    }
    
    // Apply guard with rate limiting
    const guardResult = await guard(req, res, {
        rateLimit: true,
        rateLimitMax: 10,
        rateLimitWindow: 60000,
        botDetection: true,
        endpoint: 'verify'
    });
    
    if (guardResult.blocked) {
        return res.status(guardResult.status).json(guardResult.body);
    }
    
    try {
        const challengeToken = req.headers['x-challenge-token'] || req.body.token;
        const challengeAnswer = req.headers['x-challenge-answer'] || req.body.answer;
        
        if (!challengeToken || !challengeAnswer) {
            return res.status(400).json({ 
                success: false, 
                error: 'CHALLENGE_TOKEN_AND_ANSWER_REQUIRED' 
            });
        }
        
        // Get challenge from Firestore
        const challengeRef = db.collection(CHALLENGES_COLLECTION).doc(challengeToken);
        const challengeDoc = await challengeRef.get();
        
        if (!challengeDoc.exists) {
            return res.status(404).json({ 
                success: false, 
                error: 'CHALLENGE_NOT_FOUND' 
            });
        }
        
        const challenge = challengeDoc.data();
        
        // Check if already used
        if (challenge.used) {
            return res.status(403).json({ 
                success: false, 
                error: 'CHALLENGE_ALREADY_USED' 
            });
        }
        
        // Check expiration
        if (challenge.expiresAt && challenge.expiresAt.toDate() < new Date()) {
            await challengeRef.delete();
            return res.status(403).json({ 
                success: false, 
                error: 'CHALLENGE_EXPIRED' 
            });
        }
        
        // Check max attempts
        const attempts = (challenge.attempts || 0) + 1;
        const maxAttempts = challenge.maxAttempts || 3;
        
        if (attempts > maxAttempts) {
            await challengeRef.update({ used: true });
            return res.status(403).json({ 
                success: false, 
                error: 'MAX_ATTEMPTS_EXCEEDED', 
                locked: true 
            });
        }
        
        // Verify answer
        const userAnswer = challengeAnswer.toString().trim().toUpperCase();
        const correctAnswer = challenge.answer.toString().trim().toUpperCase();
        
        if (userAnswer !== correctAnswer) {
            await challengeRef.update({ attempts });
            return res.json({ 
                success: false, 
                error: 'WRONG_ANSWER',
                attemptsLeft: maxAttempts - attempts
            });
        }
        
        // Mark challenge as used
        await challengeRef.update({ 
            used: true, 
            consumedAt: FieldValue.serverTimestamp(),
            attempts
        });
        
        // Create session
        const sessionToken = generateSessionToken();
        const sessionDuration = 1800000; // 30 minutes
        
        await db.collection(SESSIONS_COLLECTION).doc(sessionToken).set({
            token: sessionToken,
            tier: 'standard',
            active: true,
            requestCount: 0,
            maxRequests: 100,
            createdAt: FieldValue.serverTimestamp(),
            expiresAt: new Date(Date.now() + sessionDuration),
            lastActivity: FieldValue.serverTimestamp(),
            metadata: {
                ip: guardResult.ip,
                createdVia: 'challenge_verification',
                challengeToken
            }
        });
        
        return res.json({
            success: true,
            verified: true,
            sessionToken,
            expiresIn: Math.floor(sessionDuration / 1000),
            maxRequests: 100
        });
        
    } catch (error) {
        console.error('[VERIFY] Error:', error.message);
        return res.status(500).json({ 
            success: false, 
            error: 'VERIFICATION_FAILED' 
        });
    }
}
