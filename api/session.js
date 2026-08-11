// api/session.js - Session Management
import TokenManager from '../lib/token.js';
import Crypto from '../lib/crypto.js';

global.activeSessions = global.activeSessions || {};

export default function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Session-Token');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    switch(req.method) {
        case 'POST':
            return createSession(req, res);
        case 'DELETE':
            return destroySession(req, res);
        default:
            return res.status(405).json({ error: 'Method not allowed' });
    }
}

function createSession(req, res) {
    try {
        const { challengeToken, challengeAnswer, tier = 'standard' } = req.body;

        // Validate challenge trước khi tạo session
        if (challengeToken && challengeAnswer) {
            const isValid = validateChallenge(challengeToken, challengeAnswer);
            if (!isValid) {
                return res.status(403).json({
                    success: false,
                    error: 'Invalid challenge'
                });
            }
        }

        const tokenManager = new TokenManager();
        
        // Tạo session với thời gian sống ngắn
        const sessionDuration = getTierDuration(tier);
        const maxRequests = getTierMaxRequests(tier);
        
        const sessionToken = Crypto.generateToken('SESS_');
        const sessionData = {
            token: sessionToken,
            tier: tier,
            createdAt: Date.now(),
            expiresAt: Date.now() + sessionDuration,
            maxRequests: maxRequests,
            requestCount: 0,
            lastActivity: Date.now(),
            challengeToken: challengeToken,
            active: true,
            metadata: {
                ip: getClientIP(req),
                userAgent: req.headers['user-agent'],
                createdFrom: req.headers.referer || 'unknown'
            }
        };

        global.activeSessions[sessionToken] = sessionData;

        // Cleanup expired sessions
        cleanupExpiredSessions();

        return res.json({
            success: true,
            sessionToken: sessionToken,
            expiresIn: Math.floor(sessionDuration / 1000),
            maxRequests: maxRequests,
            tier: tier
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

function destroySession(req, res) {
    try {
        const sessionToken = req.headers['x-session-token'] || req.body.sessionToken;
        
        if (!sessionToken) {
            return res.status(400).json({
                success: false,
                error: 'Session token required'
            });
        }

        const session = global.activeSessions[sessionToken];
        if (session) {
            session.active = false;
            delete global.activeSessions[sessionToken];
            return res.json({
                success: true,
                message: 'Session destroyed'
            });
        }

        return res.status(404).json({
            success: false,
            error: 'Session not found'
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

function getTierDuration(tier) {
    const durations = {
        'premium': 3600000,    // 1 giờ
        'standard': 1800000,   // 30 phút
        'basic': 600000        // 10 phút
    };
    return durations[tier] || 600000;
}

function getTierMaxRequests(tier) {
    const limits = {
        'premium': 100,
        'standard': 50,
        'basic': 20
    };
    return limits[tier] || 20;
}

function validateChallenge(token, answer) {
    global.challenges = global.challenges || {};
    const challenge = global.challenges[token];
    if (!challenge || challenge.used) return false;
    if (Date.now() - challenge.createdAt > 60000) {
        delete global.challenges[token];
        return false;
    }
    return answer?.toString().trim().toUpperCase() === challenge.answer.toString().trim().toUpperCase();
}

function getClientIP(req) {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
           req.headers['x-real-ip'] || 
           req.connection?.remoteAddress || 
           'unknown';
}

function cleanupExpiredSessions() {
    const now = Date.now();
    for (const [token, session] of Object.entries(global.activeSessions)) {
        if (now > session.expiresAt || !session.active) {
            delete global.activeSessions[token];
        }
    }
}

// Chạy cleanup mỗi 5 phút
setInterval(cleanupExpiredSessions, 300000);
