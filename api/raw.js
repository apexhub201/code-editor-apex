// ============================================================
// api/raw.js - APEX HUB V9 (Custom Obfuscator Layer + Anti-Bot)
// ============================================================

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// ============================================================
// ANTI-BOT SECURITY LAYERS
// ============================================================

// Rate Limiter
class RateLimiter {
    constructor(maxRequests = 60, windowMs = 60000) {
        this.maxRequests = maxRequests;
        this.windowMs = windowMs;
        this.store = new Map();
        setInterval(() => this.cleanup(), 300000);
    }

    check(key) {
        const now = Date.now();
        let record = this.store.get(key);
        if (!record || now > record.windowEnd) {
            record = { count: 0, windowStart: now, windowEnd: now + this.windowMs, history: [] };
            this.store.set(key, record);
        }
        record.count++;
        record.history.push({ timestamp: now, count: record.count });
        if (record.history.length > 100) record.history = record.history.slice(-100);
        const allowed = record.count <= this.maxRequests;
        const blocked = record.count > this.maxRequests * 2;
        return {
            allowed,
            retryAfter: allowed ? 0 : record.windowEnd - now,
            remaining: Math.max(0, this.maxRequests - record.count),
            reset: record.windowEnd,
            blocked
        };
    }

    getHistory(key) {
        const record = this.store.get(key);
        return record ? record.history.slice(-20) : [];
    }

    cleanup() {
        const now = Date.now();
        for (const [key, record] of this.store.entries()) {
            if (now > record.windowEnd + this.windowMs) this.store.delete(key);
        }
    }
}

// Bot Detector
class BotDetector {
    constructor() {
        this.botPatterns = [
            /Discordbot/i, /discord/i, /scraper/i, /crawler/i, /spider/i, /bot/i,
            /axios/i, /node-fetch/i, /got/i, /request/i, /curl/i, /wget/i,
            /python-requests/i, /python-urllib/i, /selenium/i, /puppeteer/i,
            /playwright/i, /headless/i
        ];
    }

    analyze(requestData) {
        const { ip, userAgent, headers, timestamp } = requestData;
        const analysis = { isBot: false, confidence: 0, reasons: [], riskLevel: 'low' };

        if (!userAgent) {
            analysis.isBot = true;
            analysis.confidence += 40;
            analysis.reasons.push('Missing User-Agent');
        } else {
            for (const pattern of this.botPatterns) {
                if (pattern.test(userAgent)) {
                    analysis.isBot = true;
                    analysis.confidence += 30;
                    analysis.reasons.push(`Bot UA pattern detected`);
                    break;
                }
            }
        }

        const requiredHeaders = ['accept', 'accept-language', 'accept-encoding'];
        const missingHeaders = requiredHeaders.filter(h => !headers[h]);
        if (missingHeaders.length > 0) {
            analysis.confidence += 20;
            analysis.reasons.push(`Missing headers: ${missingHeaders.join(', ')}`);
        }

        const browserSecurityHeaders = ['sec-ch-ua', 'sec-ch-ua-platform', 'sec-fetch-dest', 'sec-fetch-mode', 'sec-fetch-site'];
        const hasBrowserHeaders = browserSecurityHeaders.filter(h => headers[h]).length;
        if (hasBrowserHeaders < 2 && headers['user-agent']?.includes('Chrome')) {
            analysis.confidence += 25;
            analysis.reasons.push('Missing Chrome security headers');
        }

        if (this.isDataCenterIP(ip)) {
            analysis.confidence += 20;
            analysis.reasons.push('Data center IP detected');
        }

        if (analysis.confidence > 70) analysis.riskLevel = 'high';
        else if (analysis.confidence > 40) analysis.riskLevel = 'medium';

        return analysis;
    }

