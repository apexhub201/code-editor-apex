// api/challenge.js
import Security from '../lib/security.js';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    Security.setHeaders(res);

    if (req.method === 'OPTIONS') return res.status(200).end();

    const ip = Security.getIP(req);
    if (!Security.rateLimit('challenge:' + ip, 10, 60000)) {
        return res.status(429).json({ error: 'Rate limited' });
    }

    // GET - Get challenge
    if (req.method === 'GET') {
        const c = Security.genChallenge();
        return res.json({
            success: true,
            challenge: {
                question: c.q,
                token: c.token,
                type: 'math'
            }
        });
    }

    // POST - Solve challenge
    if (req.method === 'POST') {
        const { token, answer } = req.body || {};
        if (!token || !answer) {
            return res.status(400).json({ success: false, error: 'Token and answer required' });
        }

        const ok = Security.verifyChallenge(token, answer);
        if (!ok) {
            return res.json({ success: false, error: 'Wrong answer or expired' });
        }

        const at = Security.genAccessToken();
        return res.json({
            success: true,
            accessToken: at.token,
            nonce: at.nonce,
            expiresIn: 90
        });
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
