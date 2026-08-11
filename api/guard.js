// api/guard.js - Security Gateway cho tất cả API endpoints
import RateLimiter from '../lib/rate-limit.js';
import BotDetector from '../lib/bot-detection.js';
import TokenManager from '../lib/token.js';
import RequestSigner from '../lib/request-signature.js';

global.guardSessions = global.guardSessions || {};
global.guardRiskScores = global.guardRiskScores || {};

export default async function guardMiddleware(req, res, options = {}) {
    const {
        requireChallenge = true,
        requireSession = false,
        requireSignature = false,
        maxRequestsPerWindow = 30,
        windowMs = 60000,
        riskThreshold = 70
    } = options;

    const clientIP = getClientIP(req);
    const userAgent = req.headers['user-agent'] || '';
    const timestamp = Date.now();

    // 1. Kiểm tra IP ban
    if (isIPBanned(clientIP)) {
        return res.status(403).json({ 
            error: 'ACCESS_DENIED', 
            message: 'IP đã bị khóa tạm thời',
            code: 'IP_BANNED'
        });
    }

    // 2. Rate limiting
    const rateLimiter = new RateLimiter({
        maxRequests: maxRequestsPerWindow,
        windowMs: windowMs
    });

    const rateLimitResult = rateLimiter.check(clientIP);
    if (!rateLimitResult.allowed) {
        increaseRiskScore(clientIP, 10);
        return res.status(429).json({
            error: 'RATE_LIMITED',
            message: 'Quá nhiều request',
            retryAfter: Math.ceil(rateLimitResult.retryAfter / 1000)
        });
    }

    // 3. Bot detection
    const botDetector = new BotDetector();
    const botAnalysis = botDetector.analyze({
        ip: clientIP,
        userAgent: userAgent,
        headers: req.headers,
        timestamp: timestamp
    });

    if (botAnalysis.isBot) {
        increaseRiskScore(clientIP, 20);
        logSuspiciousActivity(clientIP, 'BOT_DETECTED', botAnalysis);
    }

    // 4. Risk score check
    const riskScore = getRiskScore(clientIP);
    if (riskScore > riskThreshold) {
        banIP(clientIP, 300000); // Ban 5 phút
        return res.status(403).json({
            error: 'HIGH_RISK',
            message: 'Hoạt động đáng ngờ bị phát hiện',
            code: 'RISK_THRESHOLD'
        });
    }

    // 5. Request signature validation (nếu yêu cầu)
    if (requireSignature) {
        const signer = new RequestSigner();
        const signature = req.headers['x-request-signature'];
        const requestData = {
            method: req.method,
            path: req.url,
            timestamp: req.headers['x-request-timestamp'],
            body: req.body
        };

        if (!signature || !signer.verify(signature, requestData)) {
            return res.status(403).json({
                error: 'INVALID_SIGNATURE',
                message: 'Chữ ký request không hợp lệ'
            });
        }
    }

    // 6. Session validation (nếu yêu cầu)
    if (requireSession) {
        const sessionToken = req.headers['x-session-token'] || req.body?.sessionToken;
        const session = validateSession(sessionToken);
        
        if (!session) {
            return res.status(401).json({
                error: 'INVALID_SESSION',
                message: 'Session không hợp lệ hoặc đã hết hạn'
            });
        }
    }

    // 7. Challenge verification (nếu yêu cầu)
    if (requireChallenge) {
        const challengeToken = req.headers['x-challenge-token'];
        const challengeAnswer = req.headers['x-challenge-answer'];
        
        if (!validateChallenge(challengeToken, challengeAnswer)) {
            return res.status(403).json({
                error: 'CHALLENGE_FAILED',
                message: 'Xác thực challenge thất bại'
            });
        }
    }

    // Nếu vượt qua tất cả, cho phép tiếp tục
    return null;
}

function getClientIP(req) {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
           req.headers['x-real-ip'] || 
           req.connection?.remoteAddress || 
           'unknown';
}

function getRiskScore(ip) {
    return global.guardRiskScores[ip]?.score || 0;
}

function increaseRiskScore(ip, points) {
    if (!global.guardRiskScores[ip]) {
        global.guardRiskScores[ip] = { score: 0, history: [] };
    }
    global.guardRiskScores[ip].score += points;
    global.guardRiskScores[ip].history.push({
        timestamp: Date.now(),
        points: points
    });
    
    // Tự động giảm risk score sau 5 phút
    setTimeout(() => {
        if (global.guardRiskScores[ip]) {
            global.guardRiskScores[ip].score = Math.max(0, global.guardRiskScores[ip].score - points);
        }
    }, 300000);
}

function isIPBanned(ip) {
    global.bannedIPs = global.bannedIPs || {};
    const banData = global.bannedIPs[ip];
    if (!banData) return false;
    if (Date.now() > banData.until) {
        delete global.bannedIPs[ip];
        return false;
    }
    return true;
}

function banIP(ip, duration) {
    global.bannedIPs = global.bannedIPs || {};
    global.bannedIPs[ip] = {
        bannedAt: Date.now(),
        until: Date.now() + duration,
        reason: 'HIGH_RISK_SCORE'
    };
}

function validateSession(sessionToken) {
    if (!sessionToken) return false;
    const session = global.guardSessions[sessionToken];
    if (!session) return false;
    if (Date.now() > session.expiresAt) {
        delete global.guardSessions[sessionToken];
        return false;
    }
    if (session.requestCount >= session.maxRequests) {
        return false;
    }
    session.requestCount++;
    return session;
}

function validateChallenge(token, answer) {
    global.challenges = global.challenges || {};
    const challenge = global.challenges[token];
    if (!challenge || challenge.used) return false;
    if (Date.now() - challenge.createdAt > 60000) return false;
    
    const isValid = answer?.toString().trim().toUpperCase() === challenge.answer.toString().trim().toUpperCase();
    if (isValid) {
        challenge.used = true;
    }
    return isValid;
}

function logSuspiciousActivity(ip, type, data) {
    global.suspiciousActivities = global.suspiciousActivities || [];
    global.suspiciousActivities.push({
        ip,
        type,
        data,
        timestamp: Date.now()
    });
    
    // Chỉ giữ 1000 bản ghi gần nhất
    if (global.suspiciousActivities.length > 1000) {
        global.suspiciousActivities = global.suspiciousActivities.slice(-1000);
    }
}