    isDataCenterIP(ip) {
        const dataCenterRanges = ['104.16.', '104.17.', '104.18.', '104.19.', '104.20.',
            '104.21.', '104.22.', '104.23.', '104.24.', '104.25.', '104.26.', '104.27.',
            '104.28.', '104.29.', '104.30.', '104.31.'];
        return dataCenterRanges.some(range => ip.startsWith(range));
    }
}

// Response Security
class ResponseSecurity {
    constructor() {
        this.securityHeaders = {
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'X-XSS-Protection': '1; mode=block',
            'Referrer-Policy': 'strict-origin-when-cross-origin',
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
            'Surrogate-Control': 'no-store'
        };
    }

    applySecurityHeaders(res) {
        for (const [header, value] of Object.entries(this.securityHeaders)) {
            res.setHeader(header, value);
        }
        res.removeHeader('X-Powered-By');
        res.removeHeader('Server');
    }

    preventCaching(res) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Surrogate-Control', 'no-store');
    }
}

// Global instances
const rateLimiter = new RateLimiter(30, 60000);
const botDetector = new BotDetector();
const responseSecurity = new ResponseSecurity();
const riskScores = new Map();
const bannedIPs = new Map();

function getClientIP(req) {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
           req.headers['x-real-ip'] || 
           req.connection?.remoteAddress || 
           'unknown';
}

function getRiskScore(ip) {
    return riskScores.get(ip) || 0;
}

function increaseRiskScore(ip, points) {
    const current = getRiskScore(ip);
    riskScores.set(ip, current + points);
    setTimeout(() => {
        const score = riskScores.get(ip) || 0;
        riskScores.set(ip, Math.max(0, score - points));
    }, 300000);
}

function isIPBannedLocal(ip) {
    const banData = bannedIPs.get(ip);
    if (!banData) return false;
    if (Date.now() > banData.until) {
        bannedIPs.delete(ip);
        return false;
    }
    return true;
}

function banIPLocal(ip, duration) {
    bannedIPs.set(ip, { bannedAt: Date.now(), until: Date.now() + duration, reason: 'Security violation' });
}

// ============================================================
// MAIN MODULE
// ============================================================

