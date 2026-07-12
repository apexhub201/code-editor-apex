// api/get-script.js
import Crypto from '../lib/crypto.js';

global.scripts = global.scripts || {};
global.sessions = global.sessions || {};

export default function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { sessionToken, hwid, scriptName } = req.body;

        if (!sessionToken) {
            return res.json({ success: false, error: 'No session token' });
        }

        const session = global.sessions[sessionToken];
        if (!session || !session.active) {
            return res.json({ success: false, error: 'Invalid session' });
        }

        if (Date.now() > session.expiresAt) {
            delete global.sessions[sessionToken];
            return res.json({ success: false, error: 'Session expired' });
        }

        const scriptNameToUse = scriptName || 'main';
        const script = global.scripts[scriptNameToUse];

        if (!script) {
            return res.json({ success: false, error: 'Script not found' });
        }

        const encryptKey = Crypto.generateRandomString(16);
        const encryptedPayload = Crypto.encrypt(script.code, encryptKey);

        return res.json({
            success: true,
            payload: JSON.stringify(encryptedPayload.data),
            decryptKey: encryptKey,
            timestamp: Date.now()
        });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
}
