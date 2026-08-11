// api/challenge.js — Challenge System V10
// ============================================================
// GET: Tạo challenge mới
// POST: Xác thực challenge và cấp access token
// ============================================================

import Security from '../lib/security.js';

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Nonce, X-Signature');
    
    // Security headers
    Security.setSecurityHeaders(res);

    // Handle OPTIONS preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Lấy IP client
    const clientIP = Security.getClientIP(req);

    // Kiểm tra IP ban
    if (Security.isIPBanned(clientIP)) {
        return res.status(403).json({
            success: false,
            error: 'IP banned',
            message: 'Your IP has been temporarily banned due to suspicious activity.'
        });
    }

    // Rate limit cho challenge (nghiêm ngặt hơn - 5 requests/phút)
    const rateCheck = Security.checkRateLimit(`challenge:${clientIP}`, 5, 60000);
    if (!rateCheck.allowed) {
        Security.addStrike(clientIP, 'Challenge rate limit exceeded');
        return res.status(429).json({
            success: false,
            error: 'Rate limited',
            retryAfter: rateCheck.retryAfter || 60,
            message: 'Too many challenge requests. Please wait.'
        });
    }

    // Risk scoring
    const risk = Security.calculateRiskScore(req);
    if (risk.score >= 60) {
        Security.addStrike(clientIP, `High risk challenge request: ${risk.reasons.join(', ')}`);
        return res.status(403).json({
            success: false,
            error: 'Access denied',
            risk: risk.level
        });
    }

    // ============================================================
    // GET: Tạo challenge mới
    // ============================================================
    if (req.method === 'GET') {
        try {
            const challenge = Security.generateChallenge();
            
            return res.json({
                success: true,
                challenge: {
                    question: challenge.question,
                    token: challenge.token,
                    type: challenge.type,
                    expiresIn: challenge.expiresIn
                },
                message: 'Solve the challenge to get an access token.'
            });
        } catch (error) {
            console.error('[CHALLENGE] Generate error:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to generate challenge'
            });
        }
    }

    // ============================================================
    // POST: Xác thực challenge
    // ============================================================
    if (req.method === 'POST') {
        try {
            const { token, answer } = req.body;

            // Validate input
            if (!token) {
                return res.status(400).json({
                    success: false,
                    error: 'Token is required',
                    message: 'Challenge token is missing.'
                });
            }

            if (!answer) {
                return res.status(400).json({
                    success: false,
                    error: 'Answer is required',
                    message: 'Challenge answer is missing.'
                });
            }

            // Kiểm tra độ dài answer (tránh spam)
            if (answer.length > 100) {
                return res.status(400).json({
                    success: false,
                    error: 'Answer too long',
                    message: 'Invalid answer format.'
                });
            }

            // Verify challenge
            const result = Security.verifyChallenge(token, answer, clientIP);

            if (!result.success) {
                // Trả về lỗi phù hợp
                const statusCode = result.locked ? 403 : 400;
                return res.status(statusCode).json({
                    success: false,
                    error: result.error,
                    locked: result.locked || false,
                    attemptsLeft: result.attemptsLeft,
                    message: result.locked 
                        ? 'Too many failed attempts. Your IP has been flagged.' 
                        : 'Incorrect answer. Please try again.'
                });
            }

            // Challenge passed - Tạo access token
            const accessTokenData = Security.generateAccessToken({
                tier: 'challenge',
                hwid: null,
                fingerprint: Security.getFingerprint(req),
                purpose: 'script_access'
            });

            // Log thành công
            console.log(`[CHALLENGE] Challenge passed by IP: ${clientIP}`);

            return res.json({
                success: true,
                verified: true,
                accessToken: accessTokenData.accessToken,
                nonce: accessTokenData.nonce,
                expiresIn: accessTokenData.expiresIn,
                expiresAt: accessTokenData.expiresAt,
                message: 'Challenge passed. Use this access token for API requests.'
            });
        } catch (error) {
            console.error('[CHALLENGE] Verify error:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }

    // Method not allowed
    return res.status(405).json({
        success: false,
        error: 'Method not allowed',
        message: 'Only GET and POST methods are supported.'
    });
}

export { handler as default };
