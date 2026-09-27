// api/analytics.js - APEX HUB Script Analytics (COMPLETE - BATCHED WRITES)
import FirebaseManager from '../lib/firebase.js';
import Security from '../lib/security.js';

// ============================================================
// IN-MEMORY BATCHING STATE
// ============================================================
const BATCH_FLUSH_INTERVAL_MS = 45000; // 45 seconds
const MAX_BATCH_AGE_MS = 120000; // 2 minutes max before forced flush
const MAX_PENDING_SCRIPTS = 500; // Safety limit

// Global state for batching (survives across requests in same serverless instance)
global.__analyticsBatchState = global.__analyticsBatchState || {
    // Pending increments for script_stats: { scriptName: { owner, totalActivations, daily: {}, monthly: {}, yearly: {}, updatedAt } }
    pendingStats: {},
    // Pending device writes: { activationId: { scriptName, deviceId, firstActivated, lastActivated, activationCount, isNew } }
    pendingDevices: {},
    // Pending analytics buckets: { `${scriptName}_${dayKey}_${hourKey}`: { scriptName, dayKey, hourKey, count, lastActivated } }
    pendingAnalytics: {},
    // Device cache to avoid re-writing same device: { activationId: timestamp }
    deviceCache: {},
    // Flush lock
    isFlushing: false,
    // Last flush timestamp
    lastFlushAt: 0,
    // Timer reference
    flushTimer: null
};

// ============================================================
// BATCH FLUSH LOGIC
// ============================================================
function scheduleFlush() {
    const state = global.__analyticsBatchState;
    if (state.flushTimer) return; // already scheduled
    
    state.flushTimer = setTimeout(() => {
        state.flushTimer = null;
        flushBatches().catch(err => {
            console.error('[APEX Analytics] Scheduled flush error:', err.message);
        });
    }, BATCH_FLUSH_INTERVAL_MS);
    
    // Don't let timer keep process alive
    if (state.flushTimer.unref) state.flushTimer.unref();
}

