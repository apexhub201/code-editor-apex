// ============================================================
// api/raw.js - APEX HUB V9 (Hercules Obfuscator + Security)
// ============================================================

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import crypto from 'crypto';

// ============================================================
// FIREBASE INIT
// ============================================================

if (!getApps().length) {
    try {
        const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
        if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && privateKey) {
            initializeApp({
                credential: cert({
                    projectId: process.env.FIREBASE_PROJECT_ID,
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                    privateKey: privateKey
                })
            });
            console.log('[APEX] Firebase initialized successfully');
        } else {
            console.warn('[APEX] Firebase credentials incomplete - running in limited mode');
        }
    } catch (error) {
        console.error('[APEX] Firebase init error:', error.message);
    }
}

const db = getFirestore();

// ============================================================
// CONSTANTS & CONFIG
// ============================================================

const COLLECTIONS = {
    SCRIPTS: 'scripts',
    SESSIONS: 'security_sessions',
    CHALLENGES: 'security_challenges',
    RATE_LIMITS: 'security_rate_limits',
    BANS: 'security_bans',
    EVENTS: 'security_events'
};

const VALID_KEYS = (process.env.VALID_AUTH_KEYS || 'd0egkw6en9eusrjje5vn70p2tvkngkkn,apex-master-key-2024')
    .split(',')
    .map(k => k.trim())
    .filter(Boolean);

const scriptCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

const executorPatterns = [
    'roblox', 'synapse', 'krnl', 'script-ware', 'sentinel',
    'fluxus', 'electron', 'comet', 'oxygen', 'valyse',
    'hydrogen', 'codex', 'vega', 'trigon', 'nexus',
    'solara', 'jjsploit', 'celestial', 'evon', 'aris'
];

// ============================================================
// HERCULES OBFUSCATOR (JS Port)
// ============================================================

class HerculesObfuscator {
    constructor(options = {}) {
        this.config = {
            stringEncryption: options.stringEncryption ?? true,
            numberEncryption: options.numberEncryption ?? true,
            controlFlowFlattening: options.controlFlowFlattening ?? true,
            deadCodeInjection: options.deadCodeInjection ?? true,
            antiDebug: options.antiDebug ?? true,
            virtualizeGlobals: options.virtualizeGlobals ?? false,
            mutationPasses: options.mutationPasses ?? 3,
            seed: options.seed || crypto.randomBytes(8).toString('hex')
        };
        
        this.seed = this.hashSeed(this.config.seed);
    }
    
    hashSeed(seed) {
        let hash = 0;
        for (let i = 0; i < seed.length; i++) {
            hash = ((hash << 5) - hash) + seed.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash);
    }
    
    random() {
        this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
        return this.seed / 0x7fffffff;
    }
    
    randomInt(min, max) {
        return Math.floor(this.random() * (max - min + 1)) + min;
    }
    
    randomId() {
        return '_h' + this.randomInt(1000, 9999).toString(36);
    }
    
    /**
     * Main obfuscation pipeline
     */
    obfuscate(code) {
        console.log('[HERCULES] Starting obfuscation pipeline...');
        console.log(`[HERCULES] Seed: ${this.config.seed}`);
        
        let result = code;
        
        // Stage 1: String Encryption
        if (this.config.stringEncryption) {
            console.log('[HERCULES] Stage 1: String Encryption');
            result = this.encryptStrings(result);
        }
        
        // Stage 2: Number Encryption
        if (this.config.numberEncryption) {
            console.log('[HERCULES] Stage 2: Number Encryption');
            result = this.encryptNumbers(result);
        }
        
        // Stage 3: Control Flow Flattening
        if (this.config.controlFlowFlattening) {
            console.log('[HERCULES] Stage 3: Control Flow Flattening');
            result = this.flattenControlFlow(result);
        }
        
        // Stage 4: Dead Code Injection
        if (this.config.deadCodeInjection) {
            console.log('[HERCULES] Stage 4: Dead Code Injection');
            result = this.injectDeadCode(result);
        }
        
        // Stage 5: Anti-Debug
        if (this.config.antiDebug) {
            console.log('[HERCULES] Stage 5: Anti-Debug Injection');
            result = this.injectAntiDebug(result);
        }
        
        // Stage 6: Global Virtualization
        if (this.config.virtualizeGlobals) {
            console.log('[HERCULES] Stage 6: Global Virtualization');
            result = this.virtualizeGlobals(result);
        }
        
        // Stage 7: Mutation Passes
        console.log(`[HERCULES] Stage 7: Mutation Passes (${this.config.mutationPasses}x)`);
        for (let i = 0; i < this.config.mutationPasses; i++) {
            result = this.mutateCode(result);
        }
        
        // Stage 8: Add Manifest
        result = this.addManifest(result);
        
        console.log('[HERCULES] Obfuscation complete');
        return result;
    }
    
