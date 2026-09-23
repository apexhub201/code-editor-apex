// ============================================================
// api/raw.js - APEX HUB V10 (Keyforge + Firebase + Cache)
// ============================================================

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// ============================================================
// CONFIGURATION
// ============================================================
const CONFIG = {
    SCRIPTS_COLLECTION: 'scripts',
    
    // Keyforge MCP
    KEYFORGE_URL: process.env.KEYFORGE_URL || 'https://www.keyforge.win/mcp',
    KEYFORGE_TOKEN: process.env.KEYFORGE_TOKEN || 'kf_pat_L_Q3Z7jLEulOx3biuoW8aGrYzvnHlGUl',
    KEYFORGE_TIMEOUT: 30000, // 30s timeout
    KEYFORGE_RETRY: 2,       // retry 2 lần nếu fail
    KEYFORGE_TOOL: process.env.KEYFORGE_TOOL || 'obfuscate', // tool name
    
    // Cache
    CACHE_TTL: 5 * 60 * 1000,           // 5 phút fresh
    CACHE_STALE_GRACE: 60 * 60 * 1000,  // 1 giờ stale grace
    MAX_CACHE_ENTRIES: 500,
    CACHE_CLEANUP_INTERVAL: 60 * 1000,
    
    // Quota Protection
    QUOTA_COOLDOWN: 60 * 1000,          // 60 giây cooldown
    
    // Rate Limit
    RATE_LIMIT_MAX: 30,
    RATE_LIMIT_WINDOW: 60 * 1000,
    BURST_MAX: 10,
    BURST_WINDOW: 10 * 1000,
    BAN_DURATION: 2 * 60 * 1000,
    
    // IP Tracking
    MAX_IPS_TRACKED: 1000,
    IP_CLEANUP_INTERVAL: 60 * 1000,
    
    // Valid Keys
    VALID_KEYS: (process.env.APEX_MASTER_KEYS || 'd0egkw6en9eusrjje5vn70p2tvkngkkn,apex-master-key-2024').split(','),
    
    // Executor Patterns
    EXECUTOR_PATTERNS: [
        'roblox', 'synapse', 'krnl', 'script-ware', 'sentinel',
        'fluxus', 'electron', 'comet', 'oxygen', 'valyse',
        'hydrogen', 'codex', 'vega', 'trigon', 'nexus',
        'solara', 'jjsploit', 'celestial', 'evon', 'aris'
    ]
};

// ============================================================
// FIREBASE INITIALIZATION
// ============================================================
let db = null;
let firebaseReady = false;
let firebaseQuotaCooldownUntil = 0;

function initFirebase() {
    if (firebaseReady) return true;
    
    try {
        if (!getApps().length) {
            const projectId = process.env.FIREBASE_PROJECT_ID;
            const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
            const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

            console.log('[APEX FIREBASE] INIT CHECK:');
            console.log('  Project ID:', projectId ? 'SET' : 'MISSING');
            console.log('  Client Email:', clientEmail ? 'SET' : 'MISSING');
            console.log('  Private Key:', privateKey ? 'SET' : 'MISSING');

            if (!projectId || !clientEmail || !privateKey) {
                console.error('[APEX FIREBASE] INIT ERROR: Missing env vars');
                return false;
            }

            initializeApp({
                credential: cert({ projectId, clientEmail, privateKey })
            });
            console.log('[APEX FIREBASE] APP INITIALIZED');
        }
        
        db = getFirestore();
        firebaseReady = true;
        console.log('[APEX FIREBASE] FIRESTORE READY');
        return true;
    } catch (error) {
        console.error('[APEX FIREBASE] INIT ERROR:', error.message);
        return false;
    }
}

initFirebase();

// ============================================================
// KEYFORGE MCP CLIENT
// ============================================================
let keyforgeCooldownUntil = 0;
let keyforgeFailCount = 0;

function isKeyforgeCooldown() {
    return Date.now() < keyforgeCooldownUntil;
}

function triggerKeyforgeCooldown(ms = 60000) {
    keyforgeCooldownUntil = Date.now() + ms;
    console.log(`[KEYFORGE] COOLDOWN ${ms / 1000}s`);
}

/**
 * Gọi Keyforge MCP qua JSON-RPC 2.0
 * @param {string} method - MCP method (vd: 'tools/call')
 * @param {object} params - params cho method
 * @returns {Promise<object>}
 */
async function keyforgeRequest(method, params = {}) {
    const body = {
        jsonrpc: '2.0',
        id: Date.now(),
        method: method,
        params: params
    };
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.KEYFORGE_TIMEOUT);
    
    try {
        const response = await fetch(CONFIG.KEYFORGE_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${CONFIG.KEYFORGE_TOKEN}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/event-stream'
            },
            body: JSON.stringify(body),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(`Keyforge HTTP ${response.status}: ${text.slice(0, 200)}`);
        }
        
        const contentType = response.headers.get('content-type') || '';
        
        // MCP có thể trả SSE (text/event-stream) hoặc JSON
        if (contentType.includes('text/event-stream')) {
            return await parseSSEResponse(response);
        }
        
        const json = await response.json();
        
        if (json.error) {
            throw new Error(`Keyforge RPC error: ${JSON.stringify(json.error)}`);
        }
        
        return json.result;
    } catch (error) {
        clearTimeout(timeoutId);
        throw error;
    }
}

