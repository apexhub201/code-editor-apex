// api/challenge.js - Challenge verification endpoint
import Crypto from '../lib/crypto.js';
import Security from '../lib/security.js';
import { RateLimiter } from '../lib/rate-limit.js';
import { ChallengeManager } from '../lib/challenges.js';
import { ErrorCodes, createErrorResponse } from '../lib/errors.js';

export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || 'https://apexhubeditor.vercel.app');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    const requestId = Crypto.randomString(12);
    const clientIP = Security.getClientIP(req);
    const ipHash = Crypto.hashIP(clientIP);
    
    try {
        // Rate limit
        const allowed = await RateLimiter.checkLimit('ip', clientIP, 'challenge');
        if (!allowed) {
            return res.status(429).json(createErrorResponse(ErrorCodes.RATE_LIMIT_IP, 429, null, requestId));
        }
        
        // GET - Get new challenge
        if (req.method === 'GET') {
            const challenge = await ChallengeManager.createChallenge(ipHash);
            
            return res.status(200).json({
                success: true,
                requestId,
                challenge: {
                    question: challenge.question,
                    token: challenge.token,
                    type: challenge.type,
                    expiresIn: 60
                }
            });
        }
        
        // POST - Verify challenge
        if (req.method === 'POST') {
            const body = req.body || {};
            const { token, answer } = body;
            
            if (!token || !answer) {
                return res.status(400).json(createErrorResponse(ErrorCodes.MISSING_FIELDS, 400, null, requestId));
            }
            
            const result = await ChallengeManager.verifyChallenge(token, answer);
            
            if (!result.valid) {
                return res.status(403).json(createErrorResponse(
                    ErrorCodes.CHALLENGE_FAILED, 403, null, requestId
                ));
            }
            
            return res.status(200).json({
                success: true,
                requestId,
                verified: true,
                message: 'Challenge passed'
            });
        }
        
        return res.status(405).json(createErrorResponse('METHOD_NOT_ALLOWED', 405, null, requestId));
        
    } catch (error) {
        console.error('[CHALLENGE] Error:', error.message);
        return res.status(500).json(createErrorResponse(ErrorCodes.INTERNAL_ERROR, 500, null, requestId));
    }
}
