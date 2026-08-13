// api/get-script.js - APEX HUB Script Delivery with Analytics Tracking (COMPLETE)
import Crypto from '../lib/crypto.js';
import FirebaseManager from '../lib/firebase.js';
import Security from '../lib/security.js';

// Global state
global.scripts = global.scripts || {};
global.sessions = global.sessions || {};
global.analytics = global.analytics || {};

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Auth-Key');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Handle OPTIONS preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Only allow POST
    if (req.method !== 'POST') {
        return res.status(405).json({ 
            success: false, 
            error: 'Method not allowed' 
        });
    }

    // Rate limiting
    const clientIP = Security.getClientIP(req);
    if (!Security.checkRateLimit(clientIP, 60, 60000)) {
        Security.banIP(clientIP, 300000);
        return res.status(429).json({ 
            success: false, 
            error: 'Rate limit exceeded' 
        });
    }

    try {
        return await handleGetScript(req, res);
    } catch (error) {
        console.error('[APEX get-script] Handler error:', error);
        return res.status(500).json({ 
            success: false, 
            error: 'Internal server error',
            message: error.message 
        });
    }
}

// ============================================================
// POST /api/get-script - Get script with session validation
// Body: { sessionToken, hwid, scriptName }
// ============================================================
async function handleGetScript(req, res) {
    try {
        const { sessionToken, hwid, scriptName } = req.body;

        // Validate session token
        if (!sessionToken) {
            return res.status(401).json({ 
                success: false, 
                error: 'No session token provided' 
            });
        }

        const session = global.sessions[sessionToken];
        if (!session || !session.active) {
            return res.status(401).json({ 
                success: false, 
                error: 'Invalid session token' 
            });
        }

        // Check session expiry
        if (Date.now() > session.expiresAt) {
            delete global.sessions[sessionToken];
            return res.status(401).json({ 
                success: false, 
                error: 'Session expired. Please re-authenticate.' 
            });
        }

        // Get script name (default to 'main')
        const scriptNameToUse = scriptName || 'main';
        
        // Try to get script from Firebase first
        let script = null;
        let scriptSource = 'memory';

        if (FirebaseManager.isAvailable()) {
            try {
                const firebaseScript = await FirebaseManager.getScript(scriptNameToUse);
                if (firebaseScript) {
                    script = firebaseScript;
                    scriptSource = 'firebase';
                }
            } catch (fbError) {
                console.error('[APEX get-script] Firebase fetch error:', fbError.message);
            }
        }

        // Fallback to memory
        if (!script) {
            script = global.scripts[scriptNameToUse];
        }

        if (!script) {
            return res.status(404).json({ 
                success: false, 
                error: 'Script not found',
                scriptName: scriptNameToUse
            });
        }

        // Track activation
        await trackActivation(scriptNameToUse, sessionToken, hwid, session);

        // Encrypt script payload
        const encryptKey = Crypto.generateRandomString(16);
        const encryptedPayload = Crypto.encrypt(script.code, encryptKey);

        // Clean up sensitive data
        const payloadData = JSON.stringify(encryptedPayload.data);

        // Update session last used
        session.lastUsed = Date.now();
        session.scriptAccessed = scriptNameToUse;

        return res.status(200).json({
            success: true,
            payload: payloadData,
            decryptKey: encryptKey,
            checksum: encryptedPayload.checksum,
            scriptName: scriptNameToUse,
            source: scriptSource,
            timestamp: Date.now(),
            version: '3.0.0'
        });

    } catch (error) {
        console.error('[APEX get-script] Error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to get script',
            message: error.message
        });
    }
}