export default (function() {
    if (!getApps().length) {
        try {
            initializeApp({
                credential: cert({
                    projectId: process.env.FIREBASE_PROJECT_ID,
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
                })
            });
        } catch (error) {
            console.error('Firebase init error:', error);
        }
    }

    const db = getFirestore();

    function getConstants() {
        return {
            SCRIPTS_COLLECTION: 'scripts',
            CHALLENGES_COLLECTION: 'challenges',
            RATE_LIMITS_COLLECTION: 'rate_limits',
            BANNED_COLLECTION: 'banned_ips'
        };
    }

    const memoryCache = new Map();
    const CACHE_TTL = 5 * 60 * 1000;

    // ============================================================
    // APEX CUSTOM OBFUSCATOR - PHANTOM LAYER
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
                () => { const a = Math.floor(Math.random() * n); const b = n - a; const op = Math.random() > 0.5 ? '+' : '-'; return op === '+' ? `(${a}+${b})` : `(${a + n}-${a})`; },
                () => { const factors = []; for (let i = 2; i <= Math.sqrt(n); i++) { if (n % i === 0) factors.push({ a: i, b: n / i }); } if (factors.length > 0) { const f = factors[Math.floor(Math.random() * factors.length)]; return `(${f.a}*${f.b})`; } return `(${n - 1}+1)`; },
                () => { const x = Math.floor(Math.random() * 20) + 2; return `(${n + x}-${x})`; },
                () => { return `math.floor(${n + Math.random() * 0.5})`; },
            ];
            return templates[Math.floor(Math.random() * templates.length)]();
        });
    }

    function wrapWithTimeBomb(code) {
        const seed = Date.now() % 100000;
        const checkVar = '_t' + randomId();
        return `\nlocal ${checkVar} = ${seed}\nlocal function _validate()\n    local _seed = ${seed}\n    local _now = os and os.time and os.time() or 0\n    local _check = (_now % 100000) - _seed\n    if math.abs(_check) > 86400 then\n        return false\n    end\n    return true\nend\nif not _validate() then return end\ndo\n${code}\nend\n${checkVar} = nil _validate = nil`;
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

    function randomId() {
        return Math.random().toString(36).substring(2, 8);
    }

    // ============================================================
    // ENCRYPTED LOADER GENERATOR
    // ============================================================

    function generateLoader(code) {
        const timestamp = Date.now().toString(36);
        const seed = generateSeed(code);
        const key = deriveKey(seed, timestamp);
        const nonce = generateNonce(12);
        const encrypted = encryptWithKey(code, key, nonce);
        const hexData = encrypted.toString('hex');
        const loader = buildObfuscatedLoader(hexData, seed, timestamp, nonce);
        return loader;
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

    // ============================================================
    // HELPERS
    // ============================================================

    function generateRandomKey(length = 32) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    function encryptPayload(code) {
        return { 
            code: code,
            data: Buffer.from(code).toString('hex')
        };
    }

    function generateChallenge() {
        const ops = ['+', '-', '*'];
        const op = ops[Math.floor(Math.random() * ops.length)];
        let num1, num2, answer;
        switch(op) {
            case '+': num1 = Math.floor(Math.random() * 50) + 1; num2 = Math.floor(Math.random() * 50) + 1; answer = num1 + num2; break;
            case '-': num1 = Math.floor(Math.random() * 50) + 25; num2 = Math.floor(Math.random() * 25) + 1; answer = num1 - num2; break;
            case '*': num1 = Math.floor(Math.random() * 12) + 1; num2 = Math.floor(Math.random() * 12) + 1; answer = num1 * num2; break;
        }
        return {
            question: `${num1} ${op} ${num2} = ?`,
            answer: answer.toString(),
            token: Math.random().toString(36).substring(2, 15) + Date.now().toString(36)
        };
    }

    async function checkRateLimit(ip) {
        const now = Date.now();
        const { RATE_LIMITS_COLLECTION, BANNED_COLLECTION } = getConstants();
        try {
            const docRef = db.collection(RATE_LIMITS_COLLECTION).doc(ip);
            const doc = await docRef.get();
            if (!doc.exists) {
                await docRef.set({ count: 1, resetTime: now + 60000, createdAt: now });
                return true;
            }
            const data = doc.data();
            if (now > data.resetTime) {
                await docRef.update({ count: 1, resetTime: now + 60000 });
                return true;
            }
            if (data.count >= 30) {
                await db.collection(BANNED_COLLECTION).doc(ip).set({
                    bannedUntil: now + 300000, reason: 'Rate limit exceeded', createdAt: now
                });
                return false;
            }
            await docRef.update({ count: data.count + 1 });
            return true;
        } catch (error) {
            return true;
        }
    }

    async function isIPBanned(ip) {
        const { BANNED_COLLECTION } = getConstants();
        try {
            const doc = await db.collection(BANNED_COLLECTION).doc(ip).get();
            if (!doc.exists) return false;
            const data = doc.data();
            if (Date.now() < data.bannedUntil) return true;
            await doc.ref.delete();
            return false;
        } catch (error) {
            return false;
        }
    }

    async function getScript(name) {
        const { SCRIPTS_COLLECTION } = getConstants();
        const cached = memoryCache.get(name);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) return cached.data;
        try {
            const doc = await db.collection(SCRIPTS_COLLECTION).doc(name).get();
            if (!doc.exists) return null;
            const data = doc.data();
            await doc.ref.update({ lastAccessed: Date.now() });
            memoryCache.set(name, { data: data, timestamp: Date.now() });
            return data;
        } catch (error) {
            return null;
        }
    }

    async function saveScript(name, data) {
        const { SCRIPTS_COLLECTION } = getConstants();
        try {
            await db.collection(SCRIPTS_COLLECTION).doc(name).set({ ...data, updatedAt: Date.now() }, { merge: true });
            memoryCache.delete(name);
            return true;
        } catch (error) {
            return false;
        }
    }

    async function deleteScript(name) {
        const { SCRIPTS_COLLECTION } = getConstants();
        try {
            await db.collection(SCRIPTS_COLLECTION).doc(name).delete();
            memoryCache.delete(name);
            return true;
        } catch (error) {
            return false;
        }
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

    // ============================================================
    // ANTI-BOT GUARD MIDDLEWARE
    // ============================================================

    async function antiBotGuard(req, res) {
        const clientIP = getClientIP(req);
        const ua = req.headers['user-agent'] || '';
        const timestamp = Date.now();

        // 1. Check local IP ban
        if (isIPBannedLocal(clientIP)) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            responseSecurity.applySecurityHeaders(res);
            return res.status(403).send(getBannedPage());
        }

        // 2. Local rate limiting
        const rateLimitResult = rateLimiter.check(clientIP);
        if (rateLimitResult.blocked) {
            banIPLocal(clientIP, 300000);
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            responseSecurity.applySecurityHeaders(res);
            return res.status(429).send(getRateLimitPage());
        }
        if (!rateLimitResult.allowed) {
            increaseRiskScore(clientIP, 5);
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            responseSecurity.applySecurityHeaders(res);
            return res.status(429).send(getRateLimitPage());
        }

        // 3. Bot detection
        const botAnalysis = botDetector.analyze({
            ip: clientIP,
            userAgent: ua,
            headers: req.headers,
            timestamp: timestamp
        });

        if (botAnalysis.isBot && botAnalysis.confidence > 60) {
            increaseRiskScore(clientIP, 25);
            console.log(`[APEX-GUARD] Bot detected: ${clientIP} - Confidence: ${botAnalysis.confidence}% - Reasons: ${botAnalysis.reasons.join(', ')}`);
        }

        // 4. Risk score check
        const riskScore = getRiskScore(clientIP);
        if (riskScore > 70) {
            banIPLocal(clientIP, 600000);
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            responseSecurity.applySecurityHeaders(res);
            return res.status(403).send(getBannedPage());
        }

        // 5. Analyze request timing for scraping patterns
        const requestHistory = rateLimiter.getHistory(clientIP);
        if (requestHistory.length >= 5) {
            const intervals = [];
            for (let i = 1; i < requestHistory.length; i++) {
                intervals.push(requestHistory[i].timestamp - requestHistory[i-1].timestamp);
            }
            const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
            if (avgInterval < 200 && intervals.length >= 4) {
                increaseRiskScore(clientIP, 15);
            }
        }

        // 6. Check for rapid script requests (scraping behavior)
        const recentRequests = requestHistory.filter(r => Date.now() - r.timestamp < 10000).length;
        if (recentRequests > 10) {
            increaseRiskScore(clientIP, 20);
        }

        return null; // Passed all checks
    }

    // ============================================================
    // HANDLERS
    // ============================================================

    async function handleGet(req, res) {
        // Apply anti-bot guard first
        const guardResult = await antiBotGuard(req, res);
        if (guardResult) return guardResult;

        // Apply security headers
        responseSecurity.applySecurityHeaders(res);
        responseSecurity.preventCaching(res);

        const { name, key, raw, challenge, answer } = req.query;
        const ua = (req.headers['user-agent'] || '').toLowerCase();
        const clientIP = getClientIP(req);
        const authKey = req.headers['x-auth-key'] || '';
        const { CHALLENGES_COLLECTION, BANNED_COLLECTION } = getConstants();

        // Firebase-based checks
        if (await isIPBanned(clientIP)) {
            increaseRiskScore(clientIP, 30);
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.status(403).send(getBannedPage());
        }
        if (!await checkRateLimit(clientIP)) {
            increaseRiskScore(clientIP, 10);
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.status(429).send(getRateLimitPage());
        }
        if (!name) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.send(getWelcomePage());
        }

        const scriptData = await getScript(name);
        if (!scriptData) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.status(404).send(getErrorPage(name));
        }

        const VALID_KEYS = ['d0egkw6en9eusrjje5vn70p2tvkngkkn', 'apex-master-key-2024'];
        const hasValidKey = VALID_KEYS.includes(key) || VALID_KEYS.includes(authKey);
        const wantsRaw = raw === 'true';

        // Admin/Bypass access
        if (hasValidKey || wantsRaw) {
            return res.json({ success: true, code: scriptData.code });
        }

        // Check if request is from executor
        const executorPatterns = [
            'roblox', 'synapse', 'krnl', 'script-ware', 'sentinel',
            'fluxus', 'electron', 'comet', 'oxygen', 'valyse',
            'hydrogen', 'codex', 'vega', 'trigon', 'nexus',
            'solara', 'jjsploit', 'celestial', 'evon', 'aris'
        ];
        const isExecutor = executorPatterns.some(p => ua.includes(p));

        if (isExecutor) {
            // Track executor requests
            increaseRiskScore(clientIP, 2);
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
            return res.send(generateLoader(scriptData.code));
        }

        // Challenge verification
        if (challenge && answer) {
            try {
                const challengeDoc = await db.collection(CHALLENGES_COLLECTION).doc(challenge).get();
                if (challengeDoc.exists) {
                    const c = challengeDoc.data();
                    if (!c.used && Date.now() - c.createdAt < 60000 && answer === c.answer) {
                        await challengeDoc.ref.update({ used: true });
                        return res.json({ success: true, code: scriptData.code });
                    }
                }
            } catch (error) {}
        }

        // Browser detection
        const isBrowser = ua.includes('mozilla') || ua.includes('chrome') ||
                          ua.includes('safari') || ua.includes('firefox');

        if (isBrowser) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.send(getProtectionPage());
        }

        // Generate challenge for unknown clients
        const newChallenge = generateChallenge();
        try {
            await db.collection(CHALLENGES_COLLECTION).doc(newChallenge.token).set({
                answer: newChallenge.answer, createdAt: Date.now(), used: false, attempts: 0
            });
        } catch (error) {}

        return res.json({
            protected: true,
            message: 'Challenge required',
            challenge: { question: newChallenge.question, token: newChallenge.token }
        });
    }

    async function handleCreate(req, res) {
        try {
            const { code, name, uid } = req.body;
            if (!code || !code.trim()) return res.status(400).json({ success: false, error: 'Code is required' });
            if (!name || !name.trim()) return res.status(400).json({ success: false, error: 'Name is required' });

            const nameSlug = normalizeName(name);
            const userId = uid || 'public';
            const fullName = userId + '_' + nameSlug;

            const target = detectTarget(code);
            console.log(`[APEX] Applying Phantom obfuscation...`);
            const obfuscatedCode = phantomObfuscate(code);

            const existingScript = await getScript(fullName);
            if (existingScript) {
                const newName = fullName + '_' + Date.now().toString(36);
                await saveScript(newName, {
                    code: obfuscatedCode, originalCode: code,
                    name: name.trim(), created: Date.now(),
                    lastAccessed: Date.now(), owner: userId,
                    target: target, obfuscated: true
                });
                const rawUrl = `https://${req.headers.host}/api/raw?name=${newName}`;
                return res.status(200).json({ success: true, raw: rawUrl, name: newName, existed: true });
            }

            await saveScript(fullName, {
                code: obfuscatedCode, originalCode: code,
                name: name.trim(), created: Date.now(),
                lastAccessed: Date.now(), owner: userId,
                target: target, obfuscated: true
            });

            const rawUrl = `https://${req.headers.host}/api/raw?name=${fullName}`;
            return res.status(200).json({ success: true, raw: rawUrl, name: fullName });
        } catch (error) {
            console.error('Create error:', error);
            return res.status(500).json({ success: false, error: error.message });
        }
    }

    async function handleUpdate(req, res) {
        try {
            const { name, code, uid } = req.body;
            if (!name) return res.status(400).json({ success: false, error: 'Name is required' });
            const scriptData = await getScript(name);
            if (!scriptData) return res.status(404).json({ success: false, error: 'Script not found' });
            if (!code || !code.trim()) return res.status(400).json({ success: false, error: 'Code is required' });
            if (uid && scriptData.owner && scriptData.owner !== uid) return res.status(403).json({ success: false, error: 'Not your script' });

            scriptData.code = phantomObfuscate(code);
            scriptData.originalCode = code;
            scriptData.updated = Date.now();
            scriptData.lastAccessed = Date.now();

            await saveScript(name, scriptData);
            return res.status(200).json({ success: true, message: 'Updated successfully', name: name });
        } catch (error) {
            return res.status(500).json({ success: false, error: error.message });
        }
    }

    async function handleDelete(req, res) {
        try {
            const { name, uid } = req.query;
            if (!name) return res.status(400).json({ success: false, error: 'Name is required' });
            const scriptData = await getScript(name);
            if (!scriptData) return res.status(404).json({ success: false, error: 'Script not found' });
            if (uid && scriptData.owner && scriptData.owner !== uid) return res.status(403).json({ success: false, error: 'Not your script' });
            await deleteScript(name);
            return res.status(200).json({ success: true, message: 'Deleted successfully' });
        } catch (error) {
            return res.status(500).json({ success: false, error: error.message });
        }
    }

    // ============================================================
    // UI PAGES (đã cập nhật - bỏ status/transport/access/gateway)
    // ============================================================

    function getProtectionPage() {
        return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>APEX HUB | Security Gateway</title><style>:root{--bg:#070708;--card:rgba(18,18,21,0.72);--border:rgba(255,255,255,0.07);--t1:#f5f5f5;--t2:#8b8b93;--t3:#505057}*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',system-ui,sans-serif;background:var(--bg);color:var(--t1);min-height:100vh;display:flex;justify-content:center;align-items:center}.card{background:var(--card);backdrop-filter:blur(36px);border-radius:18px;padding:56px 52px;border:1px solid var(--border);max-width:560px;width:90%;text-align:center;box-shadow:0 16px 48px rgba(0,0,0,0.5);animation:fadeIn 0.7s cubic-bezier(0.22,1,0.36,1)}@keyframes fadeIn{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}.logo{font-size:26px;font-weight:600;letter-spacing:-0.03em;margin-bottom:6px}.sub{font-size:10px;text-transform:uppercase;letter-spacing:0.18em;color:#66666d;margin-bottom:36px}.sep{width:100%;height:1px;background:var(--border);margin:24px 0}.title{font-size:22px;font-weight:600;margin-bottom:12px}.desc{font-size:14px;color:var(--t2);line-height:1.7;margin-bottom:32px}.btn{display:inline-flex;align-items:center;gap:10px;padding:15px 28px;background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:10px;color:var(--t1);text-decoration:none;font-size:14px;transition:all 0.3s}.btn:hover{background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.14)}.footer{margin-top:28px;font-size:10px;text-transform:uppercase;letter-spacing:0.06em;color:var(--t3)}@media(max-width:600px){.card{padding:40px 24px}.title{font-size:19px}}</style></head><body><div class="card"><div class="logo">APEX HUB</div><div class="sub">Security Gateway</div><div class="sep"></div><div class="title">Restricted endpoint.</div><p class="desc">Access to this resource is limited to authorized clients. Requests from standard browsers are not permitted.</p><a href="https://apexhubeditor.vercel.app/" class="btn">Open APEX HUB →</a><div class="footer">APEX HUB / Security Infrastructure</div></div></body></html>`;
    }

    function getWelcomePage() {
        return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>APEX HUB | API Gateway</title><style>:root{--bg:#070708;--card:rgba(18,18,21,0.72);--border:rgba(255,255,255,0.07);--t1:#f5f5f5;--t2:#8b8b93;--t3:#505057}*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',system-ui,sans-serif;background:var(--bg);color:var(--t1);min-height:100vh;display:flex;justify-content:center;align-items:center}.card{background:var(--card);backdrop-filter:blur(36px);border-radius:18px;padding:52px 48px;border:1px solid var(--border);max-width:560px;width:90%;text-align:center;box-shadow:0 16px 48px rgba(0,0,0,0.5)}.brand{font-size:28px;font-weight:600;letter-spacing:-0.03em}.sub{font-size:10px;text-transform:uppercase;letter-spacing:0.18em;color:#66666d;margin:6px 0 32px}.desc{font-size:14px;color:var(--t2);margin-bottom:32px}.sep{height:1px;background:var(--border);margin-bottom:28px}.ep{display:flex;align-items:center;gap:14px;padding:12px 16px;font-size:13px;font-family:monospace;border-radius:8px;transition:0.2s}.ep:hover{background:rgba(255,255,255,0.02)}.method{font-size:10px;text-transform:uppercase;padding:4px 10px;border-radius:6px;min-width:50px;text-align:center;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.05);color:var(--t2)}.footer{margin-top:32px;font-size:10px;text-transform:uppercase;letter-spacing:0.06em;color:var(--t3)}</style></head><body><div class="card"><h1 class="brand">APEX HUB</h1><div class="sub">API Gateway</div><p class="desc">Production infrastructure for secure script delivery and API access.</p><div class="sep"></div><div class="ep"><span class="method">POST</span>/api/raw</div><div class="ep"><span class="method">PUT</span>/api/raw</div><div class="ep"><span class="method">GET</span>/api/raw?name=script</div><div class="ep"><span class="method">DEL</span>/api/raw?name=script</div><div class="footer">APEX HUB · API Infrastructure · V9</div></div></body></html>`;
    }

    function getErrorPage(name) {
        return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>404 | APEX HUB</title><style>:root{--bg:#070708;--card:rgba(18,18,21,0.72);--border:rgba(255,255,255,0.07);--t1:#f5f5f5;--t2:#8b8b93}*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',system-ui,sans-serif;background:var(--bg);color:var(--t1);min-height:100vh;display:flex;justify-content:center;align-items:center}.card{background:var(--card);border-radius:18px;padding:52px 48px;border:1px solid var(--border);text-align:center;max-width:480px;width:90%;box-shadow:0 16px 48px rgba(0,0,0,0.5)}.code{font-size:5rem;font-family:monospace;color:var(--t2);margin-bottom:8px}.title{font-size:16px;font-weight:500;margin-bottom:12px}.msg{font-size:14px;color:var(--t2);margin-bottom:20px}.ref{display:inline-block;padding:8px 18px;background:rgba(255,255,255,0.02);border:1px solid var(--border);border-radius:8px;font-family:monospace;font-size:12px;color:var(--t2)}a{display:inline-block;margin-top:20px;color:var(--t2);text-decoration:none;font-size:13px}a:hover{color:var(--t1)}</style></head><body><div class="card"><div class="code">404</div><div class="title">Resource not found</div><p class="msg">The requested script could not be located.</p><div class="ref">${name}</div><br><a href="https://apexhubeditor.vercel.app/">← Return to Gateway</a></div></body></html>`;
    }

    function getBannedPage() {
        return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Access Denied | APEX HUB</title><style>:root{--bg:#070708;--card:rgba(18,18,21,0.72);--border:rgba(255,255,255,0.07);--t1:#f5f5f5;--t2:#8b8b93;--t3:#505057}*{margin:0;padding:0}body{font-family:'Inter',system-ui,sans-serif;background:var(--bg);color:var(--t1);min-height:100vh;display:flex;justify-content:center;align-items:center}.card{background:var(--card);border-radius:18px;padding:52px 48px;border:1px solid var(--border);text-align:center;max-width:480px;width:90%}.icon{width:48px;height:48px;border:1px solid rgba(255,255,255,0.1);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 24px;color:var(--t2)}.title{font-size:16px;margin-bottom:12px}.msg{font-size:14px;color:var(--t2);margin-bottom:24px}.panel{background:rgba(255,255,255,0.015);border:1px solid var(--border);border-radius:10px;padding:16px 20px;text-align:left}.row{display:flex;justify-content:space-between;padding:4px 0;font-size:11px}.lbl{font-size:10px;text-transform:uppercase;color:var(--t3)}.val{font-family:monospace;color:var(--t2)}.ft{margin-top:24px;font-size:10px;text-transform:uppercase;color:var(--t3)}</style></head><body><div class="card"><div class="icon">—</div><div class="title">Access Denied</div><p class="msg">This request has been temporarily blocked by the APEX security gateway.</p><div class="panel"><div class="row"><span class="lbl">Event</span><span class="val">ACCESS POLICY VIOLATION</span></div><div class="row"><span class="lbl">Status</span><span class="val">TEMPORARILY BLOCKED</span></div></div><div class="ft">APEX HUB · Security Infrastructure</div></div></body></html>`;
    }

    function getRateLimitPage() {
        return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Rate Limited | APEX HUB</title><style>:root{--bg:#070708;--card:rgba(18,18,21,0.72);--border:rgba(255,255,255,0.07);--t1:#f5f5f5;--t2:#8b8b93;--t3:#505057}*{margin:0;padding:0}body{font-family:'Inter',system-ui,sans-serif;background:var(--bg);color:var(--t1);min-height:100vh;display:flex;justify-content:center;align-items:center}.card{background:var(--card);border-radius:18px;padding:52px 48px;border:1px solid var(--border);text-align:center;max-width:480px;width:90%}.icon{width:48px;height:48px;border:1px solid rgba(255,255,255,0.1);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 24px;color:var(--t2)}.title{font-size:16px;margin-bottom:12px}.msg{font-size:14px;color:var(--t2);margin-bottom:20px}.bar{width:100%;height:1px;background:rgba(255,255,255,0.06);margin-bottom:24px}.fill{width:100%;height:100%;background:rgba(255,255,255,0.15);animation:progress 60s linear}@keyframes progress{from{transform:scaleX(0)}to{transform:scaleX(1)}}.panel{background:rgba(255,255,255,0.015);border:1px solid var(--border);border-radius:10px;padding:16px 20px;text-align:left}.row{display:flex;justify-content:space-between;padding:4px 0;font-size:11px}.lbl{font-size:10px;text-transform:uppercase;color:var(--t3)}.val{font-family:monospace;color:var(--t2)}.ft{margin-top:24px;font-size:10px;text-transform:uppercase;color:var(--t3)}</style></head><body><div class="card"><div class="icon">—</div><div class="title">Request Throttled</div><p class="msg">Too many requests from this client.</p><div class="bar"><div class="fill"></div></div><div class="panel"><div class="row"><span class="lbl">Policy</span><span class="val">RATE LIMIT</span></div><div class="row"><span class="lbl">Status</span><span class="val">THROTTLED</span></div><div class="row"><span class="lbl">Retry</span><span class="val">AUTOMATIC</span></div></div><div class="ft">APEX HUB · Security Infrastructure</div></div></body></html>`;
    }

    // Return handler
    return async function handler(req, res) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Challenge-Token, X-Challenge-Answer, X-Auth-Key');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');

        if (req.method === 'OPTIONS') return res.status(200).end();

        try {
            if (req.method === 'GET') return await handleGet(req, res);
            if (req.method === 'POST') return await handleCreate(req, res);
            if (req.method === 'PUT') return await handleUpdate(req, res);
            if (req.method === 'DELETE') return await handleDelete(req, res);
            return res.status(405).json({ error: 'Method not allowed' });
        } catch (error) {
            console.error('Handler error:', error);
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }
    };
})();
