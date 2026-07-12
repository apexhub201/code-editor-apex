// api/verify.js
export default function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method === 'GET') {
        return res.json({ valid: true, timestamp: Date.now() });
    }

    if (req.method === 'POST') {
        return handleVerify(req, res);
    }

    return res.status(405).json({ error: 'Method not allowed' });
}

function handleVerify(req, res) {
    try {
        const { sessionToken } = req.body;

        if (!sessionToken) {
            return res.json({ success: false, error: 'No session token' });
        }

        global.sessions = global.sessions || {};
        const session = global.sessions[sessionToken];

        if (!session) {
            return res.json({ success: false, error: 'Session not found' });
        }

        if (!session.active) {
            return res.json({ success: false, error: 'Session inactive' });
        }

        if (Date.now() > session.expiresAt) {
            delete global.sessions[sessionToken];
            return res.json({ success: false, error: 'Session expired' });
        }

        return res.json({
            success: true,
            tier: session.tier,
            expiresAt: session.expiresAt,
            remaining: Math.floor((session.expiresAt - Date.now()) / 1000)
        });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
}