    /**
     * Stage 1: String Encryption
     */
    encryptStrings(code) {
        return code.replace(/"([^"]{3,})"/g, (match, str) => {
            if (this.random() > 0.7) return match;
            
            const key = this.randomInt(1, 255);
            const encrypted = str.split('').map(c => {
                return String.fromCharCode(c.charCodeAt(0) ^ key);
            }).join('');
            
            const escaped = encrypted
                .replace(/\\/g, '\\\\')
                .replace(/"/g, '\\"')
                .replace(/\n/g, '\\n')
                .replace(/\r/g, '\\r');
            
            const funcName = this.randomId();
            const keyName = this.randomId();
            
            return `(function()local ${funcName}="${escaped}"local ${keyName}=${key}local _r=""for _i=1,#${funcName}do _r=_r..string.char(string.byte(${funcName},_i)~${keyName})end return _r end)()`;
        });
    }
    
    /**
     * Stage 2: Number Encryption
     */
    encryptNumbers(code) {
        return code.replace(/\b(\d+)\b/g, (match, num) => {
            const n = parseInt(num);
            if (n < 2 || n > 9999 || this.random() > 0.5) return match;
            
            const patterns = [
                () => {
                    const a = this.randomInt(1, n - 1);
                    return `(${a}+${n - a})`;
                },
                () => {
                    const a = this.randomInt(n + 1, n + 100);
                    return `(${a}-${a - n})`;
                },
                () => {
                    for (let i = 2; i <= Math.sqrt(n); i++) {
                        if (n % i === 0 && this.random() > 0.5) {
                            return `(${i}*${n / i})`;
                        }
                    }
                    return `(${n - 1}+1)`;
                },
                () => {
                    const x = this.randomInt(2, 20);
                    return `(${n + x}-${x})`;
                },
                () => `math.floor(${n + this.random() * 0.5})`,
            ];
            
            return patterns[this.randomInt(0, patterns.length - 1)]();
        });
    }
    
    /**
     * Stage 3: Control Flow Flattening
     */
    flattenControlFlow(code) {
        const lines = code.split('\n');
        const result = [];
        
        for (let i = 0; i < lines.length; i++) {
            result.push(lines[i]);
            
            if (lines[i].trim() && this.random() < 0.15) {
                const labelName = '_lbl' + this.randomInt(1000, 9999);
                result.push(`::${labelName}::`);
                if (this.random() > 0.5) {
                    result.push(`if false then goto ${labelName} end`);
                }
            }
        }
        
        return result.join('\n');
    }
    
    /**
     * Stage 4: Dead Code Injection
     */
    injectDeadCode(code) {
        const deadCodeTemplates = [
            () => {
                const fn = this.randomId();
                return `local ${fn}=function(...)local _a=table.pack(...)local _r=0 for _i=1,_a.n do _r=_r+(_a[_i]or 0)*_i end return _r end`;
            },
            () => {
                const t = this.randomId();
                return `local ${t}={}for _i=1,${this.randomInt(3, 10)}do ${t}[_i]=_i*${this.randomInt(2, 7)}end`;
            },
            () => {
                const v = this.randomId();
                return `local ${v}=${this.randomInt(1, 100)}${v}=${v}*${this.randomInt(2, 10)}${v}=nil`;
            },
            () => {
                const v1 = this.randomId();
                const v2 = this.randomId();
                return `local ${v1},${v2}=pcall(function()return math.random(1,100)*0 end)`;
            },
            () => `do local _=${this.randomInt(1000, 9999)}while _>0 do _=_-1 break end end`,
        ];
        
        const lines = code.split('\n');
        const result = [];
        
        for (const line of lines) {
            result.push(line);
            if (line.trim() && this.random() < 0.12) {
                const deadCode = deadCodeTemplates[this.randomInt(0, deadCodeTemplates.length - 1)]();
                result.push(deadCode);
            }
        }
        
        return result.join('\n');
    }
    
    /**
     * Stage 5: Anti-Debug Injection
     */
    injectAntiDebug(code) {
        const traps = [
            `if debug and debug.getinfo and debug.getinfo(1)and debug.getinfo(1).short_src:match("hook")then return end`,
            `if rawget and rawget(_G,"hooked")then return end`,
            `pcall(function()if getfenv and getfenv(0)["_HOOKED"]then error("Debug detected")end end)`,
            `local _dbg=pcall(function()return debug.getregistry()end)if _dbg and debug.getregistry()._HOOKED then return end`,
            `if hookfunction and iswindowactive then return end`,
        ];
        
        const trap = traps[this.randomInt(0, traps.length - 1)];
        const chunks = [];
        
        for (let i = 0; i < trap.length; i += 40) {
            chunks.push(trap.substring(i, i + 40));
        }
        
        const varName = this.randomId();
        const obfuscatedTrap = `local ${varName}=${JSON.stringify(chunks)}local _t=""for _i=1,#${varName}do _t=_t..${varName}[_i]end loadstring(_t)()`;
        
        return `--[[ Hercules Protected v2.0 | APEX HUB ]]--\n${obfuscatedTrap}\n${code}`;
    }
    
    /**
     * Stage 6: Global Virtualization
     */
    virtualizeGlobals(code) {
        const globals = {
            'game': this.randomId(),
            'workspace': this.randomId(),
            'print': this.randomId(),
            'wait': this.randomId(),
            'spawn': this.randomId(),
            'delay': this.randomId(),
            'tick': this.randomId(),
            'time': this.randomId(),
        };
        
        const virtualizedLines = [];
        for (const [original, virtual] of Object.entries(globals)) {
            if (code.includes(original)) {
                virtualizedLines.push(`local ${virtual}=${original}`);
            }
        }
        
        if (virtualizedLines.length === 0) return code;
        
        let result = code;
        for (const [original, virtual] of Object.entries(globals)) {
            const regex = new RegExp(`\\b${original}\\b(?=\\s*[\\(\\[\\:\\.\\s])`, 'g');
            result = result.replace(regex, virtual);
        }
        
        return virtualizedLines.join(';') + ';' + result;
    }
    
    /**
     * Stage 7: Code Mutation
     */
    mutateCode(code) {
        const mutations = [
            // Đổi tên biến local
            (c) => c.replace(/\blocal\s+([a-zA-Z_]\w*)\s*=/g, (match, varName) => {
                if (varName.startsWith('_h') || varName.startsWith('_')) return match;
                return `local ${this.randomId()}=`;
            }),
            // Thêm khoảng trắng ngẫu nhiên
            (c) => c.split('\n').map(line => {
                if (this.random() < 0.08) {
                    return line.replace(/([=+\-*\/,])/g, ' $1 ');
                }
                return line;
            }).join('\n'),
            // Đảo thứ tự dòng
            (c) => {
                const lines = c.split('\n');
                if (lines.length < 10) return c;
                const idx1 = this.randomInt(1, Math.floor(lines.length / 3));
                const idx2 = this.randomInt(Math.floor(lines.length * 2 / 3), lines.length - 2);
                [lines[idx1], lines[idx2]] = [lines[idx2], lines[idx1]];
                return lines.join('\n');
            },
            // Thêm biểu thức dư thừa
            (c) => c.replace(/(\b\w+\s*=\s*[^;\n]+;)/g, (match) => {
                if (this.random() < 0.1) {
                    return `do local _${this.randomInt(100, 999)}=${this.randomInt(1, 100)}end;${match}`;
                }
                return match;
            }),
        ];
        
        const numMutations = this.randomInt(1, 2);
        let result = code;
        
        for (let i = 0; i < numMutations; i++) {
            const mutation = mutations[this.randomInt(0, mutations.length - 1)];
            result = mutation(result);
        }
        
        return result;
    }
    
    /**
     * Stage 8: Add Manifest Header
     */
    addManifest(code) {
        const timestamp = new Date().toISOString();
        return [
            `--[[`,
            `    ⚡ Hercules Obfuscator v2.0`,
            `    🛡️ Protected by APEX HUB`,
            `    🔐 Seed: ${this.config.seed.substring(0, 8)}`,
            `    📅 ${timestamp}`,
            `    ⚠️ UNAUTHORIZED DECOMPILATION PROHIBITED`,
            `--]]`,
            '',
            code
        ].join('\n');
    }
    
    /**
     * Generate Loader for Executors
     */
    generateLoader(code) {
        const key = crypto.randomBytes(16);
        const iv = crypto.randomBytes(8);
        
        // XOR encrypt
        const encrypted = Buffer.alloc(code.length);
        for (let i = 0; i < code.length; i++) {
            encrypted[i] = code.charCodeAt(i) ^ key[i % key.length] ^ iv[i % iv.length];
        }
        
        const b64 = encrypted.toString('base64');
        const keyHex = key.toString('hex');
        const ivHex = iv.toString('hex');
        const funcName = this.randomId();
        
        return [
            `-- APEX HUB Loader (Hercules v2.0)`,
            `local ${funcName}="${keyHex}"`,
            `local _iv="${ivHex}"`,
            `local _d="${b64}"`,
            `local function _b64d(d)`,
            `    local b="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"`,
            `    d=string.gsub(d,'[^'..b..'=]','')`,
            `    return(d:gsub('.',function(x)`,
            `        if(x=='=')then return''end`,
            `        local _,f=string.find(b,x)`,
            `        local r=''`,
            `        f=f-1`,
            `        for _=6,1,-1 do r=r..(f%2^i-f%2^(i-1)>0 and'1'or'0')end`,
            `        return r`,
            `    end):gsub('%d%d%d?%d?%d?%d?%d?%d?',function(x)`,
            `        if(#x~=8)then return''end`,
            `        return string.char(tonumber(x,2))`,
            `    end))`,
            `end`,
            `local _dec=_b64d(_d)`,
            `local _r={}`,
            `local _k=${funcName}`,
            `for _i=1,#_dec do`,
            `    local _kb=tonumber(string.sub(_k,((_i-1)%32)*2+1,((_i-1)%32)*2+2),16)`,
            `    local _ib=tonumber(string.sub(_iv,((_i-1)%8)*2+1,((_i-1)%8)*2+2),16)`,
            `    _r[_i]=string.char(string.byte(_dec,_i)~_kb~_ib)`,
            `end`,
            `local _c=table.concat(_r)`,
            `_d,_dec,_r,_k,_iv=nil,nil,nil,nil,nil`,
            `local _f=loadstring(_c)`,
            `if _f then _f()end`,
        ].join('\n');
    }
}