// ============================================================
// Track script activation
// ============================================================
async function trackActivation(scriptName, sessionToken, hwid, session) {
    try {
        const now = new Date();
        const dayKey = now.toISOString().split('T')[0];
        const monthKey = now.toISOString().slice(0, 7);
        const yearKey = now.getFullYear().toString();
        const deviceId = hwid || session?.hwid || sessionToken || 'unknown';
        const activationId = `${scriptName}_${deviceId}`;
        const owner = session?.key || 'unknown';

        // Track in memory (always)
        global.analytics[scriptName] = global.analytics[scriptName] || {
            scriptName: scriptName,
            owner: owner,
            totalActivations: 0,
            daily: {},
            monthly: {},
            yearly: {},
            devices: new Set(),
            deviceDetails: {}
        };

        const stats = global.analytics[scriptName];
        stats.totalActivations++;
        stats.daily[dayKey] = (stats.daily[dayKey] || 0) + 1;
        stats.monthly[monthKey] = (stats.monthly[monthKey] || 0) + 1;
        stats.yearly[yearKey] = (stats.yearly[yearKey] || 0) + 1;
        stats.devices.add(deviceId);

        if (!stats.deviceDetails[deviceId]) {
            stats.deviceDetails[deviceId] = {
                firstActivated: Date.now(),
                lastActivated: Date.now(),
                activationCount: 1
            };
        } else {
            stats.deviceDetails[deviceId].lastActivated = Date.now();
            stats.deviceDetails[deviceId].activationCount++;
        }

        // Track in Firebase (if available)
        if (FirebaseManager.isAvailable()) {
            try {
                const db = FirebaseManager.getDB();
                const batch = db.batch();

                // 1. Log individual activation
                const activationRef = db.collection('script_analytics').doc();
                batch.set(activationRef, {
                    scriptName: scriptName,
                    deviceId: deviceId,
                    sessionToken: sessionToken,
                    owner: owner,
                    activatedAt: Date.now(),
                    dayKey: dayKey,
                    monthKey: monthKey,
                    yearKey: yearKey,
                    timestamp: now.toISOString()
                });

                // 2. Update aggregate stats
                const statsRef = db.collection('script_stats').doc(scriptName);
                batch.set(statsRef, {
                    scriptName: scriptName,
                    owner: owner,
                    totalActivations: admin.firestore.FieldValue.increment(1),
                    [`daily_${dayKey}`]: admin.firestore.FieldValue.increment(1),
                    [`monthly_${monthKey}`]: admin.firestore.FieldValue.increment(1),
                    [`yearly_${yearKey}`]: admin.firestore.FieldValue.increment(1),
                    updatedAt: Date.now()
                }, { merge: true });

                // 3. Track unique devices
                const deviceRef = db.collection('script_devices').doc(activationId);
                batch.set(deviceRef, {
                    scriptName: scriptName,
                    deviceId: deviceId,
                    firstActivated: admin.firestore.FieldValue.serverTimestamp(),
                    lastActivated: admin.firestore.FieldValue.serverTimestamp(),
                    activationCount: admin.firestore.FieldValue.increment(1)
                }, { merge: true });

                await batch.commit();
                console.log(`[APEX] Tracked activation: ${scriptName} by ${deviceId}`);
            } catch (fbError) {
                console.error('[APEX get-script] Firebase tracking error:', fbError.message);
            }
        }

        return stats;
    } catch (error) {
        console.error('[APEX get-script] Track activation error:', error);
        return null;
    }
}

// ============================================================
// Helper: Get script analytics
// ============================================================
export async function getScriptAnalytics(scriptName) {
    const stats = global.analytics[scriptName];
    
    if (!stats) {
        return {
            scriptName: scriptName,
            totalActivations: 0,
            totalUniqueDevices: 0,
            daily: {},
            monthly: {},
            yearly: {},
            devices: []
        };
    }

    return {
        scriptName: scriptName,
        owner: stats.owner,
        totalActivations: stats.totalActivations,
        totalUniqueDevices: stats.devices.size,
        daily: stats.daily,
        monthly: stats.monthly,
        yearly: stats.yearly,
        devices: Array.from(stats.devices).slice(0, 100),
        deviceDetails: stats.deviceDetails
    };
}

// ============================================================
// Helper: Get all scripts analytics for an owner
// ============================================================
export function getOwnerAnalytics(owner) {
    const scripts = [];
    let totalActivations = 0;
    let totalDevices = 0;

    Object.keys(global.analytics).forEach(scriptName => {
        const stats = global.analytics[scriptName];
        if (stats.owner === owner) {
            scripts.push({
                scriptName: scriptName,
                totalActivations: stats.totalActivations,
                uniqueDevices: stats.devices.size,
                daily: stats.daily,
                monthly: stats.monthly
            });
            totalActivations += stats.totalActivations;
            totalDevices += stats.devices.size;
        }
    });

    scripts.sort((a, b) => b.totalActivations - a.totalActivations);

    return {
        owner: owner,
        totalScripts: scripts.length,
        totalActivations: totalActivations,
        totalUniqueDevices: totalDevices,
        scripts: scripts
    };
}

// Export for testing
export { handleGetScript, trackActivation, getScriptAnalytics, getOwnerAnalytics };
