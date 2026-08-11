// api/heartbeat.js - Client Heartbeat & Validation
import TokenManager from '../lib/token.js';

global.heartbeats = global.heartbeats || {};
global.clientStates = global.clientStates || {};

export default function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Session-Token');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const sessionToken = req.headers['x-session-token'] || req.body.sessionToken;
        const clientState = req.body.state || {};

        // Validate session
        const session = global.activeSessions?.[sessionToken];
        if (!session || !session.active) {
            return res.status(401).json({
                alive: false,
                error: 'Invalid or expired session'
            });
        }

        if (Date.now() > session.expiresAt) {
            delete global.activeSessions[sessionToken];
            return res.status(401).json({
                alive: false,
                error: 'Session expired'
            });
        }

        // Update heartbeat
        const heartbeatData = {
            sessionToken: sessionToken,
            lastHeartbeat: Date.now(),
            clientState: clientState,
            sequence: (global.heartbeats[sessionToken]?.sequence || 0) + 1
        };

        global.heartbeats[sessionToken] = heartbeatData;

        // Update session activity
        session.lastActivity = Date.now();

        // Analyze client behavior
        const behaviorAnalysis = analyzeClientBehavior(sessionToken);

        // Check for suspicious patterns
        if (behaviorAnalysis.riskScore > 70) {
            session.active = false;
            delete global.activeSessions[sessionToken];
            return res.status(403).json({
                alive: false,
                error: 'Suspicious behavior detected',
                reason: behaviorAnalysis.reason
            });
        }

        return res.json({
            alive: true,
            sessionActive: true,
            expiresIn: Math.floor((session.expiresAt - Date.now()) / 1000),
            remainingRequests: session.maxRequests - session.requestCount,
            sequence: heartbeatData.sequence,
            timestamp: Date.now()
        });
    } catch (error) {
        return res.status(500).json({
            alive: false,
            error: error.message
        });
    }
}

function analyzeClientBehavior(sessionToken) {
    const heartbeat = global.heartbeats[sessionToken];
    if (!heartbeat) {
        return { riskScore: 0, reason: 'No data' };
    }

    const analysis = {
        riskScore: 0,
        reasons: []
    };

    // Kiểm tra tần suất heartbeat
    const timeSinceLastHeartbeat = Date.now() - heartbeat.lastHeartbeat;
    if (timeSinceLastHeartbeat < 1000) {
        analysis.riskScore += 30;
        analysis.reasons.push('Heartbeat too frequent');
    }

    // Kiểm tra sequence jumps
    if (heartbeat.sequence > 100 && heartbeat.sequence % 10 === 0) {
        analysis.riskScore += 10;
        analysis.reasons.push('Suspicious sequence pattern');
    }

    return {
        riskScore: analysis.riskScore,
        reason: analysis.reasons.join(', ') || 'Normal'
    };
}