// ============================================================
// SECURITY FUNCTIONS
// ============================================================

function getClientIP(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) return forwarded.split(',')[0].trim();
    return req.headers['x-real-ip'] || req.socket?.remoteAddress || '0.0.0.0';
}

async function isIPBanned(ip) {
    try {
        const doc = await db.collection(COLLECTIONS.BANS).doc(ip).get();
        if (!doc.exists) return false;
        const data = doc.data();
        if (data.expiresAt && data.expiresAt.toDate() > new Date()) return true;
        await doc.ref.delete().catch(() => {});
        return false;
    } catch (error) {
        return false;
    }
}

async function banIP(ip, durationMs = 300000, reason = 'security_violation') {
    try {
        await db.collection(COLLECTIONS.BANS).doc(ip).set({
            ip, reason,
            createdAt: FieldValue.serverTimestamp(),
            expiresAt: new Date(Date.now() + durationMs)
        });
        await db.collection(COLLECTIONS.EVENTS).add({
            type: 'ip_banned', ip, reason, durationMs,
            createdAt: FieldValue.serverTimestamp()
        }).catch(() => {});
    } catch (error) {
        console.error('[GUARD] Ban error:', error.message);
    }
}

async function checkRateLimit(ip, endpoint, maxRequests = 30, windowMs = 60000) {
    const docId = `${ip}_${endpoint}`;
    const now = Date.now();
    const windowStart = now - windowMs;
    
    try {
        const docRef = db.collection(COLLECTIONS.RATE_LIMITS).doc(docId);
        const result = await db.runTransaction(async (transaction) => {
            const doc = await transaction.get(docRef);
            
            if (!doc.exists) {
                transaction.set(docRef, {
                    ip, endpoint, count: 1, windowStart: now,
                    updatedAt: FieldValue.serverTimestamp()
                });
                return { allowed: true, count: 1, remaining: maxRequests - 1 };
            }
            
            const data = doc.data();
            
            if (data.windowStart < windowStart) {
                transaction.update(docRef, {
                    count: 1, windowStart: now,
                    updatedAt: FieldValue.serverTimestamp()
                });
                return { allowed: true, count: 1, remaining: maxRequests - 1 };
            }
            
            const newCount = data.count + 1;
            
            if (newCount > maxRequests) {
                if (newCount > maxRequests * 3) {
                    await banIP(ip, 300000, 'excessive_rate');
                }
                return { allowed: false, count: newCount, remaining: 0 };
            }
            
            transaction.update(docRef, {
                count: newCount,
                updatedAt: FieldValue.serverTimestamp()
            });
            
            return { allowed: true, count: newCount, remaining: maxRequests - newCount };
        });
        
        return result;
    } catch (error) {
        return { allowed: true, count: 0, remaining: maxRequests, error: error.message };
    }
}