/**
 * Parse SSE response từ MCP server
 */
async function parseSSEResponse(response) {
    const text = await response.text();
    const lines = text.split('\n');
    let lastData = null;
    
    for (const line of lines) {
        if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;
            try {
                const parsed = JSON.parse(data);
                if (parsed.result) lastData = parsed.result;
                else if (parsed.error) throw new Error(JSON.stringify(parsed.error));
            } catch (e) {
                // skip non-JSON lines
            }
        }
    }
    
    if (!lastData) throw new Error('Keyforge: no result in SSE stream');
    return lastData;
}

/**
 * Obfuscate Lua code qua Keyforge
 * @param {string} code - Lua source
 * @param {object} options - tùy chọn obfuscation
 * @returns {Promise<string>} obfuscated code
 */
async function keyforgeObfuscate(code, options = {}) {
    // Kiểm tra cooldown
    if (isKeyforgeCooldown()) {
        throw new Error('Keyforge cooldown active');
    }
    
    const defaultOptions = {
        preset: 'Medium',        // Light | Medium | Strong | Extreme
        antiTamper: true,
        antiDump: true,
        watermark: 'APEX HUB',
        ...options
    };
    
    let lastError = null;
    
    for (let attempt = 0; attempt <= CONFIG.KEYFORGE_RETRY; attempt++) {
        try {
            console.log(`[KEYFORGE] Obfuscate attempt ${attempt + 1}/${CONFIG.KEYFORGE_RETRY + 1}, size=${code.length}`);
            
            // Bước 1: Kiểm tra tool có tồn tại không (chỉ lần đầu)
            if (keyforgeFailCount === 0 && attempt === 0) {
                try {
                    const tools = await keyforgeRequest('tools/list', {});
                    console.log('[KEYFORGE] Available tools:', 
                        tools?.tools?.map(t => t.name).join(', ') || 'unknown');
                } catch (e) {
                    console.warn('[KEYFORGE] tools/list failed:', e.message);
                }
            }
            
            // Bước 2: Gọi tool obfuscate
            const result = await keyforgeRequest('tools/call', {
                name: CONFIG.KEYFORGE_TOOL,
                arguments: {
                    code: code,
                    lua: code,
                    source: code,
                    ...defaultOptions
                }
            });
            
            // Bước 3: Extract obfuscated code từ result
            const obfuscated = extractObfuscatedCode(result);
            
            if (!obfuscated || typeof obfuscated !== 'string') {
                throw new Error('Keyforge returned empty result');
            }
            
            // Reset fail count khi thành công
            keyforgeFailCount = 0;
            
            console.log(`[KEYFORGE] SUCCESS: ${code.length} -> ${obfuscated.length} bytes`);
            return obfuscated;
            
        } catch (error) {
            lastError = error;
            keyforgeFailCount++;
            console.error(`[KEYFORGE] Attempt ${attempt + 1} failed:`, error.message);
            
            // Nếu là lỗi quota/auth → cooldown dài
            if (isKeyforgeQuotaError(error)) {
                triggerKeyforgeCooldown(5 * 60 * 1000); // 5 phút
                break;
            }
            
            // Nếu là lỗi auth → cooldown vĩnh viễn cho session
            if (isKeyforgeAuthError(error)) {
                triggerKeyforgeCooldown(60 * 60 * 1000); // 1 giờ
                break;
            }
            
            // Retry với backoff
            if (attempt < CONFIG.KEYFORGE_RETRY) {
                await sleep(1000 * Math.pow(2, attempt));
            }
        }
    }
    
    // Nếu fail quá nhiều → cooldown
    if (keyforgeFailCount >= 5) {
        triggerKeyforgeCooldown(5 * 60 * 1000);
    }
    
    throw lastError || new Error('Keyforge obfuscation failed');
}

/**
 * Extract obfuscated code từ nhiều format response khác nhau
 */
function extractObfuscatedCode(result) {
    if (!result) return null;
    if (typeof result === 'string') return result;
    
    // MCP tools/call thường trả về: { content: [{ type: 'text', text: '...' }] }
    if (result.content && Array.isArray(result.content)) {
        const textPart = result.content.find(c => c.type === 'text');
        if (textPart?.text) return textPart.text;
    }
    
    // Fallback các field phổ biến
    return result.obfuscated 
        || result.output 
        || result.result 
        || result.code 
        || result.data 
        || null;
}

function isKeyforgeQuotaError(error) {
    const msg = (error?.message || '').toLowerCase();
    return msg.includes('quota') 
        || msg.includes('rate limit') 
        || msg.includes('429')
        || msg.includes('too many');
}

