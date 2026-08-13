// api/raw.js - APEX HUB Script Management with Analytics (COMPLETE)
import FirebaseManager from '../lib/firebase.js';
import Security from '../lib/security.js';

// Global state
global.scripts = global.scripts || {};
global.analytics = global.analytics || {};
global.challenges = global.challenges || {};

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Challenge-Token, X-Challenge-Answer, X-Auth-Key');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');

    // Handle OPTIONS preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const clientIP = Security.getClientIP(req);
    
    // Rate limiting
    if (!Security.checkRateLimit(clientIP, 60, 60000)) {
        Security.banIP(clientIP, 300000);
        return res.status(429).json({ 
            success: false, 
            error: 'Rate limit exceeded' 
        });
    }

    try {
        // Route based on method
        if (req.method === 'GET') {
            return await handleGet(req, res, clientIP);
        }
        if (req.method === 'POST') {
            return await handleCreate(req, res);
        }
        if (req.method === 'PUT') {
            return await handleUpdate(req, res);
        }
        if (req.method === 'DELETE') {
            return await handleDelete(req, res);
        }
        return res.status(405).json({ 
            success: false, 
            error: 'Method not allowed' 
        });
    } catch (error) {
        console.error('[APEX raw] Handler error:', error);
        return res.status(500).json({ 
            success: false, 
            error: 'Internal server error',
            message: error.message 
        });
    }
}

// ============================================================
// GET /api/raw?name=script&key=xxx&raw=true&challenge=xxx&answer=xxx
// ============================================================
async function handleGet(req, res, clientIP) {
    try {
        const { name, key, raw, challenge, answer, analytics } = req.query;
        const ua = (req.headers['user-agent'] || '').toLowerCase();
        const authKey = req.headers['x-auth-key'] || '';

        // Check if IP is banned
        if (Security.isIPBanned(clientIP)) {
            return res.status(403).json({ 
                success: false, 
                error: 'IP banned' 
            });
        }

        // Check if analytics requested
        if (analytics === 'true') {
            return await handleAnalyticsRequest(req, res, name);
        }

        // No name - show welcome page
        if (!name) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.send(getWelcomePage());
        }

        // Get script
        const scriptData = await getScript(name);
        if (!scriptData) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.status(404).send(getErrorPage(name));
        }

        // Track script access
        await trackScriptAccess(name, clientIP);

        // Valid keys
        const VALID_KEYS = ['d0egkw6en9eusrjje5vn70p2tvkngkkn', 'apex-master-key-2024'];
        const hasValidKey = VALID_KEYS.includes(key) || VALID_KEYS.includes(authKey);
        const wantsRaw = raw === 'true';

        // Return raw code if valid key or raw=true
        if (hasValidKey || wantsRaw) {
            return res.json({ 
                success: true, 
                code: scriptData.code,
                name: name,
                target: scriptData.target || 'lua',
                obfuscated: scriptData.obfuscated || false,
                created: scriptData.created,
                updated: scriptData.updated || scriptData.created
            });
        }

        // Check for executor User-Agent
        const executorPatterns = [
            'roblox', 'synapse', 'krnl', 'script-ware', 'sentinel',
            'fluxus', 'electron', 'comet', 'oxygen', 'valyse',
            'hydrogen', 'codex', 'vega', 'trigon', 'nexus',
            'solara', 'jjsploit', 'celestial', 'evon', 'aris'
        ];
        const isExecutor = executorPatterns.some(p => ua.includes(p));

        if (isExecutor) {
            // Return encrypted loader for executor
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
            return res.send(generateLoader(scriptData.code));
        }

        // Check if challenge provided
        if (challenge && answer) {
            const challengeValid = await verifyChallenge(challenge, answer);
            if (challengeValid) {
                return res.json({ 
                    success: true, 
                    code: scriptData.code 
                });
            }
        }

        // Browser request - show protection page
        const isBrowser = ua.includes('mozilla') || ua.includes('chrome') ||
                          ua.includes('safari') || ua.includes('firefox');

        if (isBrowser) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.send(getProtectionPage(name));
        }

        // Generate new challenge for non-browser non-executor
        const newChallenge = generateChallenge();
        try {
            if (FirebaseManager.isAvailable()) {
                const db = FirebaseManager.getDB();
                await db.collection('challenges').doc(newChallenge.token).set({
                    answer: newChallenge.answer,
                    createdAt: Date.now(),
                    used: false,
                    attempts: 0
                });
            }
            global.challenges[newChallenge.token] = {
                ...newChallenge,
                createdAt: Date.now(),
                used: false,
                attempts: 0
            };
        } catch (error) {
            console.error('[APEX raw] Challenge save error:', error.message);
        }

        return res.json({
            success: false,
            protected: true,
            message: 'Challenge required',
            challenge: {
                question: newChallenge.question,
                token: newChallenge.token
            }
        });

    } catch (error) {
        console.error('[APEX raw] GET error:', error);
        return res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
}