async function validateSession(sessionToken) {
    if (!sessionToken || typeof sessionToken !== 'string' || sessionToken.length < 32) return null;
    
    try {
        const doc = await db.collection(COLLECTIONS.SESSIONS).doc(sessionToken).get();
        if (!doc.exists) return null;
        
        const session = doc.data();
        if (!session.active) return null;
        if (session.expiresAt && session.expiresAt.toDate() < new Date()) {
            await doc.ref.update({ active: false, revokedAt: FieldValue.serverTimestamp(), revokeReason: 'expired' }).catch(() => {});
            return null;
        }
        if (session.maxRequests && session.requestCount >= session.maxRequests) {
            await doc.ref.update({ active: false, revokedAt: FieldValue.serverTimestamp(), revokeReason: 'max_requests_exceeded' }).catch(() => {});
            return null;
        }
        
        await doc.ref.update({
            lastActivity: FieldValue.serverTimestamp(),
            requestCount: FieldValue.increment(1)
        }).catch(() => {});
        
        return {
            token: sessionToken,
            tier: session.tier || 'standard',
            requestCount: session.requestCount || 0,
            maxRequests: session.maxRequests || 100
        };
    } catch (error) {
        return null;
    }
}

function detectBot(req) {
    const ua = (req.headers['user-agent'] || '').toLowerCase();
    const signals = { score: 0, reasons: [] };
    
    if (!ua) {
        signals.score += 20;
        signals.reasons.push('missing_ua');
    }
    
    const botPatterns = [
        /discordbot/, /discord\//, /scraper/i, /crawler/i, /spider/i,
        /axios/i, /node-fetch/, /got\//, /python-requests/, /python-urllib/,
        /curl\//, /wget\//, /libwww/i, /okhttp/i
    ];
    
    for (const pattern of botPatterns) {
        if (pattern.test(ua)) {
            signals.score += 15;
            signals.reasons.push('bot_ua');
            break;
        }
    }
    
    const browserHeaders = ['accept', 'accept-language'];
    const missingHeaders = browserHeaders.filter(h => !req.headers[h]);
    if (missingHeaders.length >= 2) {
        signals.score += 10;
        signals.reasons.push('missing_headers');
    }
    
    return { isBot: signals.score >= 30, score: signals.score, reasons: signals.reasons };
}