function isKeyforgeAuthError(error) {
    const msg = (error?.message || '').toLowerCase();
    return msg.includes('401') 
        || msg.includes('403') 
        || msg.includes('unauthorized')
        || msg.includes('forbidden')
        || msg.includes('invalid token');
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================
// GLOBAL CACHE STATE
// ============================================================
if (!global.__APEX_CACHE__) {
    global.__APEX_CACHE__ = {
        data: new Map(),
        pendingReads: new Map(),
        lastCleanup: Date.now()
    };
    console.log('[APEX CACHE] INITIALIZED');
}

const cacheState = global.__APEX_CACHE__;

// ============================================================
// CACHE FUNCTIONS
// ============================================================
function cacheGet(key) {
    const now = Date.now();
    const entry = cacheState.data.get(key);
    if (!entry) return null;
    
    if (now < entry.expiresAt) {
        entry.lastAccess = now;
        console.log(`[APEX CACHE] HIT ${key}`);
        return { ...entry.value, fromCache: true };
    }
    return null;
}

function cacheGetStale(key) {
    const now = Date.now();
    const entry = cacheState.data.get(key);
    if (!entry) return null;
    
    if (now < entry.staleUntil) {
        entry.lastAccess = now;
        console.log(`[APEX CACHE] STALE_HIT ${key}`);
        return { ...entry.value, fromCache: true, stale: true };
    }
    
    cacheState.data.delete(key);
    return null;
}

function cacheSet(key, value, ttl = CONFIG.CACHE_TTL) {
    const now = Date.now();
    cacheState.data.set(key, {
        value: value,
        createdAt: now,
        lastAccess: now,
        expiresAt: now + ttl,
        staleUntil: now + ttl + CONFIG.CACHE_STALE_GRACE
    });
    cleanupCache();
    console.log(`[APEX CACHE] SET ${key}`);
}

function cacheDelete(key) {
    cacheState.data.delete(key);
    cacheState.pendingReads.delete(key);
    console.log(`[APEX CACHE] DELETE ${key}`);
}

function cleanupCache() {
    const now = Date.now();
    if (now - cacheState.lastCleanup < CONFIG.CACHE_CLEANUP_INTERVAL) return;
    cacheState.lastCleanup = now;
    
    for (const [key, entry] of cacheState.data.entries()) {
        if (now >= entry.staleUntil) cacheState.data.delete(key);
    }
    
    if (cacheState.data.size > CONFIG.MAX_CACHE_ENTRIES) {
        const entries = Array.from(cacheState.data.entries());
        entries.sort((a, b) => a[1].lastAccess - b[1].lastAccess);
        for (const [key] of entries.slice(0, entries.length - CONFIG.MAX_CACHE_ENTRIES)) {
            cacheState.data.delete(key);
        }
    }
}

// ============================================================
// RATE LIMIT STATE
// ============================================================
if (!global.__APEX_RATE_LIMIT__) {
    global.__APEX_RATE_LIMIT__ = {
        requests: new Map(),
        banned: new Map(),
        lastCleanup: Date.now()
    };
    console.log('[APEX RATE] INITIALIZED');
}

const rateState = global.__APEX_RATE_LIMIT__;

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

function buildRawUrl(host, name, key = null) {
    const cleanHost = (host || 'localhost:3000').replace(/^https?:\/\//, '').replace(/\/$/, '');
    const baseUrl = `https://${cleanHost}/api/raw?name=${encodeURIComponent(name)}`;
    return key ? `${baseUrl}&key=${key}` : baseUrl;
}

function getClientIP(req) {
    return (
        req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
        req.headers['x-real-ip'] ||
        req.socket?.remoteAddress ||
        'unknown'
    );
}

function isValidName(name) {
    if (!name || typeof name !== 'string') return false;
    if (name.length > 200) return false;
    if (!/^[a-zA-Z0-9_\-]+$/.test(name)) return false;
    return true;
}

// ============================================================
// RATE LIMIT FUNCTIONS
// ============================================================
function cleanupRateState() {
    const now = Date.now();
    if (now - rateState.lastCleanup < CONFIG.IP_CLEANUP_INTERVAL) return;
    rateState.lastCleanup = now;
    
    for (const [ip, bannedUntil] of rateState.banned.entries()) {
        if (now > bannedUntil) rateState.banned.delete(ip);
    }
    for (const [ip, data] of rateState.requests.entries()) {
        if (now - data.start > CONFIG.RATE_LIMIT_WINDOW * 2) {
            rateState.requests.delete(ip);
        }
    }
    if (rateState.requests.size > CONFIG.MAX_IPS_TRACKED) {
        const entries = Array.from(rateState.requests.entries());
        entries.sort((a, b) => a[1].start - b[1].start);
        for (const [ip] of entries.slice(0, entries.length - CONFIG.MAX_IPS_TRACKED)) {
            rateState.requests.delete(ip);
        }
    }
}

function isIPBanned(ip) {
    const now = Date.now();
    const bannedUntil = rateState.banned.get(ip);
    if (!bannedUntil) return false;
    if (now > bannedUntil) {
        rateState.banned.delete(ip);
        return false;
    }
    return true;
}

function banIP(ip) {
    rateState.banned.set(ip, Date.now() + CONFIG.BAN_DURATION);
    rateState.requests.delete(ip);
    console.log(`[APEX RATE] BANNED IP: ${ip}`);
}

function checkRateLimit(ip) {
    const now = Date.now();
    cleanupRateState();
    
    if (isIPBanned(ip)) return { allowed: false, reason: 'banned' };
    
    let data = rateState.requests.get(ip);
    if (!data || now - data.start > CONFIG.RATE_LIMIT_WINDOW) {
        data = { start: now, count: 0, burstStart: now, burstCount: 0 };
        rateState.requests.set(ip, data);
    }
    
    if (now - data.burstStart > CONFIG.BURST_WINDOW) {
        data.burstStart = now;
        data.burstCount = 0;
    }
    
    data.count++;
    data.burstCount++;
    
    if (data.burstCount > CONFIG.BURST_MAX) {
        banIP(ip);
        return { allowed: false, reason: 'burst' };
    }
    if (data.count > CONFIG.RATE_LIMIT_MAX) {
        return { allowed: false, reason: 'limit' };
    }
    
    return { allowed: true, remaining: CONFIG.RATE_LIMIT_MAX - data.count };
}

// ============================================================
// FIREBASE QUOTA
// ============================================================
function isQuotaCooldown() {
    return Date.now() < firebaseQuotaCooldownUntil;
}

function triggerQuotaCooldown() {
    firebaseQuotaCooldownUntil = Date.now() + CONFIG.QUOTA_COOLDOWN;
    console.log(`[APEX FIREBASE] QUOTA COOLDOWN`);
}

function isQuotaError(error) {
    const msg = (error?.message || '').toLowerCase();
    return msg.includes('resource_exhausted') || msg.includes('quota exceeded') || msg.includes('quota');
}

// ============================================================
// SCRIPT STORAGE (Firebase)
// ============================================================

/**
 * Lấy script từ Firebase (cache-first)
 * Trả về { code, obfuscated, name, owner, created, updatedAt }
 */
async function getScript(name) {
    const cacheKey = `script:${name}`;
    
    const fresh = cacheGet(cacheKey);
    if (fresh) return { ...fresh, fromCache: true };
    
    if (cacheState.pendingReads.has(cacheKey)) {
        return await cacheState.pendingReads.get(cacheKey);
    }
    
    if (!firebaseReady || !db) {
        if (!initFirebase()) {
            const stale = cacheGetStale(cacheKey);
            if (stale) return { ...stale, fromCache: true, stale: true };
            throw new Error('Firebase not available');
        }
    }
    
    if (isQuotaCooldown()) {
        const stale = cacheGetStale(cacheKey);
        if (stale) return { ...stale, fromCache: true, stale: true };
        throw new Error('Firebase quota cooldown');
    }
    
    const readPromise = (async () => {
        try {
            console.log(`[APEX FIREBASE] READ ${name}`);
            const doc = await db.collection(CONFIG.SCRIPTS_COLLECTION).doc(name).get();
            if (!doc.exists) return null;
            
            const data = doc.data();
            cacheSet(cacheKey, data, CONFIG.CACHE_TTL);
            return data;
        } catch (error) {
            console.error(`[APEX FIREBASE] ERROR ${name}:`, error.message);
            if (isQuotaError(error)) triggerQuotaCooldown();
            
            const stale = cacheGetStale(cacheKey);
            if (stale) return { ...stale, fromCache: true, stale: true };
            throw error;
        } finally {
            cacheState.pendingReads.delete(cacheKey);
        }
    })();
    
    cacheState.pendingReads.set(cacheKey, readPromise);
    return await readPromise;
}

/**
 * Lưu script lên Firebase
 * data: { code, obfuscated, name, owner, created, updatedAt }
 */
async function saveScript(name, data) {
    if (!firebaseReady || !db) {
        if (!initFirebase()) throw new Error('Firebase not available');
    }
    
    try {
        console.log(`[APEX FIREBASE] WRITE ${name}`);
        await db.collection(CONFIG.SCRIPTS_COLLECTION).doc(name).set({
            ...data,
            updatedAt: Date.now()
        }, { merge: true });
        
        cacheSet(`script:${name}`, data, CONFIG.CACHE_TTL);
        return true;
    } catch (error) {
        console.error(`[APEX FIREBASE] WRITE ERROR ${name}:`, error.message);
        if (isQuotaError(error)) triggerQuotaCooldown();
        throw error;
    }
}

async function deleteScript(name) {
    if (!firebaseReady || !db) {
        if (!initFirebase()) throw new Error('Firebase not available');
    }
    
    try {
        console.log(`[APEX FIREBASE] DELETE ${name}`);
        await db.collection(CONFIG.SCRIPTS_COLLECTION).doc(name).delete();
        cacheDelete(`script:${name}`);
        return true;
    } catch (error) {
        console.error(`[APEX FIREBASE] DELETE ERROR ${name}:`, error.message);
        if (isQuotaError(error)) triggerQuotaCooldown();
        throw error;
    }
}

// ============================================================
// OBFUSCATION PIPELINE
// ============================================================

/**
 * Obfuscate + cache kết quả vào Firebase
 * Pipeline: code gốc → Keyforge obfuscate → lưu obfuscated vào Firebase
 */
async function obfuscateAndCache(fullName, code, options = {}) {
    console.log(`[APEX OBF] Start: ${fullName} (${code.length} bytes)`);
    
    // 1. Gọi Keyforge
    let obfuscated;
    try {
        obfuscated = await keyforgeObfuscate(code, options);
    } catch (error) {
        console.error(`[APEX OBF] Keyforge failed:`, error.message);
        throw new Error(`Obfuscation failed: ${error.message}`);
    }
    
    if (!obfuscated || obfuscated.length < 10) {
        throw new Error('Obfuscation returned invalid result');
    }
    
    // 2. Lưu obfuscated code vào Firebase (không lưu code gốc để bảo mật)
    const scriptData = {
        obfuscated: obfuscated,
        obfuscator: 'keyforge',
        obfuscatedAt: Date.now(),
        originalSize: code.length,
        obfuscatedSize: obfuscated.length
    };
    
    return scriptData;
}

// ============================================================
// LOADER GENERATOR (cho executor — load code đã obfuscated)
// ============================================================
function generateLoader(obfuscatedCode, host, name) {
    const escaped = obfuscatedCode
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\r/g, '')
        .replace(/\n/g, '\\n');
    
    return `-- APEX HUB V10 Loader (Keyforge Protected)
-- Script: ${name}
-- Delivered by APEX HUB

local _src = "${escaped}"
local _f, _e = loadstring(_src)
if not _f then
    warn("=== APEX HUB LOADER ERROR ===")
    warn("Script: ${name}")
    warn("Error: " .. tostring(_e))
    error("Failed to compile protected script")
end
_src = nil
_f()
_f = nil
collectgarbage("collect")
`;
}

// ============================================================
// HTML PAGES
// ============================================================
function getProtectionPage() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Access Denied | APEX HUB</title>
<style>
:root{--bg:#050508;--card-bg:rgba(12,12,17,0.78);--card-border:rgba(255,255,255,0.055);--text-primary:#e6e6ea;--text-secondary:#6b6b76;--text-tertiary:#40404a;--button-primary-bg:rgba(255,255,255,0.035);--button-primary-border:rgba(255,255,255,0.07);--button-secondary-bg:transparent;--button-secondary-border:rgba(255,255,255,0.045);--button-hover-bg:rgba(255,255,255,0.06);--button-hover-border:rgba(255,255,255,0.12);--icon-color:rgba(255,255,255,0.16)}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background-color:var(--bg);color:var(--text-primary);min-height:100vh;display:flex;justify-content:center;align-items:center;padding:24px;-webkit-font-smoothing:antialiased}
.card{background:var(--card-bg);backdrop-filter:blur(48px);-webkit-backdrop-filter:blur(48px);border-radius:22px;padding:56px 52px;border:1px solid var(--card-border);max-width:520px;width:100%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.55);animation:cardFadeIn 0.8s cubic-bezier(0.22,1,0.36,1)}
@keyframes cardFadeIn{from{opacity:0;transform:translateY(28px) scale(0.97)}to{opacity:1;transform:translateY(0) scale(1)}}
.icon-lock{display:flex;align-items:center;justify-content:center;width:52px;height:52px;border:1px solid rgba(255,255,255,0.08);border-radius:50%;margin:0 auto 28px;color:var(--icon-color)}
.icon-lock svg{width:22px;height:22px;opacity:0.7}
.title{font-size:28px;font-weight:620;letter-spacing:-0.03em;color:var(--text-primary);margin-bottom:10px;line-height:1.2}
.subtitle{font-size:14px;font-weight:450;color:var(--text-secondary);margin-bottom:36px;line-height:1.6}
.subtitle strong{font-weight:600;color:#d4d4d8}
.separator{width:100%;height:1px;background:rgba(255,255,255,0.045);margin:0 0 32px 0}
.description{font-size:13.5px;color:var(--text-secondary);line-height:1.7;margin-bottom:36px;padding:0 8px}
.actions{display:flex;flex-direction:column;gap:12px;margin-bottom:36px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:14px 28px;border-radius:10px;font-size:14px;font-weight:500;text-decoration:none;transition:all 0.28s cubic-bezier(0.22,1,0.36,1);cursor:pointer;width:100%;box-sizing:border-box}
.btn-primary{background:var(--button-primary-bg);border:1px solid var(--button-primary-border);color:var(--text-primary)}
.btn-primary:hover{background:var(--button-hover-bg);border-color:var(--button-hover-border);transform:translateY(-1px)}
.btn-secondary{background:var(--button-secondary-bg);border:1px solid var(--button-secondary-border);color:var(--text-secondary)}
.btn-secondary:hover{background:var(--button-hover-bg);border-color:var(--button-hover-border);color:#c4c4cc;transform:translateY(-1px)}
.footer{font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-tertiary);font-weight:500}
@media (max-width:600px){.card{padding:44px 28px;border-radius:18px}.title{font-size:24px}.subtitle{font-size:13px}.description{font-size:12.5px;padding:0}.btn{padding:13px 22px;font-size:13.5px}}
</style>
</head>
<body>
<div class="card">
<div class="icon-lock">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
<path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
<circle cx="12" cy="16" r="1"></circle>
</svg>
</div>
<h1 class="title">Access Denied</h1>
<p class="subtitle">This Lua script is protected by <strong>APEX HUB</strong></p>
<div class="separator"></div>
<p class="description">You don't have permission to access these files.<br>Protected by Keyforge obfuscation against reverse engineering.</p>
<div class="actions">
<a href="https://apexhubeditor.vercel.app/" class="btn btn-primary">Return Home</a>
<a href="https://discord.gg/9wdU3rrGGw" target="_blank" class="btn btn-secondary">Discord</a>
</div>
<div class="footer">APEX HUB · Security Infrastructure · V10</div>
</div>
</body>
</html>`;
}

function getWelcomePage() {
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>APEX HUB | API Gateway</title><style>:root{--bg:#070708;--card:rgba(18,18,21,0.72);--border:rgba(255,255,255,0.07);--t1:#f5f5f5;--t2:#8b8b93;--t3:#505057}*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',system-ui,sans-serif;background:var(--bg);color:var(--t1);min-height:100vh;display:flex;justify-content:center;align-items:center}.card{background:var(--card);backdrop-filter:blur(36px);border-radius:18px;padding:52px 48px;border:1px solid var(--border);max-width:560px;width:90%;text-align:center;box-shadow:0 16px 48px rgba(0,0,0,0.5)}.brand{font-size:28px;font-weight:600;letter-spacing:-0.03em}.sub{font-size:10px;text-transform:uppercase;letter-spacing:0.18em;color:#66666d;margin:6px 0 32px}.desc{font-size:14px;color:var(--t2);margin-bottom:32px}.sep{height:1px;background:var(--border);margin-bottom:28px}.ep{display:flex;align-items:center;gap:14px;padding:12px 16px;font-size:13px;font-family:monospace;border-radius:8px;transition:0.2s}.ep:hover{background:rgba(255,255,255,0.02)}.method{font-size:10px;text-transform:uppercase;padding:4px 10px;border-radius:6px;min-width:50px;text-align:center;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.05);color:var(--t2)}.footer{margin-top:32px;font-size:10px;text-transform:uppercase;letter-spacing:0.06em;color:var(--t3)}</style></head><body><div class="card"><h1 class="brand">APEX HUB</h1><div class="sub">API Gateway · V10</div><p class="desc">Production infrastructure with Keyforge obfuscation.</p><div class="sep"></div><div class="ep"><span class="method">POST</span>/api/raw — Save + Obfuscate</div><div class="ep"><span class="method">PUT</span>/api/raw — Update + Re-obfuscate</div><div class="ep"><span class="method">GET</span>/api/raw?name=script</div><div class="ep"><span class="method">DEL</span>/api/raw?name=script</div><div class="footer">APEX HUB · API Infrastructure · V10</div></div></body></html>`;
}

function getErrorPage(name) {
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>404 | APEX HUB</title><style>:root{--bg:#070708;--card:rgba(18,18,21,0.72);--border:rgba(255,255,255,0.07);--t1:#f5f5f5;--t2:#8b8b93}*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',system-ui,sans-serif;background:var(--bg);color:var(--t1);min-height:100vh;display:flex;justify-content:center;align-items:center}.card{background:var(--card);border-radius:18px;padding:52px 48px;border:1px solid var(--border);text-align:center;max-width:480px;width:90%}.code{font-size:5rem;font-family:monospace;color:var(--t2);margin-bottom:8px}.title{font-size:16px;font-weight:500;margin-bottom:12px}.msg{font-size:14px;color:var(--t2);margin-bottom:20px}.ref{display:inline-block;padding:8px 18px;background:rgba(255,255,255,0.02);border:1px solid var(--border);border-radius:8px;font-family:monospace;font-size:12px;color:var(--t2)}a{display:inline-block;margin-top:20px;color:var(--t2);text-decoration:none;font-size:13px}a:hover{color:var(--t1)}</style></head><body><div class="card"><div class="code">404</div><div class="title">Resource not found</div><p class="msg">The requested script could not be located.</p><div class="ref">${name}</div><br><a href="https://apexhubeditor.vercel.app/">← Return to Gateway</a></div></body></html>`;
}

function getBannedPage() {
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Access Denied | APEX HUB</title><style>:root{--bg:#070708;--card:rgba(18,18,21,0.72);--border:rgba(255,255,255,0.07);--t1:#f5f5f5;--t2:#8b8b93;--t3:#505057}*{margin:0;padding:0}body{font-family:'Inter',system-ui,sans-serif;background:var(--bg);color:var(--t1);min-height:100vh;display:flex;justify-content:center;align-items:center}.card{background:var(--card);border-radius:18px;padding:52px 48px;border:1px solid var(--border);text-align:center;max-width:480px;width:90%}.icon{width:48px;height:48px;border:1px solid rgba(255,255,255,0.1);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 24px;color:var(--t2)}.title{font-size:16px;margin-bottom:12px}.msg{font-size:14px;color:var(--t2);margin-bottom:24px}.panel{background:rgba(255,255,255,0.015);border:1px solid var(--border);border-radius:10px;padding:16px 20px;text-align:left}.row{display:flex;justify-content:space-between;padding:4px 0;font-size:11px}.lbl{font-size:10px;text-transform:uppercase;color:var(--t3)}.val{font-family:monospace;color:var(--t2)}.ft{margin-top:24px;font-size:10px;text-transform:uppercase;color:var(--t3)}</style></head><body><div class="card"><div class="icon">—</div><div class="title">Access Denied</div><p class="msg">This request has been temporarily blocked.</p><div class="panel"><div class="row"><span class="lbl">Event</span><span class="val">ACCESS POLICY VIOLATION</span></div><div class="row"><span class="lbl">Status</span><span class="val">TEMPORARILY BLOCKED</span></div></div><div class="ft">APEX HUB · Security Infrastructure</div></div></body></html>`;
}

function getRateLimitPage() {
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Rate Limited | APEX HUB</title><style>:root{--bg:#070708;--card:rgba(18,18,21,0.72);--border:rgba(255,255,255,0.07);--t1:#f5f5f5;--t2:#8b8b93;--t3:#505057}*{margin:0;padding:0}body{font-family:'Inter',system-ui,sans-serif;background:var(--bg);color:var(--t1);min-height:100vh;display:flex;justify-content:center;align-items:center}.card{background:var(--card);border-radius:18px;padding:52px 48px;border:1px solid var(--border);text-align:center;max-width:480px;width:90%}.icon{width:48px;height:48px;border:1px solid rgba(255,255,255,0.1);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 24px;color:var(--t2)}.title{font-size:16px;margin-bottom:12px}.msg{font-size:14px;color:var(--t2);margin-bottom:20px}.panel{background:rgba(255,255,255,0.015);border:1px solid var(--border);border-radius:10px;padding:16px 20px;text-align:left}.row{display:flex;justify-content:space-between;padding:4px 0;font-size:11px}.lbl{font-size:10px;text-transform:uppercase;color:var(--t3)}.val{font-family:monospace;color:var(--t2)}.ft{margin-top:24px;font-size:10px;text-transform:uppercase;color:var(--t3)}</style></head><body><div class="card"><div class="icon">—</div><div class="title">Request Throttled</div><p class="msg">Too many requests from this client.</p><div class="panel"><div class="row"><span class="lbl">Policy</span><span class="val">RATE LIMIT</span></div><div class="row"><span class="lbl">Status</span><span class="val">THROTTLED</span></div></div><div class="ft">APEX HUB · Security Infrastructure</div></div></body></html>`;
}

// ============================================================
// MAIN HANDLER
// ============================================================
export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Auth-Key');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const ip = getClientIP(req);
    console.log(`[APEX REQUEST] ${req.method} from ${ip}`);

    const limitResult = checkRateLimit(ip);
    if (!limitResult.allowed) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        if (limitResult.reason === 'banned') return res.status(403).send(getBannedPage());
        return res.status(429).send(getRateLimitPage());
    }

    try {
        // ============================================================
        // GET — Fetch + serve obfuscated script
        // ============================================================
        if (req.method === 'GET') {
            const { name, key, raw } = req.query;
            const ua = (req.headers['user-agent'] || '').toLowerCase();
            const authKey = req.headers['x-auth-key'] || '';
            
            if (!name) {
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                return res.send(getWelcomePage());
            }
            if (!isValidName(name)) {
                return res.status(400).json({ error: 'Invalid script name' });
            }
            
            const hasValidKey = CONFIG.VALID_KEYS.includes(key) || CONFIG.VALID_KEYS.includes(authKey);
            const wantsRaw = raw === 'true';
            const isExecutor = CONFIG.EXECUTOR_PATTERNS.some(p => ua.includes(p));
            
            if (!hasValidKey && !wantsRaw && !isExecutor) {
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                return res.send(getProtectionPage());
            }
            
            let scriptData;
            try {
                scriptData = await getScript(name);
            } catch (error) {
                console.error(`[APEX GET] ERROR:`, error.message);
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                return res.status(503).send(getProtectionPage());
            }
            
            if (!scriptData) {
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                return res.status(404).send(getErrorPage(name));
            }
            
            // Ưu tiên obfuscated code
            const codeToServe = scriptData.obfuscated || scriptData.code;
            
            if (!codeToServe) {
                return res.status(500).json({ error: 'Script content is empty' });
            }
            
            // API mode: trả JSON với obfuscated code
            if (hasValidKey || wantsRaw) {
                return res.json({
                    success: true,
                    name: scriptData.name || name,
                    obfuscated: codeToServe,
                    obfuscator: scriptData.obfuscator || 'keyforge',
                    size: codeToServe.length
                });
            }
            
            // Executor mode: trả loader
            if (isExecutor) {
                res.setHeader('Content-Type', 'text/plain; charset=utf-8');
                return res.send(generateLoader(codeToServe, req.headers.host, name));
            }
            
            return res.json({ success: true, protected: true });
        }
        
        // ============================================================
        // POST — Save + Obfuscate
        // ============================================================
        if (req.method === 'POST') {
            const { code, name, uid, options } = req.body;
            
            console.log(`[APEX POST] Name: ${name || 'N/A'}`);
            
            if (!code || !code.trim()) {
                return res.status(400).json({ success: false, error: 'Code is required' });
            }
            if (!name || !name.trim()) {
                return res.status(400).json({ success: false, error: 'Name is required' });
            }
            
            const fullName = (uid || 'public') + '_' + normalizeName(name);
            
            // Obfuscate qua Keyforge
            let obfData;
            try {
                obfData = await obfuscateAndCache(fullName, code, options || {});
            } catch (error) {
                console.error('[APEX POST] Obfuscation failed:', error.message);
                return res.status(503).json({
                    success: false,
                    error: 'Obfuscation service unavailable',
                    detail: error.message
                });
            }
            
            const scriptData = {
                obfuscated: obfData.obfuscated,
                obfuscator: 'keyforge',
                obfuscatedAt: obfData.obfuscatedAt,
                originalSize: obfData.originalSize,
                obfuscatedSize: obfData.obfuscatedSize,
                name: name.trim(),
                owner: uid || 'public',
                created: Date.now()
            };
            
            try {
                await saveScript(fullName, scriptData);
            } catch (error) {
                console.error('[APEX POST] SAVE ERROR:', error.message);
                return res.status(503).json({ success: false, error: 'Unable to save' });
            }
            
            const rawUrl = buildRawUrl(req.headers.host, fullName);
            const rawUrlWithKey = buildRawUrl(req.headers.host, fullName, CONFIG.VALID_KEYS[0]);
            
            return res.status(200).json({
                success: true,
                raw: rawUrl,
                rawWithKey: rawUrlWithKey,
                name: fullName,
                obfuscator: 'keyforge',
                originalSize: obfData.originalSize,
                obfuscatedSize: obfData.obfuscatedSize
            });
        }
        
        // ============================================================
        // PUT — Update + Re-obfuscate
        // ============================================================
        if (req.method === 'PUT') {
            const { name, code, uid, options } = req.body;
            
            console.log(`[APEX PUT] Name: ${name || 'N/A'}`);
            
            if (!name) return res.status(400).json({ success: false, error: 'Name is required' });
            if (!code || !code.trim()) return res.status(400).json({ success: false, error: 'Code is required' });
            
            let scriptData;
            try {
                scriptData = await getScript(name);
            } catch (error) {
                return res.status(503).json({ success: false, error: 'Service unavailable' });
            }
            
            if (!scriptData) return res.status(404).json({ success: false, error: 'Script not found' });
            
            if (uid && scriptData.owner && scriptData.owner !== uid) {
                return res.status(403).json({ success: false, error: 'Not your script' });
            }
            
            // Re-obfuscate
            let obfData;
            try {
                obfData = await obfuscateAndCache(name, code, options || {});
            } catch (error) {
                return res.status(503).json({
                    success: false,
                    error: 'Obfuscation failed',
                    detail: error.message
                });
            }
            
            const updatedData = {
                ...scriptData,
                obfuscated: obfData.obfuscated,
                obfuscator: 'keyforge',
                obfuscatedAt: obfData.obfuscatedAt,
                originalSize: obfData.originalSize,
                obfuscatedSize: obfData.obfuscatedSize,
                updated: Date.now()
            };
            
            try {
                await saveScript(name, updatedData);
            } catch (error) {
                return res.status(503).json({ success: false, error: 'Unable to update' });
            }
            
            return res.status(200).json({
                success: true,
                message: 'Updated + re-obfuscated',
                raw: buildRawUrl(req.headers.host, name),
                name: name
            });
        }
        
        // ============================================================
        // DELETE
        // ============================================================
        if (req.method === 'DELETE') {
            const { name, uid } = req.query;
            
            if (!name) return res.status(400).json({ success: false, error: 'Name is required' });
            
            let scriptData;
            try {
                scriptData = await getScript(name);
            } catch (error) {
                return res.status(503).json({ success: false, error: 'Service unavailable' });
            }
            
            if (!scriptData) return res.status(404).json({ success: false, error: 'Script not found' });
            
            if (uid && scriptData.owner && scriptData.owner !== uid) {
                return res.status(403).json({ success: false, error: 'Not your script' });
            }
            
            try {
                await deleteScript(name);
            } catch (error) {
                return res.status(503).json({ success: false, error: 'Unable to delete' });
            }
            
            return res.status(200).json({ success: true, message: 'Deleted successfully' });
        }
        
        return res.status(405).json({ error: 'Method not allowed' });
        
    } catch (error) {
        console.error('[APEX HANDLER] ERROR:', error.message);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