// ============================================================
// GET /api/raw?analytics=true&name=script&owner=uid
// ============================================================
async function handleAnalyticsRequest(req, res, name) {
    try {
        const { owner, period = 'all' } = req.query;

        if (name) {
            // Single script analytics
            const stats = await getScriptAnalytics(name);
            return res.json({
                success: true,
                ...stats
            });
        }

        if (owner) {
            // Owner analytics
            const stats = await getOwnerAnalytics(owner);
            return res.json({
                success: true,
                ...stats
            });
        }

        return res.status(400).json({
            success: false,
            error: 'name or owner required for analytics'
        });

    } catch (error) {
        console.error('[APEX raw] Analytics error:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

// ============================================================
// POST /api/raw - Create new script
// Body: { code, name, uid }
// ============================================================
async function handleCreate(req, res) {
    try {
        const { code, name, uid } = req.body;

        if (!code || !code.trim()) {
            return res.status(400).json({ 
                success: false, 
                error: 'Code is required' 
            });
        }

        if (!name || !name.trim()) {
            return res.status(400).json({ 
                success: false, 
                error: 'Name is required' 
            });
        }

        const nameSlug = normalizeName(name);
        const userId = uid || 'public';
        const fullName = userId + '_' + nameSlug;

        // Detect target (lua/luau)
        const target = detectTarget(code);

        // Apply Phantom Obfuscation
        const obfuscatedCode = phantomObfuscate(code);

        // Check if script already exists
        const existingScript = await getScript(fullName);
        if (existingScript) {
            // Create with timestamp suffix
            const newName = fullName + '_' + Date.now().toString(36);
            await saveScript(newName, {
                code: obfuscatedCode,
                originalCode: code,
                name: name.trim(),
                created: Date.now(),
                updated: Date.now(),
                lastAccessed: Date.now(),
                owner: userId,
                target: target,
                obfuscated: true,
                totalAccesses: 0
            });

            const rawUrl = `https://${req.headers.host}/api/raw?name=${newName}`;
            return res.status(200).json({ 
                success: true, 
                raw: rawUrl, 
                name: newName, 
                existed: true,
                target: target
            });
        }

        // Save new script
        await saveScript(fullName, {
            code: obfuscatedCode,
            originalCode: code,
            name: name.trim(),
            created: Date.now(),
            updated: Date.now(),
            lastAccessed: Date.now(),
            owner: userId,
            target: target,
            obfuscated: true,
            totalAccesses: 0
        });

        const rawUrl = `https://${req.headers.host}/api/raw?name=${fullName}`;
        return res.status(200).json({ 
            success: true, 
            raw: rawUrl, 
            name: fullName,
            target: target
        });

    } catch (error) {
        console.error('[APEX raw] Create error:', error);
        return res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
}

// ============================================================
// PUT /api/raw - Update existing script
// Body: { name, code, uid }
// ============================================================
async function handleUpdate(req, res) {
    try {
        const { name, code, uid } = req.body;

        if (!name) {
            return res.status(400).json({ 
                success: false, 
                error: 'Name is required' 
            });
        }

        if (!code || !code.trim()) {
            return res.status(400).json({ 
                success: false, 
                error: 'Code is required' 
            });
        }

        const scriptData = await getScript(name);
        if (!scriptData) {
            return res.status(404).json({ 
                success: false, 
                error: 'Script not found' 
            });
        }

        // Check ownership
        if (uid && scriptData.owner && scriptData.owner !== uid && scriptData.owner !== 'public') {
            return res.status(403).json({ 
                success: false, 
                error: 'Not your script' 
            });
        }

        // Apply obfuscation
        const obfuscatedCode = phantomObfuscate(code);
        const target = detectTarget(code);

        scriptData.code = obfuscatedCode;
        scriptData.originalCode = code;
        scriptData.updated = Date.now();
        scriptData.lastAccessed = Date.now();
        scriptData.target = target;
        scriptData.obfuscated = true;

        await saveScript(name, scriptData);

        return res.status(200).json({ 
            success: true, 
            message: 'Updated successfully', 
            name: name,
            target: target
        });

    } catch (error) {
        console.error('[APEX raw] Update error:', error);
        return res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
}

// ============================================================
// DELETE /api/raw?name=script&uid=owner
// ============================================================
async function handleDelete(req, res) {
    try {
        const { name, uid } = req.query;

        if (!name) {
            return res.status(400).json({ 
                success: false, 
                error: 'Name is required' 
            });
        }

        const scriptData = await getScript(name);
        if (!scriptData) {
            return res.status(404).json({ 
                success: false, 
                error: 'Script not found' 
            });
        }

        // Check ownership
        if (uid && scriptData.owner && scriptData.owner !== uid && scriptData.owner !== 'public') {
            return res.status(403).json({ 
                success: false, 
                error: 'Not your script' 
            });
        }

        await deleteScript(name);

        return res.status(200).json({ 
            success: true, 
            message: 'Deleted successfully' 
        });

    } catch (error) {
        console.error('[APEX raw] Delete error:', error);
        return res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function getScript(name) {
    if (FirebaseManager.isAvailable()) {
        return FirebaseManager.getScript(name);
    }
    return global.scripts[name] || null;
}

async function saveScript(name, data) {
    if (FirebaseManager.isAvailable()) {
        await FirebaseManager.saveScript(name, data);
    }
    global.scripts[name] = data;
    return true;
}

async function deleteScript(name) {
    if (FirebaseManager.isAvailable()) {
        await FirebaseManager.deleteScript(name);
    }
    delete global.scripts[name];
    return true;
}

function normalizeName(name) {
    return name.trim().toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') || 'script';
}

function detectTarget(code) {
    if (code.match(/\bgame\s*:\s*GetService\s*\(/) ||
        code.match(/\bInstance\.new\s*\(/) ||
        code.match(/\btask\.(spawn|wait|defer)\s*\(/) ||
        code.match(/\bworkspace\b/) ||
        code.match(/--!/)) {
        return 'luau';
    }
    return 'lua';
}

function generateChallenge() {
    const ops = ['+', '-', '*'];
    const op = ops[Math.floor(Math.random() * ops.length)];
    let num1, num2, answer;
    
    switch(op) {
        case '+': 
            num1 = Math.floor(Math.random() * 50) + 1; 
            num2 = Math.floor(Math.random() * 50) + 1; 
            answer = num1 + num2; 
            break;
        case '-': 
            num1 = Math.floor(Math.random() * 50) + 25; 
            num2 = Math.floor(Math.random() * 25) + 1; 
            answer = num1 - num2; 
            break;
        case '*': 
            num1 = Math.floor(Math.random() * 12) + 1; 
            num2 = Math.floor(Math.random() * 12) + 1; 
            answer = num1 * num2; 
            break;
    }
    
    return {
        question: `${num1} ${op} ${num2} = ?`,
        answer: answer.toString(),
        token: Math.random().toString(36).substring(2, 15) + Date.now().toString(36)
    };
}

async function verifyChallenge(token, answer) {
    // Check memory first
    const memChallenge = global.challenges[token];
    if (memChallenge && !memChallenge.used) {
        if (Date.now() - memChallenge.createdAt < 60000 && answer === memChallenge.answer) {
            memChallenge.used = true;
            return true;
        }
    }
    
    // Check Firebase
    if (FirebaseManager.isAvailable()) {
        try {
            const db = FirebaseManager.getDB();
            const doc = await db.collection('challenges').doc(token).get();
            if (doc.exists) {
                const c = doc.data();
                if (!c.used && Date.now() - c.createdAt < 60000 && answer === c.answer) {
                    await doc.ref.update({ used: true });
                    return true;
                }
            }
        } catch (error) {
            console.error('[APEX raw] Challenge verify error:', error.message);
        }
    }
    
    return false;
}

// ============================================================
// ANALYTICS TRACKING
// ============================================================

async function trackScriptAccess(scriptName, clientIP) {
    try {
        const now = new Date();
        const dayKey = now.toISOString().split('T')[0];
        const monthKey = now.toISOString().slice(0, 7);
        const yearKey = now.getFullYear().toString();

        // Memory tracking
        global.analytics[scriptName] = global.analytics[scriptName] || {
            scriptName: scriptName,
            totalAccesses: 0,
            totalUniqueIPs: new Set(),
            daily: {},
            monthly: {},
            yearly: {}
        };
        
        const stats = global.analytics[scriptName];
        stats.totalAccesses++;
        stats.totalUniqueIPs.add(clientIP);
        stats.daily[dayKey] = (stats.daily[dayKey] || 0) + 1;
        stats.monthly[monthKey] = (stats.monthly[monthKey] || 0) + 1;
        stats.yearly[yearKey] = (stats.yearly[yearKey] || 0) + 1;

        // Firebase tracking
        if (FirebaseManager.isAvailable()) {
            try {
                const db = FirebaseManager.getDB();
                const statsRef = db.collection('script_stats').doc(scriptName);
                await statsRef.set({
                    scriptName: scriptName,
                    totalAccesses: admin.firestore.FieldValue.increment(1),
                    [`daily_${dayKey}`]: admin.firestore.FieldValue.increment(1),
                    [`monthly_${monthKey}`]: admin.firestore.FieldValue.increment(1),
                    [`yearly_${yearKey}`]: admin.firestore.FieldValue.increment(1),
                    updatedAt: Date.now()
                }, { merge: true });
            } catch (fbError) {
                console.error('[APEX raw] Firebase tracking error:', fbError.message);
            }
        }
    } catch (error) {
        console.error('[APEX raw] Track access error:', error.message);
    }
}

async function getScriptAnalytics(scriptName) {
    // Check memory first
    if (global.analytics[scriptName]) {
        const stats = global.analytics[scriptName];
        return {
            scriptName: scriptName,
            totalAccesses: stats.totalAccesses,
            totalUniqueIPs: stats.totalUniqueIPs.size,
            daily: stats.daily,
            monthly: stats.monthly,
            yearly: stats.yearly
        };
    }

    // Check Firebase
    if (FirebaseManager.isAvailable()) {
        try {
            const db = FirebaseManager.getDB();
            const doc = await db.collection('script_stats').doc(scriptName).get();
            if (doc.exists) {
                const data = doc.data();
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

                return {
                    scriptName: scriptName,
                    totalAccesses: data.totalAccesses || 0,
                    daily: daily,
                    monthly: monthly,
                    yearly: yearly,
                    updatedAt: data.updatedAt || Date.now()
                };
            }
        } catch (error) {
            console.error('[APEX raw] Get analytics error:', error.message);
        }
    }

    return {
        scriptName: scriptName,
        totalAccesses: 0,
        totalUniqueIPs: 0,
        daily: {},
        monthly: {},
        yearly: {}
    };
}

async function getOwnerAnalytics(owner) {
    const scripts = [];
    let totalAccesses = 0;

    // Check memory
    Object.keys(global.analytics).forEach(scriptName => {
        const stats = global.analytics[scriptName];
        if (stats.owner === owner || scriptName.startsWith(owner + '_')) {
            scripts.push({
                scriptName: scriptName,
                totalAccesses: stats.totalAccesses,
                uniqueIPs: stats.totalUniqueIPs.size
            });
            totalAccesses += stats.totalAccesses;
        }
    });

    // Check Firebase
    if (FirebaseManager.isAvailable()) {
        try {
            const db = FirebaseManager.getDB();
            const snap = await db.collection('script_stats')
                .where('owner', '==', owner)
                .get();
            
            snap.forEach(doc => {
                const data = doc.data();
                const existing = scripts.find(s => s.scriptName === doc.id);
                if (!existing) {
                    scripts.push({
                        scriptName: doc.id,
                        totalAccesses: data.totalAccesses || 0
                    });
                    totalAccesses += data.totalAccesses || 0;
                }
            });
        } catch (error) {
            console.error('[APEX raw] Owner analytics error:', error.message);
        }
    }

    scripts.sort((a, b) => b.totalAccesses - a.totalAccesses);

    return {
        owner: owner,
        totalScripts: scripts.length,
        totalAccesses: totalAccesses,
        scripts: scripts
    };
}

// ============================================================
// PHANTOM OBFUSCATOR
// ============================================================

function phantomObfuscate(code) {
    code = fragmentStrings(code);
    code = injectPhantomFunctions(code);
    code = encryptNumbers(code);
    code = wrapWithTimeBomb(code);
    code = injectAntiDebug(code);
    return code;
}

function fragmentStrings(code) {
    return code.replace(/"([^"]+)"/g, (match, str) => {
        if (str.length < 6) return match;
        
        const fragments = [];
        let remaining = str;
        while (remaining.length > 0) {
            const len = Math.floor(Math.random() * 5) + 2;
            fragments.push(remaining.substring(0, len));
            remaining = remaining.substring(len);
        }
        
        const varName = '_s' + Math.random().toString(36).substring(2, 8);
        const parts = fragments.map(f => `"${f}"`).join(',');
        
        return `(function() local ${varName}="" local _p={${parts}} for _i=1,#_p do ${varName}=${varName}.._p[_i] end return ${varName} end)()`;
    });
}

function injectPhantomFunctions(code) {
    const phantomTemplates = [
        `local _p${randomId()}=function(...) local _a=table.pack(...) local _r=0 for _i=1,_a.n do _r=_r+(_a[_i]or 0)*_i end return _r end`,
        `local _q${randomId()}=function(_x) local _t={} for _i=1,math.abs(_x%20)+1 do _t[_i]=_i*_x%7 end return _t end`,
        `local _v${randomId()}=function(_s) local _h=0 for _i=1,#_s do _h=_h+string.byte(_s,_i)*_i%256 end return _h end`,
        `local _m${randomId()}=function(_a,_b) local _r={} for _i=1,math.max(#_a,#_b) do _r[_i]=(_a[_i]or 0)^(_b[_i]or 1)%100 end return _r end`,
    ];
    
    const lines = code.split('\n');
    const result = [];
    
    for (const line of lines) {
        result.push(line);
        if (line.trim() && Math.random() < 0.15) {
            const phantom = phantomTemplates[Math.floor(Math.random() * phantomTemplates.length)];
            result.push(phantom);
        }
    }
    
    return result.join('\n');
}

function encryptNumbers(code) {
    return code.replace(/\b(\d+)\b/g, (match, num) => {
        const n = parseInt(num);
        if (n < 2 || n > 9999) return match;
        if (Math.random() > 0.5) return match;
        
        const templates = [
            () => {
                const a = Math.floor(Math.random() * n);
                const b = n - a;
                const op = Math.random() > 0.5 ? '+' : '-';
                return op === '+' ? `(${a}+${b})` : `(${a + n}-${a})`;
            },
            () => {
                const factors = [];
                for (let i = 2; i <= Math.sqrt(n); i++) {
                    if (n % i === 0) factors.push({ a: i, b: n / i });
                }
                if (factors.length > 0) {
                    const f = factors[Math.floor(Math.random() * factors.length)];
                    return `(${f.a}*${f.b})`;
                }
                return `(${n - 1}+1)`;
            },
            () => {
                const x = Math.floor(Math.random() * 20) + 2;
                return `(${n + x}-${x})`;
            },
            () => {
                return `math.floor(${n + Math.random() * 0.5})`;
            },
        ];
        
        return templates[Math.floor(Math.random() * templates.length)]();
    });
}

function wrapWithTimeBomb(code) {
    const seed = Date.now() % 100000;
    const checkVar = '_t' + randomId();
    
    return `
local ${checkVar} = ${seed}
local function _validate()
    local _seed = ${seed}
    local _now = os and os.time and os.time() or 0
    local _check = (_now % 100000) - _seed
    if math.abs(_check) > 86400 then
        return false
    end
    return true
end
if not _validate() then return end
do
${code}
end
${checkVar} = nil _validate = nil`;
}

function injectAntiDebug(code) {
    const traps = [
        `if debug and debug.getinfo and debug.getinfo(1) and debug.getinfo(1).short_src:match("hook") then return end`,
        `if rawget and rawget(_G, "hooked") then return end`,
        `local _dbg = nil if debug then _dbg = debug.getregistry and debug.getregistry() end if _dbg and _dbg._HOOKED then return end`,
    ];
    
    const trap = traps[Math.floor(Math.random() * traps.length)];
    return trap + '\n' + code;
}

function generateLoader(code) {
    const timestamp = Date.now().toString(36);
    const seed = generateSeed(code);
    const key = deriveKey(seed, timestamp);
    const nonce = generateNonce(12);
    
    const encrypted = encryptWithKey(code, key, nonce);
    const hexData = encrypted.toString('hex');
    
    return buildObfuscatedLoader(hexData, seed, timestamp, nonce);
}

function generateSeed(code) {
    let hash = 0;
    for (let i = 0; i < Math.min(code.length, 100); i++) {
        hash = ((hash << 5) - hash) + code.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash).toString(36);
}

function deriveKey(seed, salt) {
    let key = '';
    const combined = seed + salt;
    for (let i = 0; i < 16; i++) {
        let charCode = 0;
        for (let j = 0; j < combined.length; j++) {
            charCode = (charCode * 31 + combined.charCodeAt(j) * (i + 1)) % 256;
        }
        key += String.fromCharCode(charCode);
    }
    return key;
}

function encryptWithKey(code, key, nonce) {
    const bytes = Buffer.from(code, 'utf8');
    const encrypted = Buffer.alloc(bytes.length);
    
    for (let i = 0; i < bytes.length; i++) {
        const k = key.charCodeAt(i % key.length);
        const n = nonce.charCodeAt(i % nonce.length);
        encrypted[i] = (bytes[i] + k + n) % 256;
    }
    
    return encrypted;
}

function generateNonce(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function buildObfuscatedLoader(hexData, seed, timestamp, nonce) {
    const out = [];
    
    out.push(`-- APEX HUB Loader v9 (Phantom Edition)`);
    out.push(`-- Multi-layer protection active`);
    out.push(``);
    out.push(`local _seed = "${seed}"`);
    out.push(`local _ts = "${timestamp}"`);
    out.push(`local _nc = "${nonce}"`);
    out.push(`local _hex = "${hexData}"`);
    out.push(``);
    out.push(`local function _dk(s,t)`);
    out.push(`    local k=""`);
    out.push(`    local c=s..t`);
    out.push(`    for i=1,16 do`);
    out.push(`        local v=0`);
    out.push(`        for j=1,#c do`);
    out.push(`            v=(v*31+string.byte(c,j)*i)%256`);
    out.push(`        end`);
    out.push(`        k=k..string.char(v)`);
    out.push(`    end`);
    out.push(`    return k`);
    out.push(`end`);
    out.push(``);
    out.push(`local _key = _dk(_seed, _ts)`);
    out.push(`local _bytes = {}`);
    out.push(`local _idx = 1`);
    out.push(`for _c in _hex:gmatch("..") do`);
    out.push(`    local _b = tonumber(_c, 16)`);
    out.push(`    local _kb = string.byte(_key, (_idx - 1) % #_key + 1)`);
    out.push(`    local _nb = string.byte(_nc, (_idx - 1) % #_nc + 1)`);
    out.push(`    _bytes[_idx] = string.char((_b - _kb - _nb) % 256)`);
    out.push(`    _idx = _idx + 1`);
    out.push(`end`);
    out.push(``);
    out.push(`local _code = table.concat(_bytes)`);
    out.push(`_hex = nil _key = nil _nc = nil _bytes = nil _seed = nil _ts = nil _dk = nil`);
    out.push(``);
    out.push(`local _f, _e = loadstring(_code)`);
    out.push(`if not _f then error("APEX Error: " .. tostring(_e)) end`);
    out.push(`_code = nil`);
    out.push(`_f()`);
    out.push(`_f = nil`);
    out.push(`collectgarbage("collect")`);
    
    return out.join('\n');
}

function randomId() {
    return Math.random().toString(36).substring(2, 8);
}

// ============================================================
// UI PAGES
// ============================================================

function getProtectionPage(name) {
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>APEX HUB | Security Gateway</title><style>:root{--bg:#070708;--card:rgba(18,18,21,0.72);--border:rgba(255,255,255,0.07);--t1:#f5f5f5;--t2:#8b8b93;--t3:#505057}*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',system-ui,sans-serif;background:var(--bg);color:var(--t1);min-height:100vh;display:flex;justify-content:center;align-items:center}.card{background:var(--card);backdrop-filter:blur(36px);border-radius:18px;padding:56px 52px;border:1px solid var(--border);max-width:560px;width:90%;text-align:center;box-shadow:0 16px 48px rgba(0,0,0,0.5);animation:fadeIn 0.7s cubic-bezier(0.22,1,0.36,1)}@keyframes fadeIn{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}.logo{font-size:26px;font-weight:600;letter-spacing:-0.03em;margin-bottom:6px}.sub{font-size:10px;text-transform:uppercase;letter-spacing:0.18em;color:#66666d;margin-bottom:36px}.sep{width:100%;height:1px;background:var(--border);margin:24px 0}.title{font-size:22px;font-weight:600;margin-bottom:12px}.desc{font-size:14px;color:var(--t2);line-height:1.7;margin-bottom:32px}.status{background:rgba(255,255,255,0.015);border:1px solid var(--border);border-radius:12px;padding:20px 24px;text-align:left;margin-bottom:28px}.row{display:flex;justify-content:space-between;padding:6px 0;font-size:11px}.label{color:var(--t3);text-transform:uppercase;font-size:10px}.value{font-family:monospace;color:var(--t2)}.btn{display:inline-flex;align-items:center;gap:10px;padding:15px 28px;background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:10px;color:var(--t1);text-decoration:none;font-size:14px;transition:all 0.3s}.btn:hover{background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.14)}.footer{margin-top:28px;font-size:10px;text-transform:uppercase;letter-spacing:0.06em;color:var(--t3)}@media(max-width:600px){.card{padding:40px 24px}.title{font-size:19px}}</style></head><body><div class="card"><div class="logo">APEX HUB</div><div class="sub">Security Gateway</div><div class="sep"></div><div class="title">Restricted endpoint.</div><p class="desc">Access to this resource is limited to authorized clients. Requests from standard browsers are not permitted.</p><div class="status"><div class="row"><span class="label">Status</span><span class="value">ACTIVE</span></div><div class="row"><span class="label">Transport</span><span class="value">ENCRYPTED</span></div><div class="row"><span class="label">Access</span><span class="value">RESTRICTED</span></div><div class="row"><span class="label">Script</span><span class="value">${name || 'N/A'}</span></div></div><a href="https://apexhubeditor.vercel.app/" class="btn">Open APEX HUB →</a><div class="footer">APEX HUB / Security Infrastructure</div></div></body></html>`;
}

function getWelcomePage() {
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>APEX HUB | API Gateway</title><style>:root{--bg:#070708;--card:rgba(18,18,21,0.72);--border:rgba(255,255,255,0.07);--t1:#f5f5f5;--t2:#8b8b93;--t3:#505057}*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',system-ui,sans-serif;background:var(--bg);color:var(--t1);min-height:100vh;display:flex;justify-content:center;align-items:center}.card{background:var(--card);backdrop-filter:blur(36px);border-radius:18px;padding:52px 48px;border:1px solid var(--border);max-width:560px;width:90%;text-align:center;box-shadow:0 16px 48px rgba(0,0,0,0.5)}.brand{font-size:28px;font-weight:600;letter-spacing:-0.03em}.sub{font-size:10px;text-transform:uppercase;letter-spacing:0.18em;color:#66666d;margin:6px 0 32px}.desc{font-size:14px;color:var(--t2);margin-bottom:32px}.sep{height:1px;background:var(--border);margin-bottom:28px}.ep{display:flex;align-items:center;gap:14px;padding:12px 16px;font-size:13px;font-family:monospace;border-radius:8px;transition:0.2s}.ep:hover{background:rgba(255,255,255,0.02)}.method{font-size:10px;text-transform:uppercase;padding:4px 10px;border-radius:6px;min-width:50px;text-align:center;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.05);color:var(--t2)}.footer{margin-top:32px;font-size:10px;text-transform:uppercase;letter-spacing:0.06em;color:var(--t3)}</style></head><body><div class="card"><h1 class="brand">APEX HUB</h1><div class="sub">API Gateway</div><p class="desc">Production infrastructure for secure script delivery and API access.</p><div class="sep"></div><div class="ep"><span class="method">POST</span>/api/raw</div><div class="ep"><span class="method">PUT</span>/api/raw</div><div class="ep"><span class="method">GET</span>/api/raw?name=script</div><div class="ep"><span class="method">GET</span>/api/raw?analytics=true&name=script</div><div class="ep"><span class="method">DEL</span>/api/raw?name=script</div><div class="footer">APEX HUB · API Infrastructure · V9</div></div></body></html>`;
}

function getErrorPage(name) {
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>404 | APEX HUB</title><style>:root{--bg:#070708;--card:rgba(18,18,21,0.72);--border:rgba(255,255,255,0.07);--t1:#f5f5f5;--t2:#8b8b93}*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',system-ui,sans-serif;background:var(--bg);color:var(--t1);min-height:100vh;display:flex;justify-content:center;align-items:center}.card{background:var(--card);border-radius:18px;padding:52px 48px;border:1px solid var(--border);text-align:center;max-width:480px;width:90%;box-shadow:0 16px 48px rgba(0,0,0,0.5)}.code{font-size:5rem;font-family:monospace;color:var(--t2);margin-bottom:8px}.title{font-size:16px;font-weight:500;margin-bottom:12px}.msg{font-size:14px;color:var(--t2);margin-bottom:20px}.ref{display:inline-block;padding:8px 18px;background:rgba(255,255,255,0.02);border:1px solid var(--border);border-radius:8px;font-family:monospace;font-size:12px;color:var(--t2)}a{display:inline-block;margin-top:20px;color:var(--t2);text-decoration:none;font-size:13px}a:hover{color:var(--t1)}</style></head><body><div class="card"><div class="code">404</div><div class="title">Resource not found</div><p class="msg">The requested script could not be located.</p><div class="ref">${name}</div><br><a href="https://apexhubeditor.vercel.app/">← Return to Gateway</a></div></body></html>`;
}

// Export for testing
export { handleGet, handleCreate, handleUpdate, handleDelete, trackScriptAccess, getScriptAnalytics, getOwnerAnalytics };