async function securityGuard(req, res, options = {}) {
    const ip = getClientIP(req);
    const endpoint = options.endpoint || 'raw';
    
    if (await isIPBanned(ip)) {
        return { blocked: true, status: 403, body: { error: 'ACCESS_DENIED', code: 'IP_BANNED' } };
    }
    
    if (options.rateLimit !== false) {
        const rateResult = await checkRateLimit(ip, endpoint, options.maxRequests || 30, options.windowMs || 60000);
        if (!rateResult.allowed) {
            return { blocked: true, status: 429, body: { error: 'RATE_LIMITED', retryAfter: Math.ceil((options.windowMs || 60000) / 1000) } };
        }
    }
    
    if (options.botDetection !== false) {
        const botResult = detectBot(req);
        if (botResult.score >= 60) {
            await banIP(ip, 600000, 'bot_detected');
            return { blocked: true, status: 403, body: { error: 'ACCESS_DENIED', code: 'SUSPICIOUS_ACTIVITY' } };
        }
    }
    
    let session = null;
    if (options.requireSession) {
        const sessionToken = req.headers['x-session-token'] || req.query.session_token || req.body?.sessionToken;
        session = await validateSession(sessionToken);
        if (!session) {
            return { blocked: true, status: 401, body: { error: 'SESSION_REQUIRED', code: 'INVALID_OR_EXPIRED_SESSION' } };
        }
    }
    
    return { blocked: false, session, ip };
}

