// api/load.js - Endpoint cho Roblox Executor (HttpGet)
// Flow: GET không auth → challenge → giải toán → GET có answer → script

import Crypto from '../lib/crypto.js';
import Security from '../lib/security.js';
import { RateLimiter } from '../lib/rate-limit.js';
import { ChallengeManager } from '../lib/challenges.js';
import { ScriptManager } from '../lib/scripts.js';
import { ErrorCodes, createErrorResponse } from '../lib/errors.js';

export default async function handler(req, res) {
    // Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'METHOD_NOT_ALLOWED' });
    }
    
    const requestId = Crypto.randomString(12);
    const clientIP = Security.getClientIP(req);
    const ipHash = Crypto.hashIP(clientIP);
    
    try {
        // Rate limit
        const allowed = await RateLimiter.checkLimit('ip', clientIP, 'default');
        if (!allowed) {
            return res.status(429).json({ 
                success: false, 
                error: 'RATE_LIMITED',
                message: 'Too many requests. Wait 60 seconds.'
            });
        }
        
        const { name, challenge, answer } = req.query;
        
        // Phải có tên script
        if (!name) {
            return res.status(400).json({ 
                success: false, 
                error: 'MISSING_NAME',
                message: 'Script name is required. Usage: /api/load?name=scriptname'
            });
        }
        
        // Nếu có challenge token + answer → verify và trả script
        if (challenge && answer) {
            const result = await ChallengeManager.verifyChallenge(challenge, answer);
            
            if (!result.valid) {
                return res.status(403).json({ 
                    success: false, 
                    error: 'CHALLENGE_FAILED',
                    message: 'Wrong answer or challenge expired. Try again.'
                });
            }
            
            const script = await ScriptManager.getScript(name);
            
            if (!script) {
                return res.status(404).json({ 
                    success: false, 
                    error: 'SCRIPT_NOT_FOUND',
                    message: 'Script not found: ' + name
                });
            }
            
            // Trả thẳng code cho HttpGet
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            return res.send(script.code);
        }
        
        // Không có challenge → tạo challenge mới
        const newChallenge = await ChallengeManager.createChallenge(ipHash);
        
        return res.status(403).json({
            success: false,
            error: 'CHALLENGE_REQUIRED',
            message: 'Solve the math challenge to access this script.',
            challenge: {
                question: newChallenge.question,
                token: newChallenge.token,
                type: 'math',
                hint: 'Add &challenge=TOKEN&answer=RESULT to your request'
            },
            example: `/api/load?name=${name}&challenge=${newChallenge.token}&answer=42`
        });
        
    } catch (error) {
        console.error('[LOAD] Error:', error.message);
        return res.status(500).json({ 
            success: false, 
            error: 'INTERNAL_ERROR' 
        });
    }
}
