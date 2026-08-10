// api/loader.js - Endpoint đơn giản cho Roblox executor
import Crypto from '../lib/crypto.js';
import Security from '../lib/security.js';
import { RateLimiter } from '../lib/rate-limit.js';
import { ChallengeManager } from '../lib/challenges.js';
import { ScriptManager } from '../lib/scripts.js';
import { ErrorCodes, createErrorResponse } from '../lib/errors.js';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    
    if (req.method === 'OPTIONS') return res.status(200).end();
    
    const requestId = Crypto.randomString(12);
    const clientIP = Security.getClientIP(req);
    
    // Rate limit
    const allowed = await RateLimiter.checkLimit('ip', clientIP, 'default');
    if (!allowed) {
        return res.status(429).json(createErrorResponse(ErrorCodes.RATE_LIMIT_IP, 429, null, requestId));
    }
    
    const { name, key, challenge, answer } = req.query;
    
    if (!name) {
        return res.status(400).json(createErrorResponse(ErrorCodes.MISSING_FIELDS, 400, null, requestId));
    }
    
    // Cách 1: Có challenge token + answer
    if (challenge && answer) {
        const result = await ChallengeManager.verifyChallenge(challenge, answer);
        
        if (result.valid) {
            const script = await ScriptManager.getScript(name);
            if (!script) {
                return res.status(404).json(createErrorResponse(ErrorCodes.SCRIPT_NOT_FOUND, 404, null, requestId));
            }
            
            return res.status(200).json({
                success: true,
                code: script.code
            });
        }
    }
    
    // Nếu không có challenge → tạo challenge mới
    const ipHash = Crypto.hashIP(clientIP);
    const newChallenge = await ChallengeManager.createChallenge(ipHash);
    
    return res.status(403).json({
        success: false,
        error: ErrorCodes.CHALLENGE_REQUIRED,
        challenge: {
            question: newChallenge.question,
            token: newChallenge.token
        }
    });
}