// ============================================================
// HERCULES OBFUSCATION WRAPPER
// ============================================================

function obfuscateWithHercules(code) {
    const hercules = new HerculesObfuscator({
        stringEncryption: true,
        numberEncryption: true,
        controlFlowFlattening: true,
        deadCodeInjection: true,
        antiDebug: true,
        virtualizeGlobals: true,
        mutationPasses: 3,
        seed: crypto.randomBytes(8).toString('hex')
    });
    
    return hercules.obfuscate(code);
}

// ============================================================
// HELPERS
// ============================================================

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

async function getScript(name) {
    const cached = scriptCache.get(name);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) return cached.data;
    
    try {
        const doc = await db.collection(COLLECTIONS.SCRIPTS).doc(name).get();
        if (!doc.exists) return null;
        const data = doc.data();
        doc.ref.update({ lastAccessed: FieldValue.serverTimestamp() }).catch(() => {});
        scriptCache.set(name, { data, timestamp: Date.now() });
        return data;
    } catch (error) {
        console.error('[RAW] Script fetch error:', error.message);
        return null;
    }
}

async function saveScript(name, data) {
    try {
        await db.collection(COLLECTIONS.SCRIPTS).doc(name).set({
            ...data,
            updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
        scriptCache.delete(name);
        return true;
    } catch (error) {
        console.error('[RAW] Script save error:', error.message);
        return false;
    }
}

async function deleteScript(name) {
    try {
        await db.collection(COLLECTIONS.SCRIPTS).doc(name).delete();
        scriptCache.delete(name);
        return true;
    } catch (error) {
        console.error('[RAW] Script delete error:', error.message);
        return false;
    }
}

function generateChallenge() {
    const ops = ['+', '-', '*'];
    const op = ops[Math.floor(Math.random() * ops.length)];
    let num1, num2, answer;
    
    switch(op) {
        case '+':
            num1 = crypto.randomInt(1, 50);
            num2 = crypto.randomInt(1, 50);
            answer = num1 + num2;
            break;
        case '-':
            num1 = crypto.randomInt(25, 75);
            num2 = crypto.randomInt(1, 25);
            answer = num1 - num2;
            break;
        case '*':
            num1 = crypto.randomInt(1, 12);
            num2 = crypto.randomInt(1, 12);
            answer = num1 * num2;
            break;
        default:
            num1 = crypto.randomInt(1, 50);
            num2 = crypto.randomInt(1, 50);
            answer = num1 + num2;
    }
    
    return {
        question: `${num1} ${op} ${num2} = ?`,
        answer: answer.toString(),
        token: crypto.randomBytes(32).toString('hex')
    };
}

// ============================================================
// HANDLERS
// ============================================================

async function handleGet(req, res) {
    const { name, key, challenge, answer } = req.query;
    const ua = (req.headers['user-agent'] || '').toLowerCase();
    const authKey = req.headers['x-auth-key'] || '';
    
    if (!name) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(getWelcomePage());
    }
    
    // ==========================================
    // 1. ADMIN BYPASS (valid key)
    // ==========================================
    const hasValidKey = VALID_KEYS.includes(key) || VALID_KEYS.includes(authKey);
    if (hasValidKey) {
        const scriptData = await getScript(name);
        if (!scriptData) return res.status(404).json({ error: 'SCRIPT_NOT_FOUND' });
        return res.json({ success: true, code: scriptData.code });
    }
    
    // ==========================================
    // 2. EXECUTOR BYPASS (rate limit only + Hercules loader)
    // ==========================================
    const isExecutor = executorPatterns.some(p => ua.includes(p));
    
    if (isExecutor) {
        const guardResult = await securityGuard(req, res, {
            requireSession: false,
            rateLimit: true,
            maxRequests: 30,
            windowMs: 60000,
            botDetection: false,
            endpoint: 'raw_executor'
        });
        
        if (guardResult.blocked) {
            return res.status(guardResult.status).json(guardResult.body);
        }
        
        const scriptData = await getScript(name);
        if (!scriptData) return res.status(404).json({ error: 'SCRIPT_NOT_FOUND' });
        
        // Dùng Hercules để tạo loader cho executor
        const hercules = new HerculesObfuscator({ seed: crypto.randomBytes(8).toString('hex') });
        const loader = hercules.generateLoader(scriptData.code);
        
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        return res.send(loader);
    }
    
    // ==========================================
    // 3. CHALLENGE VERIFICATION
    // ==========================================
    if (challenge && answer) {
        try {
            const challengeDoc = await db.collection(COLLECTIONS.CHALLENGES).doc(challenge).get();
            if (challengeDoc.exists) {
                const c = challengeDoc.data();
                if (!c.used && c.expiresAt && c.expiresAt.toDate() > new Date() && answer === c.answer) {
                    await challengeDoc.ref.update({ used: true, consumedAt: FieldValue.serverTimestamp() });
                    const scriptData = await getScript(name);
                    if (!scriptData) return res.status(404).json({ error: 'SCRIPT_NOT_FOUND' });
                    return res.json({ success: true, code: scriptData.code });
                }
            }
        } catch (error) {
            console.error('[RAW] Challenge error:', error.message);
        }
        return res.status(403).json({ error: 'INVALID_CHALLENGE' });
    }
    
    // ==========================================
    // 4. SESSION REQUIRED (for others)
    // ==========================================
    const guardResult = await securityGuard(req, res, {
        requireSession: true,
        rateLimit: true,
        maxRequests: 20,
        windowMs: 60000,
        botDetection: true,
        endpoint: 'raw_get'
    });
    
    if (guardResult.blocked) {
        return res.status(guardResult.status).json(guardResult.body);
    }
    
    const scriptData = await getScript(name);
    if (!scriptData) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(404).send(getErrorPage(name));
    }
    
    // Browser
    const isBrowser = ua.includes('mozilla') || ua.includes('chrome') ||
                      ua.includes('safari') || ua.includes('firefox');
    
    if (isBrowser) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(getProtectionPage());
    }
    
    // Unknown client → give challenge
    const newChallenge = generateChallenge();
    try {
        await db.collection(COLLECTIONS.CHALLENGES).doc(newChallenge.token).set({
            token: newChallenge.token,
            answer: newChallenge.answer,
            type: 'math',
            used: false,
            attempts: 0,
            maxAttempts: 3,
            createdAt: FieldValue.serverTimestamp(),
            expiresAt: new Date(Date.now() + 120000),
            metadata: { ip: guardResult.ip, userAgent: ua || 'unknown' }
        });
    } catch (error) {
        console.error('[RAW] Challenge creation error:', error.message);
    }
    
    return res.json({
        protected: true,
        message: 'Challenge required',
        challenge: { question: newChallenge.question, token: newChallenge.token, type: 'math', expiresIn: 120 }
    });
}