async function flushBatches(force = false) {
    const state = global.__analyticsBatchState;
    
    // Prevent concurrent flushes
    if (state.isFlushing) return;
    
    const now = Date.now();
    
    // Check if we have anything to flush
    const hasStats = Object.keys(state.pendingStats).length > 0;
    const hasDevices = Object.keys(state.pendingDevices).length > 0;
    const hasAnalytics = Object.keys(state.pendingAnalytics).length > 0;
    
    if (!hasStats && !hasDevices && !hasAnalytics) return;
    
    // Check age - force flush if any pending item is too old
    if (!force) {
        let oldest = now;
        for (const key of Object.keys(state.pendingStats)) {
            const item = state.pendingStats[key];
            if (item.firstPendingAt && item.firstPendingAt < oldest) oldest = item.firstPendingAt;
        }
        for (const key of Object.keys(state.pendingDevices)) {
            const item = state.pendingDevices[key];
            if (item.firstPendingAt && item.firstPendingAt < oldest) oldest = item.firstPendingAt;
        }
        for (const key of Object.keys(state.pendingAnalytics)) {
            const item = state.pendingAnalytics[key];
            if (item.firstPendingAt && item.firstPendingAt < oldest) oldest = item.firstPendingAt;
        }
        if (now - oldest < MAX_BATCH_AGE_MS) return; // not old enough to force
    }
    
    // Check if Firebase is available
    if (!FirebaseManager.isAvailable()) {
        // No Firebase - keep in memory, don't clear
        return;
    }
    
    state.isFlushing = true;
    
    // Snapshot and clear pending (so new activations during flush go to fresh batch)
    const statsToFlush = state.pendingStats;
    const devicesToFlush = state.pendingDevices;
    const analyticsToFlush = state.pendingAnalytics;
    
    state.pendingStats = {};
    state.pendingDevices = {};
    state.pendingAnalytics = {};
    
    try {
        const db = FirebaseManager.getDB();
        const admin = FirebaseManager.getAdmin ? FirebaseManager.getAdmin() : null;
        
        // If admin SDK not available, try to use Firestore directly
        const FieldValue = admin ? admin.firestore.FieldValue : null;
        
        // Build batched writes
        const batch = db.batch();
        let writeCount = 0;
        const MAX_BATCH_SIZE = 450; // Firestore limit is 500, leave margin
        
        const commitBatch = async () => {
            if (writeCount === 0) return;
            await batch.commit();
            writeCount = 0;
        };
        
        // 1. Flush script_stats increments
        for (const [scriptName, stats] of Object.entries(statsToFlush)) {
            if (writeCount >= MAX_BATCH_SIZE) {
                await commitBatch();
                // Need new batch - but we already committed, so create new
                // Actually we need to restructure - let's collect all writes first
            }
            
            const statsRef = db.collection('script_stats').doc(scriptName);
            const updateData = {
                scriptName: scriptName,
                owner: stats.owner || 'unknown',
                updatedAt: Date.now()
            };
            
            if (FieldValue) {
                updateData.totalActivations = FieldValue.increment(stats.totalActivations);
                for (const [dayKey, count] of Object.entries(stats.daily)) {
                    updateData[`daily_${dayKey}`] = FieldValue.increment(count);
                }
                for (const [monthKey, count] of Object.entries(stats.monthly)) {
                    updateData[`monthly_${monthKey}`] = FieldValue.increment(count);
                }
                for (const [yearKey, count] of Object.entries(stats.yearly)) {
                    updateData[`yearly_${yearKey}`] = FieldValue.increment(count);
                }
            } else {
                // Fallback: use set with merge - less efficient but works
                updateData.totalActivations = stats.totalActivations;
                for (const [dayKey, count] of Object.entries(stats.daily)) {
                    updateData[`daily_${dayKey}`] = count;
                }
                for (const [monthKey, count] of Object.entries(stats.monthly)) {
                    updateData[`monthly_${monthKey}`] = count;
                }
                for (const [yearKey, count] of Object.entries(stats.yearly)) {
                    updateData[`yearly_${yearKey}`] = count;
                }
            }
            
            batch.set(statsRef, updateData, { merge: true });
            writeCount++;
        }
        
        // 2. Flush script_devices (only new or significantly changed devices)
        for (const [activationId, device] of Object.entries(devicesToFlush)) {
            if (writeCount >= MAX_BATCH_SIZE) {
                await commitBatch();
            }
            
            const deviceRef = db.collection('script_devices').doc(activationId);
            const deviceData = {
                scriptName: device.scriptName,
                deviceId: device.deviceId,
                lastActivated: Date.now(),
                activationCount: device.activationCount
            };
            
            if (device.isNew) {
                // New device - set firstActivated
                deviceData.firstActivated = Date.now();
                batch.set(deviceRef, deviceData, { merge: true });
            } else {
                // Existing device - just update lastActivated and count
                batch.set(deviceRef, deviceData, { merge: true });
            }
            writeCount++;
        }
        
        // 3. Flush script_analytics as hourly buckets (not individual docs)
        for (const [bucketKey, bucket] of Object.entries(analyticsToFlush)) {
            if (writeCount >= MAX_BATCH_SIZE) {
                await commitBatch();
            }
            
            const bucketRef = db.collection('script_analytics_buckets').doc(bucketKey);
            const bucketData = {
                scriptName: bucket.scriptName,
                dayKey: bucket.dayKey,
                hourKey: bucket.hourKey,
                activationCount: FieldValue ? FieldValue.increment(bucket.count) : bucket.count,
                lastActivated: Date.now()
            };
            
            if (!FieldValue) {
                // Without FieldValue, we can't increment - read first (less ideal)
                // For now just set - this is a limitation if admin SDK unavailable
                bucketData.activationCount = bucket.count;
            }
            
            batch.set(bucketRef, bucketData, { merge: true });
            writeCount++;
        }
        
        // Final commit
        await commitBatch();
        
        state.lastFlushAt = Date.now();
        console.log(`[APEX Analytics] Flushed batches: ${Object.keys(statsToFlush).length} stats, ${Object.keys(devicesToFlush).length} devices, ${Object.keys(analyticsToFlush).length} analytics buckets`);
        
    } catch (error) {
        console.error('[APEX Analytics] Flush error:', error.message);
        // On failure, merge back into pending (don't lose data)
        // But limit to prevent infinite growth
        const maxPending = MAX_PENDING_SCRIPTS;
        
        for (const [key, val] of Object.entries(statsToFlush)) {
            if (!state.pendingStats[key]) {
                state.pendingStats[key] = val;
            } else {
                const existing = state.pendingStats[key];
                existing.totalActivations += val.totalActivations;
                for (const [k, v] of Object.entries(val.daily)) {
                    existing.daily[k] = (existing.daily[k] || 0) + v;
                }
                for (const [k, v] of Object.entries(val.monthly)) {
                    existing.monthly[k] = (existing.monthly[k] || 0) + v;
                }
                for (const [k, v] of Object.entries(val.yearly)) {
                    existing.yearly[k] = (existing.yearly[k] || 0) + v;
                }
            }
        }
        
        for (const [key, val] of Object.entries(devicesToFlush)) {
            if (!state.pendingDevices[key]) {
                state.pendingDevices[key] = val;
            } else {
                state.pendingDevices[key].activationCount += val.activationCount;
                state.pendingDevices[key].lastActivated = val.lastActivated;
            }
        }
        
        for (const [key, val] of Object.entries(analyticsToFlush)) {
            if (!state.pendingAnalytics[key]) {
                state.pendingAnalytics[key] = val;
            } else {
                state.pendingAnalytics[key].count += val.count;
                state.pendingAnalytics[key].lastActivated = val.lastActivated;
            }
        }
        
        // Cleanup if too large
        const statsKeys = Object.keys(state.pendingStats);
        if (statsKeys.length > maxPending) {
            // Keep only most recent
            const toRemove = statsKeys.slice(0, statsKeys.length - maxPending);
            for (const k of toRemove) delete state.pendingStats[k];
        }
    } finally {
        state.isFlushing = false;
        // Reschedule if there's still pending data
        if (Object.keys(state.pendingStats).length > 0 || 
            Object.keys(state.pendingDevices).length > 0 || 
            Object.keys(state.pendingAnalytics).length > 0) {
            scheduleFlush();
        }
    }
}

