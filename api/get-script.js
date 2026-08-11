// api/get-script.js
import Crypto from '../lib/crypto.js';
import Security from '../lib/security.js';

if (!global._scripts) {
    global._scripts = new Map();
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Access-Token, X-Nonce, X-HWID');
    Security.setSecurityHeaders(res);

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const clientIP = Security.getClientIP(req);

    // Rate limit
    const rateCheck = Security.checkRateLimit('script:' + clientIP, 5, 60000);
    if (!rateCheck.allowed) {
        return res.status(429).json({ error: 'Rate limited' });
    }

    const { accessToken, hwid, nonce, scriptName } = req.body || {};

    // Validate access token
    if (!accessToken) {
        return res.status(401).json({ success: false, error: 'Access token required', requireChallenge: true });
    }

    const tokenCheck = Security.validateAccessToken(accessToken, nonce);
    if (!tokenCheck.valid) {
        Security.addStrike(clientIP);
        return res.status(403).json({ success: false, error: tokenCheck.error, requireChallenge: true });
    }

    // Get script
    const name = scriptName || 'main';
    const script = global._scripts.get(name);
    if (!script) {
        return res.status(404).json({ success: false, error: 'Script not found' });
    }

    // Encrypt and return
    const encKey = Crypto.generateRandomString(32);
    const encrypted = Crypto.encrypt(script.code, encKey);

    return res.json({
        success: true,
        scriptName: name,
        payload: encrypted.data,
        iv: encrypted.iv,
        decryptKey: encKey,
        checksum: encrypted.checksum
    });
}