async function handleCreate(req, res) {
    try {
        const { code, name, uid } = req.body;
        
        if (!code || !code.trim()) return res.status(400).json({ success: false, error: 'Code is required' });
        if (!name || !name.trim()) return res.status(400).json({ success: false, error: 'Name is required' });
        
        const guardResult = await securityGuard(req, res, {
            requireSession: false,
            rateLimit: true,
            maxRequests: 30,
            windowMs: 60000,
            botDetection: true,
            endpoint: 'raw_create'
        });
        
        if (guardResult.blocked) return res.status(guardResult.status).json(guardResult.body);
        
        const nameSlug = normalizeName(name);
        const userId = uid || 'public';
        const fullName = `${userId}_${nameSlug}`;
        const target = detectTarget(code);
        
        // Dùng Hercules Obfuscator
        console.log(`[APEX] Applying Hercules obfuscation for: ${fullName}`);
        const obfuscatedCode = obfuscateWithHercules(code);
        
        const existingScript = await getScript(fullName);
        if (existingScript) {
            const newName = `${fullName}_${Date.now().toString(36)}`;
            await saveScript(newName, {
                code: obfuscatedCode,
                originalCode: code,
                name: name.trim(),
                created: Date.now(),
                lastAccessed: Date.now(),
                owner: userId,
                target: target,
                obfuscated: true,
                obfuscator: 'hercules'
            });
            const rawUrl = `https://${req.headers.host}/api/raw?name=${newName}`;
            return res.status(200).json({ success: true, raw: rawUrl, name: newName, existed: true });
        }
        
        await saveScript(fullName, {
            code: obfuscatedCode,
            originalCode: code,
            name: name.trim(),
            created: Date.now(),
            lastAccessed: Date.now(),
            owner: userId,
            target: target,
            obfuscated: true,
            obfuscator: 'hercules'
        });
        
        const rawUrl = `https://${req.headers.host}/api/raw?name=${fullName}`;
        return res.status(200).json({ success: true, raw: rawUrl, name: fullName });
        
    } catch (error) {
        console.error('[RAW] Create error:', error.message);
        return res.status(500).json({ success: false, error: 'SCRIPT_CREATION_FAILED' });
    }
}