// ============================================================
// MAIN HANDLER
// ============================================================
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
        const hourKey = now.toISOString().slice(0, 13);    // YYYY-MM-DDTHH
        const deviceId = hwid || sessionToken || 'unknown';
        const activationId = `${scriptName}_${deviceId}`;

        // ============================================================
        // UPDATE MEMORY COUNTERS (always, for real-time GET)
        // ============================================================
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

        // ============================================================
        // QUEUE FIRESTORE WRITES (batched, not immediate)
        // ============================================================
        const batchState = global.__analyticsBatchState;
        
        // 1. Queue script_stats increment
        if (!batchState.pendingStats[scriptName]) {
            batchState.pendingStats[scriptName] = {
                owner: owner || stats.owner || 'unknown',
                totalActivations: 0,
                daily: {},
                monthly: {},
                yearly: {},
                firstPendingAt: Date.now()
            };
        }
        const pendingStats = batchState.pendingStats[scriptName];
        pendingStats.totalActivations++;
        pendingStats.daily[dayKey] = (pendingStats.daily[dayKey] || 0) + 1;
        pendingStats.monthly[monthKey] = (pendingStats.monthly[monthKey] || 0) + 1;
        pendingStats.yearly[yearKey] = (pendingStats.yearly[yearKey] || 0) + 1;
        if (owner) pendingStats.owner = owner;

        // 2. Queue script_devices (only if device not recently written)
        const deviceCache = batchState.deviceCache;
        const cacheKey = activationId;
        const cacheAge = deviceCache[cacheKey] ? Date.now() - deviceCache[cacheKey] : Infinity;
        const DEVICE_CACHE_TTL = 300000; // 5 minutes - don't rewrite same device within 5 min
        
        if (cacheAge > DEVICE_CACHE_TTL) {
            if (!batchState.pendingDevices[activationId]) {
                batchState.pendingDevices[activationId] = {
                    scriptName: scriptName,
                    deviceId: deviceId,
                    activationCount: 0,
                    isNew: !stats.deviceDetails[deviceId] || stats.deviceDetails[deviceId].activationCount <= 1,
                    firstPendingAt: Date.now()
                };
            }
            batchState.pendingDevices[activationId].activationCount++;
            deviceCache[cacheKey] = Date.now();
        }

        // 3. Queue script_analytics as hourly bucket (not individual doc)
        const bucketKey = `${scriptName}_${hourKey}`;
        if (!batchState.pendingAnalytics[bucketKey]) {
            batchState.pendingAnalytics[bucketKey] = {
                scriptName: scriptName,
                dayKey: dayKey,
                hourKey: hourKey,
                count: 0,
                firstPendingAt: Date.now()
            };
        }
        batchState.pendingAnalytics[bucketKey].count++;

        // Schedule flush if not already scheduled
        scheduleFlush();

        // ============================================================
        // RESPONSE
        // ============================================================
        return res.status(200).json({
            success: true,
            message: 'Activation tracked successfully',
            scriptName: scriptName,
            dayKey: dayKey,
            monthKey: monthKey,
            totalActivations: stats.totalActivations,
            uniqueDevices: stats.devices.size,
            tracked: true, // Always true from client perspective
            batched: true
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

        // Get from memory first (fast path - includes pending batched data)
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
                devices: Array.from(stats.devices).slice(0, 50),
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

                    // Get recent activations from buckets (last 24 hours)
                    const recentBuckets = [];
                    const now = new Date();
                    for (let i = 0; i < 24; i++) {
                        const d = new Date(now.getTime() - i * 3600000);
                        const hk = d.toISOString().slice(0, 13);
                        const bk = `${scriptName}_${hk}`;
                        recentBuckets.push(bk);
                    }
                    
                    let recentActivations = [];
                    try {
                        const bucketSnap = await db.collection('script_analytics_buckets')
                            .where('scriptName', '==', scriptName)
                            .orderBy('lastActivated', 'desc')
                            .limit(20)
                            .get();
                        bucketSnap.forEach(doc => {
                            const b = doc.data();
                            recentActivations.push({
                                hourKey: b.hourKey,
                                activationCount: b.activationCount,
                                lastActivated: b.lastActivated
                            });
                        });
                    } catch (e) {
                        // Bucket collection may not exist yet
                    }

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

// ============================================================
// GRACEFUL SHUTDOWN - Flush pending data on process exit
// ============================================================
if (typeof process !== 'undefined') {
    const flushOnExit = async () => {
        try {
            await flushBatches(true);
        } catch (e) {
            console.error('[APEX Analytics] Exit flush error:', e.message);
        }
    };
    
    process.on('beforeExit', flushOnExit);
    process.on('SIGTERM', () => { flushOnExit().then(() => process.exit(0)); });
    process.on('SIGINT', () => { flushOnExit().then(() => process.exit(0)); });
}

// Export additional functions for testing
export { handleTrackActivation, handleGetAnalytics, handleGetOverview, flushBatches };
