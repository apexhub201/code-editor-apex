// api/analytics.js - APEX HUB Script Analytics (COMPLETE)
import FirebaseManager from '../lib/firebase.js';
import Security from '../lib/security.js';

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Auth-Key');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Handle OPTIONS preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Rate limiting
    const clientIP = Security.getClientIP(req);
    if (!Security.checkRateLimit(clientIP, 60, 60000)) {
        return res.status(429).json({ 
            success: false, 
            error: 'Rate limit exceeded. Please try again later.' 
        });
    }

    try {
        // Route based on method
        if (req.method === 'POST') {
            return await handleTrackActivation(req, res);
        }

        if (req.method === 'GET') {
            return await handleGetAnalytics(req, res);
        }

        return res.status(405).json({ 
            success: false, 
            error: 'Method not allowed' 
        });
    } catch (error) {
        console.error('[APEX Analytics] Handler error:', error);
        return res.status(500).json({ 
            success: false, 
            error: 'Internal server error',
            message: error.message 
        });
    }
}

// ============================================================
// POST /api/analytics - Track script activation
// Body: { scriptName, sessionToken, hwid, owner }
// ============================================================
async function handleTrackActivation(req, res) {
    try {
        const { scriptName, sessionToken, hwid, owner } = req.body;

        if (!scriptName) {
            return res.status(400).json({ 
                success: false, 
                error: 'Script name is required' 
            });
        }

        // Validate session if provided
        if (sessionToken) {
            global.sessions = global.sessions || {};
            const session = global.sessions[sessionToken];
            if (!session || !session.active) {
                return res.status(401).json({ 
                    success: false, 
                    error: 'Invalid session token' 
                });
            }
            if (Date.now() > session.expiresAt) {
                delete global.sessions[sessionToken];
                return res.status(401).json({ 
                    success: false, 
                    error: 'Session expired' 
                });
            }
        }

        const now = new Date();
        const dayKey = now.toISOString().split('T')[0];   // YYYY-MM-DD
        const monthKey = now.toISOString().slice(0, 7);    // YYYY-MM
        const yearKey = now.getFullYear().toString();      // YYYY
        const deviceId = hwid || sessionToken || 'unknown';
        const activationId = `${scriptName}_${deviceId}`;

        let tracked = false;

        // Try Firebase if available
        if (FirebaseManager.isAvailable()) {
            try {
                const db = FirebaseManager.getDB();
                const batch = db.batch();

                // 1. Log individual activation
                const activationRef = db.collection('script_analytics').doc();
                batch.set(activationRef, {
                    scriptName: scriptName,
                    deviceId: deviceId,
                    sessionToken: sessionToken || null,
                    owner: owner || null,
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
                    owner: owner || 'unknown',
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
                tracked = true;
                console.log(`[APEX Analytics] Tracked activation for ${scriptName} from ${deviceId}`);
            } catch (fbError) {
                console.error('[APEX Analytics] Firebase tracking error:', fbError.message);
            }
        }

        // Memory fallback (always track in memory for real-time)
        global.analytics = global.analytics || {};
        global.analytics[scriptName] = global.analytics[scriptName] || {
            scriptName: scriptName,
            owner: owner || 'unknown',
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

        return res.status(200).json({
            success: true,
            message: 'Activation tracked successfully',
            scriptName: scriptName,
            dayKey: dayKey,
            monthKey: monthKey,
            totalActivations: stats.totalActivations,
            uniqueDevices: stats.devices.size,
            tracked: tracked
        });

    } catch (error) {
        console.error('[APEX Analytics] Track activation error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to track activation',
            message: error.message
        });
    }
}

// ============================================================
// GET /api/analytics?scriptName=xxx&owner=uid&period=all|daily|monthly|yearly
// ============================================================
async function handleGetAnalytics(req, res) {
    try {
        const { scriptName, owner, period = 'all', date, month, year } = req.query;

        if (!scriptName && !owner) {
            return res.status(400).json({
                success: false,
                error: 'Either scriptName or owner parameter is required'
            });
        }

        // Get from memory first (fast path)
        global.analytics = global.analytics || {};

        if (scriptName && global.analytics[scriptName]) {
            const stats = global.analytics[scriptName];
            return res.json({
                success: true,
                source: 'memory',
                scriptName: scriptName,
                owner: stats.owner,
                totalActivations: stats.totalActivations,
                totalUniqueDevices: stats.devices.size,
                daily: stats.daily,
                monthly: stats.monthly,
                yearly: stats.yearly,
                devices: Array.from(stats.devices).slice(0, 50), // Limit to 50 devices
                deviceCount: stats.devices.size
            });
        }

        // Try Firebase
        if (FirebaseManager.isAvailable()) {
            try {
                const db = FirebaseManager.getDB();

                if (scriptName) {
                    // Get single script stats
                    const statsDoc = await db.collection('script_stats').doc(scriptName).get();

                    if (!statsDoc.exists) {
                        return res.json({
                            success: true,
                            source: 'firebase',
                            scriptName: scriptName,
                            totalActivations: 0,
                            totalUniqueDevices: 0,
                            daily: {},
                            monthly: {},
                            yearly: {},
                            devices: []
                        });
                    }

                    const data = statsDoc.data();
                    const daily = {};
                    const monthly = {};
                    const yearly = {};

                    Object.keys(data).forEach(key => {
                        if (key.startsWith('daily_')) {
                            daily[key.replace('daily_', '')] = data[key];
                        } else if (key.startsWith('monthly_')) {
                            monthly[key.replace('monthly_', '')] = data[key];
                        } else if (key.startsWith('yearly_')) {
                            yearly[key.replace('yearly_', '')] = data[key];
                        }
                    });

                    // Get unique devices count
                    const devicesSnap = await db.collection('script_devices')
                        .where('scriptName', '==', scriptName)
                        .get();

                    // Get recent activations (last 20)
                    const recentSnap = await db.collection('script_analytics')
                        .where('scriptName', '==', scriptName)
                        .orderBy('activatedAt', 'desc')
                        .limit(20)
                        .get();

                    const recentActivations = [];
                    recentSnap.forEach(doc => {
                        const a = doc.data();
                        recentActivations.push({
                            deviceId: a.deviceId,
                            activatedAt: a.activatedAt,
                            dayKey: a.dayKey
                        });
                    });

                    return res.json({
                        success: true,
                        source: 'firebase',
                        scriptName: scriptName,
                        owner: data.owner || 'unknown',
                        totalActivations: data.totalActivations || 0,
                        totalUniqueDevices: devicesSnap.size,
                        daily: daily,
                        monthly: monthly,
                        yearly: yearly,
                        recentActivations: recentActivations,
                        updatedAt: data.updatedAt || Date.now()
                    });
                }

                if (owner) {
                    // Get all scripts for owner
                    const scriptsSnap = await db.collection('script_stats')
                        .where('owner', '==', owner)
                        .get();

                    const scripts = [];
                    let totalActivations = 0;

                    scriptsSnap.forEach(doc => {
                        const data = doc.data();
                        const activationCount = data.totalActivations || 0;
                        totalActivations += activationCount;
                        scripts.push({
                            scriptName: doc.id,
                            totalActivations: activationCount,
                            updatedAt: data.updatedAt || Date.now()
                        });
                    });

                    // Sort by total activations descending
                    scripts.sort((a, b) => b.totalActivations - a.totalActivations);

                    return res.json({
                        success: true,
                        source: 'firebase',
                        owner: owner,
                        scripts: scripts,
                        totalScripts: scripts.length,
                        totalActivations: totalActivations
                    });
                }

            } catch (fbError) {
                console.error('[APEX Analytics] Firebase fetch error:', fbError.message);
            }
        }

        // Fallback: empty stats
        return res.json({
            success: true,
            source: 'none',
            scriptName: scriptName || null,
            owner: owner || null,
            totalActivations: 0,
            totalUniqueDevices: 0,
            daily: {},
            monthly: {},
            yearly: {},
            scripts: [],
            totalScripts: 0
        });

    } catch (error) {
        console.error('[APEX Analytics] Get analytics error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to get analytics',
            message: error.message
        });
    }
}

// ============================================================
// GET /api/analytics/overview - Get overview for dashboard
// ============================================================
async function handleGetOverview(req, res) {
    try {
        const { days = 7 } = req.query;
        const daysCount = parseInt(days) || 7;

        global.analytics = global.analytics || {};

        // Generate date range
        const dates = [];
        for (let i = daysCount - 1; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            dates.push(d.toISOString().split('T')[0]);
        }

        const overview = {
            totalScripts: Object.keys(global.analytics).length,
            totalActivations: 0,
            totalUniqueDevices: 0,
            dailyTrend: {},
            topScripts: []
        };

        // Initialize daily trend
        dates.forEach(date => {
            overview.dailyTrend[date] = 0;
        });

        // Aggregate from memory
        Object.keys(global.analytics).forEach(scriptName => {
            const stats = global.analytics[scriptName];
            overview.totalActivations += stats.totalActivations;
            overview.totalUniqueDevices += stats.devices.size;

            // Daily trend
            dates.forEach(date => {
                overview.dailyTrend[date] += stats.daily[date] || 0;
            });

            // Top scripts
            overview.topScripts.push({
                scriptName: scriptName,
                totalActivations: stats.totalActivations,
                uniqueDevices: stats.devices.size
            });
        });

        // Sort top scripts
        overview.topScripts.sort((a, b) => b.totalActivations - a.totalActivations);
        overview.topScripts = overview.topScripts.slice(0, 10);

        return res.json({
            success: true,
            overview: overview
        });

    } catch (error) {
        console.error('[APEX Analytics] Overview error:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

// Export additional functions for testing
export { handleTrackActivation, handleGetAnalytics, handleGetOverview };