async function handleUpdate(req, res) {
    try {
        const { name, code, uid } = req.body;
        
        if (!name) return res.status(400).json({ success: false, error: 'Name is required' });
        if (!code || !code.trim()) return res.status(400).json({ success: false, error: 'Code is required' });
        
        const scriptData = await getScript(name);
        if (!scriptData) return res.status(404).json({ success: false, error: 'Script not found' });
        if (uid && scriptData.owner && scriptData.owner !== uid) return res.status(403).json({ success: false, error: 'Not your script' });
        
        // Dùng Hercules Obfuscator
        scriptData.code = obfuscateWithHercules(code);
        scriptData.originalCode = code;
        scriptData.updated = Date.now();
        scriptData.lastAccessed = Date.now();
        scriptData.obfuscator = 'hercules';
        
        await saveScript(name, scriptData);
        return res.status(200).json({ success: true, message: 'Updated successfully', name: name });
        
    } catch (error) {
        console.error('[RAW] Update error:', error.message);
        return res.status(500).json({ success: false, error: 'SCRIPT_UPDATE_FAILED' });
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
        console.error('[RAW] Delete error:', error.message);
        return res.status(500).json({ success: false, error: 'SCRIPT_DELETE_FAILED' });
    }
}

// ============================================================
// UI PAGES
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

// ============================================================
// MAIN HANDLER
// ============================================================

export default async function handler(req, res) {
    // Security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Session-Token, X-Challenge-Token, X-Challenge-Answer, X-Auth-Key');
    
    if (req.method === 'OPTIONS') return res.status(200).end();
    
    try {
        switch (req.method) {
            case 'GET': return await handleGet(req, res);
            case 'POST': return await handleCreate(req, res);
            case 'PUT': return await handleUpdate(req, res);
            case 'DELETE': return await handleDelete(req, res);
            default: return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
        }
    } catch (error) {
        console.error('[RAW] Unhandled error:', error.message);
        return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
    }
}
