// api/challenge.js
import Security from '../lib/security.js';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    Security.setSecurityHeaders(res);

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const clientIP = Security.getClientIP(req);

    // Rate limit
    const rateCheck = Security.checkRateLimit('challenge:' + clientIP, 5, 60000);
    if (!rateCheck.allowed) {
        return res.status(429).json({ error: 'Rate limited' });
    }

    // GET - Generate challenge
    if (req.method === 'GET') {
        const challenge = Security.generateChallenge();
        return res.json({
            success: true,
            challenge: {
                question: challenge.question,
                token: challenge.token,
                type: challenge.type,
                expiresIn: challenge.expiresIn
            }
        });
    }

    // POST - Verify challenge
    if (req.method === 'POST') {
        const { token, answer } = req.body || {};
        if (!token || !answer) {
            return res.status(400).json({ success: false, error: 'Token and answer required' });
        }

        const result = Security.verifyChallenge(token, answer, clientIP);
        if (!result.success) {
            return res.status(400).json(result);
        }

        // Cấp access token
        const accessData = Security.generateAccessToken();
        return res.json({
            success: true,
            verified: true,
            accessToken: accessData.accessToken,
            nonce: accessData.nonce,
            expiresIn: accessData.expiresIn
        });
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
