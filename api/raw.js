import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import crypto from 'crypto';

import { apexProtection } from './apex-ultimate-protection.js';

if (!getApps().length) {
    initializeApp({
        credential: cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
    });
}

const db = getFirestore();
const scriptsCollection = db.collection('scripts');
const hwidCollection = db.collection('hwid_whitelist');
const ipRequests = new Map();

// ===== CONFIG =====
const MASTER_SECRET = process.env.MASTER_SECRET || crypto.randomBytes(32).toString('hex');
const MASTER_KEY = process.env.MASTER_KEY || 'change-me-to-secure-key-2024';
const TOKEN_EXPIRY = 30 * 1000;
const STORAGE_KEY = crypto.createHash('sha256').update(MASTER_SECRET + 'storage').digest();
const ENCRYPTION_KEY = crypto.createHash('sha256').update(MASTER_SECRET + 'enc_v2').digest();
const HMAC_KEY = crypto.createHash('sha256').update(MASTER_SECRET + 'hmac_v2').digest();
const SCRIPT_CHUNKS = 4;
const CHUNK_SALT = crypto.randomBytes(16).toString('hex');

// ===== TOKEN MANAGEMENT =====
const tokenStore = new Map();
const usedTokens = new Set();

function generateToken(hwid) {
    const tokenId = crypto.randomBytes(16).toString('hex');
    const timestamp = Date.now();
    const payload = `${tokenId}:${hwid}:${timestamp}`;
    const signature = crypto.createHmac('sha256', MASTER_SECRET).update(payload).digest('hex');
    const token = Buffer.from(`${payload}:${signature}`).toString('base64');
    tokenStore.set(tokenId, { hwid, timestamp, used: false });
    return token;
}

function verifyToken(token, hwid) {
    try {
        const decoded = Buffer.from(token, 'base64').toString('utf-8');
        const parts = decoded.split(':');
        if (parts.length !== 4) return false;
        const [tokenId, tokenHwid, timestamp, signature] = parts;
        const now = Date.now();
        if (now - parseInt(timestamp) > TOKEN_EXPIRY) {
            tokenStore.delete(tokenId);
            usedTokens.add(tokenId);
            return false;
        }
        if (tokenHwid !== hwid) return false;
        if (usedTokens.has(tokenId)) return false;
        const payload = `${tokenId}:${tokenHwid}:${timestamp}`;
        const expectedSig = crypto.createHmac('sha256', MASTER_SECRET).update(payload).digest('hex');
        if (signature !== expectedSig) return false;
        usedTokens.add(tokenId);
        tokenStore.delete(tokenId);
        return true;
    } catch {
        return false;
    }
}

// ===== HWID WHITELIST =====
async function isHWIDWhitelisted(hwid) {
    try {
        const doc = await hwidCollection.doc(hwid).get();
        return doc.exists && doc.data().active === true;
    } catch {
        return false;
    }
}

async function addHWIDToWhitelist(hwid, note = '') {
    await hwidCollection.doc(hwid).set({
        hwid, note, addedAt: Date.now(), active: true
    });
}

// ===== STORAGE ENCRYPTION =====
function encryptForStorage(code) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', STORAGE_KEY, iv);
    let encrypted = cipher.update(code, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return { data: encrypted, iv: iv.toString('hex'), tag: authTag };
}

function decryptFromStorage(encryptedData) {
    const decipher = crypto.createDecipheriv('aes-256-gcm', STORAGE_KEY, Buffer.from(encryptedData.iv, 'hex'));
    decipher.setAuthTag(Buffer.from(encryptedData.tag, 'hex'));
    let decrypted = decipher.update(encryptedData.data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

// ===== SESSION ENCRYPTION =====
function encryptCode(code, scriptId) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(code, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    const signature = crypto.createHmac('sha256', HMAC_KEY).update(`${scriptId}:${encrypted}:${authTag}`).digest('hex');
    return { data: encrypted, iv: iv.toString('hex'), tag: authTag, sig: signature, scriptId: scriptId };
}

function encryptChunk(code, scriptId, chunkIndex) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(code, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    const signature = crypto.createHmac('sha256', HMAC_KEY).update(`${scriptId}:${chunkIndex}:${encrypted}:${authTag}`).digest('hex');
    return { data: encrypted, iv: iv.toString('hex'), tag: authTag, sig: signature, chunkIndex: chunkIndex, totalChunks: SCRIPT_CHUNKS };
}

function splitAndEncryptScript(code, scriptId, hwid) {
    const watermark = `-- USER: ${hwid}\n-- BUILD: ${new Date().toISOString()}\n-- CHUNKS: ${SCRIPT_CHUNKS}\n\n`;
    const watermarkedCode = watermark + code;
    const chunks = [];
    const chunkSize = Math.ceil(watermarkedCode.length / SCRIPT_CHUNKS);
    for (let i = 0; i < SCRIPT_CHUNKS; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, watermarkedCode.length);
        const chunkCode = watermarkedCode.substring(start, end);
        if (chunkCode.length > 0) chunks.push(encryptChunk(chunkCode, scriptId, i));
    }
    return chunks;
}

// ===== FAKE CODE =====
function getFakeCode(ip, id, reason = 'unknown') {
    const fakeCodes = [
        `-- APEX HUB - FAKE SCRIPT
-- IP: ${ip} | ID: ${id || 'unknown'}
-- Reason: ${reason}
-- Time: ${new Date().toISOString()}
warn("Unauthorized access detected")
warn("This is a decoy script")
warn("Use official APEX HUB loader")
return nil`,
        `-- DECOY SCRIPT - NOT REAL
-- Your access has been logged
-- IP: ${ip}
-- Reason: ${reason}
warn("APEX HUB: Script locked - Use official loader")
return nil`,
        `-- PROTECTED SCRIPT
-- Unauthorized access attempt logged
-- IP: ${ip}
-- Reason: ${reason}
warn("Access denied - This script requires authentication")
return nil`
    ];
    return fakeCodes[Math.floor(Math.random() * fakeCodes.length)];
}

// ===== POISON CODE =====
function getPoisonCode(ip, id, reason) {
    const poisons = [
        `-- ============================================
-- APEX HUB SECURITY SYSTEM
-- ============================================
-- WARNING: Unauthorized access detected
-- IP: ${ip}
-- Script: ${id}
-- Reason: ${reason}
-- Time: ${new Date().toISOString()}
-- ============================================
-- THIS IS A PROTECTED SCRIPT
-- DO NOT ATTEMPT TO EXECUTE
-- ============================================

local RunService = game:GetService("RunService")
local startTime = tick()
local warnings = 0

warn("============================================")
warn("APEX HUB PROTECTION ACTIVE")
warn("============================================")
warn("Your IP has been logged: ${ip}")
warn("Your HWID has been recorded")
warn("")
warn("This script will now lock your client")
warn("Close Roblox to stop this script")
warn("============================================")

while true do
    warnings = warnings + 1
    if warnings % 100 == 0 then
        local elapsed = math.floor(tick() - startTime)
        warn("Script running: " .. elapsed .. " seconds")
        warn("Tip: Rejoin game to stop")
    end
    RunService.Heartbeat:Wait()
    if tick() - startTime > 300 then break end
end
warn("Execution timeout - script stopped")
return nil`,

        `-- ============================================
-- APEX HUB - FAKE SCRIPT
-- ============================================
-- IP: ${ip}
-- Script: ${id}
-- Time: ${new Date().toISOString()}
-- ============================================

warn("Loading script...")
wait(1)
warn("Initializing modules...")
wait(0.5)
warn("Connecting to server...")
wait(1.5)
warn("ERROR: Connection refused")
wait(1)
warn("Retrying...")
wait(2)
warn("ERROR: Authentication failed")
wait(1)
warn("Script execution failed")
warn("")
warn("Possible causes:")
warn("- Invalid script source")
warn("- Network error")
warn("- Script has been removed")
warn("- Your IP (${ip}) is blocked")
warn("")
warn("Script ID: ${id}")
warn("Status: DECOY EXECUTED")
warn("No real code was run")
warn("")
warn("Use official APEX HUB loader to access real scripts")
return nil`
    ];
    return poisons[Math.floor(Math.random() * poisons.length)];
}

// ===== DETECTION FUNCTIONS =====
function isDiscordBot(req) {
    const ua = (req.headers['user-agent'] || '').toLowerCase();
    const discordPatterns = [
        'discordbot', 'discord', 'telegrambot', 'slackbot', 'whatsapp',
        'facebookexternalhit', 'twitterbot', 'linkedinbot', 'pinterest',
        'redditbot', 'tumblr', 'viber', 'line', 'wechat'
    ];
    return discordPatterns.some(p => ua.includes(p));
}

function isDeobfuscator(req) {
    const ua = (req.headers['user-agent'] || '').toLowerCase();
    const deobPatterns = [
        'luraph', 'ironbrew', 'moonsec', 'zenz', 'psu', 'theon',
        'deobfuscator', 'unluac', 'lua-dec', 'cfx.re', 'fivem', 'txadmin',
        'deobf', '.get', '.l', 'httpget', 'syn.request', 'http.request',
        'game:HttpGet', 'synapse.request', 'fluxus.request', 'krnl', 'fluxus',
        'script-ware', 'sentinel', 'electron', 'oxygen', 'comet', 'sirhurt',
        'vega', 'scriptware'
    ];
    if (deobPatterns.some(p => ua.includes(p))) return true;
    if (ua.includes('luasocket') && !ua.includes('roblox')) return true;
    return false;
}

function isRealBrowser(req) {
    const ua = (req.headers['user-agent'] || '').toLowerCase();
    const accept = req.headers['accept'] || '';
    const hasSecFetch = req.headers['sec-fetch-site'] || req.headers['sec-fetch-mode'];
    const hasBrowser = ua.includes('mozilla') || ua.includes('chrome') || 
                      ua.includes('safari') || ua.includes('firefox') || ua.includes('edg');
    const wantsHTML = accept.includes('text/html');
    return hasSecFetch && wantsHTML && hasBrowser;
}

function isBot(req) {
    const ua = (req.headers['user-agent'] || '').toLowerCase();
    const botPatterns = [
        'curl', 'wget', 'python', 'java/', 'node', 'axios',
        'httpclient', 'okhttp', 'bot', 'crawler', 'spider', 'scraper',
        'postman', 'insomnia', 'roblox', 'wininet', 'paw', 'swagger', 'go-http-client',
        'ruby', 'php', 'perl', 'powershell', 'windowspowershell',
        'invoke-webrequest', 'invoke-restmethod'
    ];
    return botPatterns.some(p => ua.includes(p));
}

// ===== CLEANUP =====
setInterval(() => {
    const now = Date.now();
    for (const [ip, data] of ipRequests) if (now > data.reset) ipRequests.delete(ip);
    for (const tokenId of usedTokens) {
        const td = tokenStore.get(tokenId);
        if (!td || now - td.timestamp > 300000) usedTokens.delete(tokenId);
    }
    for (const [tokenId, data] of tokenStore) if (now - data.timestamp > TOKEN_EXPIRY * 2) tokenStore.delete(tokenId);
}, 60000);

// Cache
const scriptCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

async function getScript(id) {
    const cached = scriptCache.get(id);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) return cached.code;
    const doc = await scriptsCollection.doc(id).get();
    if (!doc.exists) return null;
    const data = doc.data();
    let code;
    if (data.encrypted && data.iv && data.tag) {
        code = decryptFromStorage({ data: data.encrypted, iv: data.iv, tag: data.tag });
    } else {
        code = data.code;
    }
    scriptCache.set(id, { code, timestamp: Date.now() });
    scriptsCollection.doc(id).update({ lastAccessed: Date.now(), accessCount: (data.accessCount || 0) + 1 }).catch(() => {});
    return code;
}

// ===== REQUEST LOGGING =====
const requestLog = [];

function logSuspiciousRequest(ip, reason, headers = {}) {
    requestLog.push({ ip, reason, timestamp: Date.now(), userAgent: headers['user-agent'] || 'unknown', referer: headers['referer'] || 'unknown', accept: headers['accept'] || 'unknown' });
    if (requestLog.length > 1000) requestLog.splice(0, 100);
    console.log(`[SECURITY] Suspicious request from ${ip}: ${reason}`);
}

// ===== MAIN HANDLER =====
export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, X-Apex-Token, X-Apex-HWID, X-Apex-Chunk');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.headers['x-real-ip'] || req.socket.remoteAddress || 'unknown';
    const ua = (req.headers['user-agent'] || '').toLowerCase();
    const accept = req.headers['accept'] || '';

    // Rate limiting
    const now = Date.now();
    let ipd = ipRequests.get(ip);
    if (!ipd || now > ipd.reset) ipd = { count: 0, reset: now + 60000, scriptAccess: new Map(), suspicious: 0 };
    ipd.count++;
    ipRequests.set(ip, ipd);
    if (ipd.suspicious > 10) { logSuspiciousRequest(ip, 'IP blocked - too many suspicious', req.headers); res.setHeader('Content-Type', 'text/plain'); return res.status(403).send('-- Access denied'); }
    if (ipd.count > 60) { res.setHeader('Content-Type', 'text/plain'); return res.status(429).send('-- Rate limit exceeded'); }

    // ===== POST /api/auth =====
    if (req.method === 'POST' && req.url?.includes('/auth')) {
        const { hwid } = req.body || {};
        if (!hwid) return res.status(400).json({ error: 'HWID required' });
        const isWhitelisted = await isHWIDWhitelisted(hwid);
        if (!isWhitelisted) { ipd.suspicious++; logSuspiciousRequest(ip, 'HWID not whitelisted', req.headers); return res.status(403).json({ error: 'HWID not authorized', code: 'HWID_NOT_WHITELISTED' }); }
        const token = generateToken(hwid);
        return res.status(200).json({ success: true, token: token, expiresIn: TOKEN_EXPIRY / 1000 });
    }

    // ===== POST /api/whitelist =====
    if (req.method === 'POST' && req.url?.includes('/whitelist')) {
        const { hwid, masterKey, note } = req.body || {};
        if (masterKey !== MASTER_KEY) { ipd.suspicious++; logSuspiciousRequest(ip, 'Invalid master key', req.headers); return res.status(403).json({ error: 'Invalid master key' }); }
        if (!hwid) return res.status(400).json({ error: 'HWID required' });
        await addHWIDToWhitelist(hwid, note || '');
        return res.status(200).json({ success: true, message: 'HWID added to whitelist' });
    }

    // ===== POST /api/validate =====
    if (req.method === 'POST' && req.url?.includes('/validate')) {
        const token = req.headers['x-apex-token'] || '';
        const hwid = req.headers['x-apex-hwid'] || '';
        if (!token || !hwid) return res.status(403).json({ success: false, code: 'AUTH_REQUIRED' });
        const isWhitelisted = await isHWIDWhitelisted(hwid);
        if (!isWhitelisted) return res.status(403).json({ success: false, code: 'HWID_NOT_WHITELISTED' });
        const isTokenValid = token && token.length > 20;
        return res.status(200).json({ success: isTokenValid, timestamp: Date.now() });
    }

    // ===== POST - Create script =====
    if (req.method === 'POST' && !req.url?.includes('/auth') && !req.url?.includes('/whitelist') && !req.url?.includes('/validate')) {
        const { code } = req.body || {};
        if (!code || !code.trim()) return res.status(400).json({ success: false, error: 'Code required' });
        const id = Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
        const encrypted = encryptForStorage(code);
        await scriptsCollection.doc(id).set({ encrypted: encrypted.data, iv: encrypted.iv, tag: encrypted.tag, created: Date.now(), lastAccessed: Date.now(), updated: null, accessCount: 0, chunks: SCRIPT_CHUNKS });
        return res.status(200).json({ success: true, raw: `https://${req.headers.host}/api/raw?id=${id}`, id });
    }

    // ===== PUT - Update script =====
    if (req.method === 'PUT') {
        const { id, code } = req.body || {};
        if (!id || !code?.trim()) return res.status(400).json({ success: false, error: 'ID and code required' });
        const doc = await scriptsCollection.doc(id).get();
        if (!doc.exists) return res.status(404).json({ success: false, error: 'Script not found' });
        const encrypted = encryptForStorage(code);
        await scriptsCollection.doc(id).update({ encrypted: encrypted.data, iv: encrypted.iv, tag: encrypted.tag, updated: Date.now(), lastAccessed: Date.now() });
        scriptCache.delete(id);
        return res.status(200).json({ success: true, raw: `https://${req.headers.host}/api/raw?id=${id}` });
    }

    // ===== DELETE =====
    if (req.method === 'DELETE') {
        const { id } = req.query;
        if (!id) return res.status(400).json({ success: false, error: 'ID required' });
        const doc = await scriptsCollection.doc(id).get();
        if (!doc.exists) return res.status(404).json({ success: false, error: 'Script not found' });
        await scriptsCollection.doc(id).delete();
        scriptCache.delete(id);
        return res.status(200).json({ success: true });
    }

// ===== GET - Lấy script =====
if (req.method === 'GET') {
    const { id } = req.query;
    
    if (!id) {
        res.setHeader('Content-Type', 'text/html');
        return res.send(WELCOME);
    }

    const token = req.headers['x-apex-token'] || '';
    const hwid = req.headers['x-apex-hwid'] || '';
    const chunkIndex = parseInt(req.headers['x-apex-chunk'] || '-1');

    // 1. BROWSER THẬT -> PROTECT PAGE
    if (isRealBrowser(req)) {
        res.setHeader('Content-Type', 'text/html');
        return res.send(PROTECT);
    }

    // 2. CÓ TOKEN + HWID HỢP LỆ -> CODE THẬT
    if (token && hwid && verifyToken(token, hwid)) {
        const isWhitelisted = await isHWIDWhitelisted(hwid);
        if (!isWhitelisted) {
            ipd.suspicious++;
            res.setHeader('Content-Type', 'text/plain');
            return res.send(getFakeCode(ip, id, 'hwid_not_whitelisted'));
        }
        
        const scriptCode = await getScript(id);
        if (!scriptCode) {
            return res.status(404).json({ error: 'Script not found' });
        }
        
        let scriptAccess = ipd.scriptAccess.get(id) || { count: 0, reset: now + 3600000 };
        if (now > scriptAccess.reset) scriptAccess = { count: 0, reset: now + 3600000 };
        scriptAccess.count++;
        ipd.scriptAccess.set(id, scriptAccess);
        
        if (scriptAccess.count > 50) {
            return res.status(429).json({ error: 'Script access limit exceeded' });
        }
        
        if (chunkIndex >= 0 && chunkIndex < SCRIPT_CHUNKS) {
            const chunks = splitAndEncryptScript(scriptCode, id, hwid);
            const chunk = chunks.find(c => c.chunkIndex === chunkIndex);
            if (!chunk) return res.status(400).json({ error: 'Invalid chunk index' });
            return res.status(200).json({ 
                success: true, 
                encrypted: true, 
                chunk: chunk, 
                nextChunk: chunkIndex + 1 < SCRIPT_CHUNKS ? chunkIndex + 1 : -1 
            });
        }
        
        const encrypted = encryptCode(scriptCode, id);
        return res.status(200).json({ 
            success: true, 
            encrypted: true, 
            data: encrypted.data, 
            iv: encrypted.iv, 
            tag: encrypted.tag, 
            sig: encrypted.sig, 
            scriptId: encrypted.scriptId 
        });
    }

      // 3. TẤT CẢ CÒN LẠI -> ULTIMATE PROTECTION
    try {
        const protection = await apexProtection.protect(req, id);
        
        if (protection && protection.blocked) {
            if (protection.response && protection.response.headers) {
                Object.entries(protection.response.headers).forEach(([key, value]) => {
                    res.setHeader(key, value);
                });
            }
            res.status(protection.response?.status || 403);
            return res.send(protection.response?.body || getFakeCode(ip, id, 'blocked'));
        }
    } catch (err) {
        console.error('[PROTECTION] Error:', err);
    }

    // Fallback
    logSuspiciousRequest(ip, 'Blocked - no valid auth', req.headers);
    ipd.suspicious++;
    res.setHeader('Content-Type', 'text/plain');
    return res.send(getFakeCode(ip, id, 'auth_required'));
}

return res.status(405).json({ error: 'Method not allowed' });
}
// ===== HTML TEMPLATES =====
const WELCOME = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>APEX HUB — API</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter','SF Pro Display',-apple-system,BlinkMacSystemFont,sans-serif;background:#03050f;color:#fff;min-height:100vh;display:flex;justify-content:center;align-items:center;padding:20px;overflow-x:hidden;cursor:default;-webkit-font-smoothing:antialiased}body::before{content:'';position:fixed;top:-50%;left:-50%;width:200%;height:200%;background:radial-gradient(ellipse at 30% 20%,rgba(102,126,234,0.06) 0%,transparent 50%),radial-gradient(ellipse at 70% 80%,rgba(118,75,162,0.05) 0%,transparent 50%),radial-gradient(ellipse at 50% 50%,rgba(255,255,255,0.01) 0%,transparent 70%);animation:bgShift 20s ease-in-out infinite;pointer-events:none;z-index:0}@keyframes bgShift{0%,100%{transform:translate(0,0) scale(1)}33%{transform:translate(1%,-1%) scale(1.02)}66%{transform:translate(-1%,1%) scale(0.98)}}body::after{content:'';position:fixed;top:0;left:0;width:100%;height:100%;background-image:linear-gradient(rgba(255,255,255,0.015) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.015) 1px,transparent 1px);background-size:60px 60px;mask-image:radial-gradient(ellipse at center,black 30%,transparent 70%);pointer-events:none;z-index:0}.wrapper{position:relative;z-index:1;width:100%;max-width:520px;animation:contentEntry 1s cubic-bezier(0.22,1,0.36,1)}@keyframes contentEntry{from{opacity:0;transform:translateY(30px);filter:blur(8px)}to{opacity:1;transform:translateY(0);filter:blur(0)}}.card{background:rgba(12,14,28,0.8);backdrop-filter:blur(40px) saturate(180%);border-radius:28px;padding:48px 36px;border:1px solid rgba(255,255,255,0.06);box-shadow:0 0 0 1px rgba(255,255,255,0.03) inset,0 40px 80px rgba(0,0,0,0.5),0 0 160px rgba(102,126,234,0.04);position:relative;overflow:hidden;transition:border-color 0.5s ease,box-shadow 0.5s ease}.card:hover{border-color:rgba(255,255,255,0.1);box-shadow:0 0 0 1px rgba(255,255,255,0.04) inset,0 40px 80px rgba(0,0,0,0.5),0 0 200px rgba(102,126,234,0.08)}.card::before{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.08),rgba(255,255,255,0.18),rgba(255,255,255,0.08),transparent);animation:shimmerLine 4s ease-in-out infinite}@keyframes shimmerLine{0%,100%{opacity:0.3;transform:translateX(-5%)}50%{opacity:1;transform:translateX(5%)}}.card::after{content:'';position:absolute;top:-80px;right:-80px;width:160px;height:160px;background:radial-gradient(circle,rgba(102,126,234,0.06),transparent 70%);border-radius:50%;animation:accentPulse 6s ease-in-out infinite;pointer-events:none}@keyframes accentPulse{0%,100%{transform:scale(1);opacity:0.6}50%{transform:scale(1.3);opacity:1}}.brand-section{text-align:center;margin-bottom:36px}.brand-dot{display:inline-block;width:6px;height:6px;background:#667eea;border-radius:50%;margin-bottom:18px;animation:dotGlow 2.5s ease-in-out infinite;box-shadow:0 0 12px rgba(102,126,234,0.6),0 0 24px rgba(102,126,234,0.3)}@keyframes dotGlow{0%,100%{box-shadow:0 0 8px rgba(102,126,234,0.4),0 0 16px rgba(102,126,234,0.2);transform:scale(1)}50%{box-shadow:0 0 18px rgba(102,126,234,0.8),0 0 36px rgba(102,126,234,0.4);transform:scale(1.8)}}.brand-name{font-size:0.7rem;font-weight:500;letter-spacing:0.5em;text-transform:uppercase;color:rgba(255,255,255,0.25);margin-bottom:16px}.title-group{display:flex;flex-direction:column;align-items:center}.title-main{font-size:2rem;font-weight:800;letter-spacing:-0.03em;background:linear-gradient(135deg,rgba(255,255,255,0.9),rgba(255,255,255,0.6));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}.title-accent{font-size:2.8rem;font-weight:900;letter-spacing:-0.04em;background:linear-gradient(135deg,#667eea,#a78bfa 50%,#764ba2);background-size:200% 200%;-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;animation:gradientFlow 4s ease-in-out infinite}@keyframes gradientFlow{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}.separator{height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.05),rgba(255,255,255,0.1),rgba(255,255,255,0.05),transparent);margin:32px 0}.endpoints-container{background:rgba(255,255,255,0.015);border-radius:16px;padding:6px;border:1px solid rgba(255,255,255,0.04)}.endpoint-row{display:flex;align-items:center;padding:13px 16px;border-radius:12px;transition:all 0.3s ease}.endpoint-row:hover{background:rgba(255,255,255,0.03)}.method-badge{display:inline-flex;align-items:center;justify-content:center;min-width:52px;padding:5px 10px;border-radius:6px;font-size:0.7rem;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;flex-shrink:0}.badge-post{background:rgba(0,210,91,0.12);color:#00d25b;border:1px solid rgba(0,210,91,0.2)}.badge-put{background:rgba(255,165,2,0.12);color:#ffa502;border:1px solid rgba(255,165,2,0.2)}.badge-get{background:rgba(102,126,234,0.12);color:#667eea;border:1px solid rgba(102,126,234,0.2)}.badge-delete{background:rgba(255,71,87,0.12);color:#ff4757;border:1px solid rgba(255,71,87,0.2)}.endpoint-path{font-family:'SF Mono','Fira Code',monospace;font-size:0.82rem;color:rgba(255,255,255,0.65);margin-left:14px;letter-spacing:0.02em}.endpoint-desc{margin-left:auto;font-size:0.7rem;color:rgba(255,255,255,0.25);font-weight:400;letter-spacing:0.03em}.cta-link{display:flex;align-items:center;justify-content:center;gap:8px;margin-top:28px;padding:14px 24px;background:linear-gradient(135deg,rgba(102,126,234,0.08),rgba(118,75,162,0.08));border:1px solid rgba(102,126,234,0.15);border-radius:14px;color:rgba(255,255,255,0.75);text-decoration:none;font-size:0.82rem;font-weight:600;letter-spacing:0.03em;transition:all 0.4s cubic-bezier(0.22,1,0.36,1);position:relative;overflow:hidden}.cta-link::before{content:'';position:absolute;inset:0;background:linear-gradient(135deg,rgba(102,126,234,0.15),rgba(118,75,162,0.15));opacity:0;transition:opacity 0.4s ease}.cta-link:hover{border-color:rgba(102,126,234,0.4);color:#fff;transform:translateY(-1px);box-shadow:0 12px 32px rgba(102,126,234,0.12)}.cta-link:hover::before{opacity:1}.cta-link span{position:relative;z-index:1}.cta-arrow{position:relative;z-index:1;font-size:1rem;transition:transform 0.3s ease}.cta-link:hover .cta-arrow{transform:translateX(4px)}.footer-note{text-align:center;margin-top:28px;font-size:0.6rem;font-weight:400;letter-spacing:0.25em;text-transform:uppercase;color:rgba(255,255,255,0.1)}@media(max-width:480px){.card{padding:36px 22px;border-radius:22px}.title-main{font-size:1.5rem}.title-accent{font-size:2rem}.endpoint-row{flex-wrap:wrap;gap:4px;padding:11px 12px}.endpoint-path{font-size:0.72rem;margin-left:8px}.endpoint-desc{width:100%;margin-left:66px;margin-top:2px}}</style></head><body><div class="wrapper"><div class="card"><div class="brand-section"><div class="brand-dot"></div><div class="brand-name">APEX HUB</div><div class="title-group"><span class="title-main">Raw API</span><span class="title-accent">Service</span></div></div><div class="separator"></div><div class="endpoints-container"><div class="endpoint-row"><span class="method-badge badge-post">POST</span><span class="endpoint-path">/api/auth</span><span class="endpoint-desc">Get Token</span></div><div class="endpoint-row"><span class="method-badge badge-post">POST</span><span class="endpoint-path">/api/raw</span><span class="endpoint-desc">Create</span></div><div class="endpoint-row"><span class="method-badge badge-put">PUT</span><span class="endpoint-path">/api/raw</span><span class="endpoint-desc">Update</span></div><div class="endpoint-row"><span class="method-badge badge-get">GET</span><span class="endpoint-path">/api/raw?id=</span><span class="endpoint-desc">Retrieve</span></div><div class="endpoint-row"><span class="method-badge badge-delete">DEL</span><span class="endpoint-path">/api/raw?id=</span><span class="endpoint-desc">Delete</span></div></div><a href="https://code-editor-apex-ccmf.vercel.app/" class="cta-link"><span>Open Editor</span><span class="cta-arrow">→</span></a></div><div class="footer-note">AES-256 • HMAC • Token Auth • HWID Whitelist</div></div></body></html>`;

const PROTECT = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>APEX HUB — Protected</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter','SF Pro Display',-apple-system,BlinkMacSystemFont,sans-serif;background:#03050f;color:#fff;min-height:100vh;display:flex;justify-content:center;align-items:center;padding:20px;overflow:hidden;cursor:default;-webkit-font-smoothing:antialiased}canvas#bgCanvas{position:fixed;top:0;left:0;width:100%;height:100%;z-index:0;pointer-events:none}body::after{content:'';position:fixed;top:-50%;left:-50%;width:200%;height:200%;background:radial-gradient(ellipse at 50% 40%,rgba(102,126,234,0.04) 0%,transparent 60%),radial-gradient(ellipse at 30% 70%,rgba(118,75,162,0.03) 0%,transparent 60%);animation:ambientShift 15s ease-in-out infinite;pointer-events:none;z-index:0}@keyframes ambientShift{0%,100%{transform:translate(0,0)}33%{transform:translate(2%,-1%)}66%{transform:translate(-1%,2%)}}.wrapper{position:relative;z-index:1;width:100%;max-width:480px;animation:pageEnter 1.4s cubic-bezier(0.22,1,0.36,1)}@keyframes pageEnter{from{opacity:0;transform:translateY(50px);filter:blur(12px)}to{opacity:1;transform:translateY(0);filter:blur(0)}}.card{background:rgba(12,14,28,0.75);backdrop-filter:blur(50px) saturate(180%);border-radius:28px;padding:50px 38px;border:1px solid rgba(255,255,255,0.05);box-shadow:0 0 0 1px rgba(255,255,255,0.02) inset,0 40px 80px rgba(0,0,0,0.6),0 0 200px rgba(102,126,234,0.03);position:relative;overflow:hidden;transition:all 0.5s cubic-bezier(0.22,1,0.36,1)}.card:hover{border-color:rgba(255,255,255,0.08);box-shadow:0 0 0 1px rgba(255,255,255,0.03) inset,0 40px 80px rgba(0,0,0,0.6),0 0 240px rgba(102,126,234,0.06)}.card::before{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.06),rgba(255,255,255,0.15),rgba(255,255,255,0.06),transparent);animation:borderShimmer 5s ease-in-out infinite}@keyframes borderShimmer{0%,100%{opacity:0.2}50%{opacity:1}}.card::after{content:'';position:absolute;top:-100px;right:-100px;width:200px;height:200px;background:radial-gradient(circle,rgba(102,126,234,0.05),transparent 70%);border-radius:50%;animation:orbitPulse 8s ease-in-out infinite;pointer-events:none}@keyframes orbitPulse{0%,100%{transform:scale(0.8);opacity:0.4}50%{transform:scale(1.4);opacity:0.9}}.content{position:relative;z-index:1}.brand-area{text-align:center;margin-bottom:40px}.indicator{display:inline-flex;align-items:center;gap:8px;margin-bottom:22px}.indicator-dot{width:5px;height:5px;background:#ff4757;border-radius:50%;animation:indicatorPulse 2s ease-in-out infinite}@keyframes indicatorPulse{0%,100%{box-shadow:0 0 0 0 rgba(255,71,87,0.7)}50%{box-shadow:0 0 0 14px rgba(255,71,87,0)}}.indicator-label{font-size:0.6rem;font-weight:600;letter-spacing:0.4em;text-transform:uppercase;color:rgba(255,71,87,0.6)}.brand-text{font-size:0.7rem;font-weight:500;letter-spacing:0.55em;text-transform:uppercase;color:rgba(255,255,255,0.2);margin-bottom:18px}.title-stack{display:flex;flex-direction:column;align-items:center}.title-word{font-size:2.4rem;font-weight:900;letter-spacing:-0.04em;line-height:1}.title-one{color:rgba(255,255,255,0.85);animation:wordReveal 0.9s cubic-bezier(0.22,1,0.36,1) 0.2s both}.title-two{background:linear-gradient(135deg,#667eea,#a78bfa 40%,#764ba2 80%);background-size:200% 200%;-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;font-size:3.2rem;animation:wordReveal 0.9s cubic-bezier(0.22,1,0.36,1) 0.4s both,gradientShift 5s ease-in-out infinite}@keyframes wordReveal{from{opacity:0;transform:translateY(25px);filter:blur(4px)}to{opacity:1;transform:translateY(0);filter:blur(0)}}@keyframes gradientShift{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}.divider-line{height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.06),rgba(255,255,255,0.12),rgba(255,255,255,0.06),transparent);margin:34px 0;animation:dividerFade 5s ease-in-out infinite}@keyframes dividerFade{0%,100%{opacity:0.4}50%{opacity:1}}.url-display{background:rgba(255,255,255,0.015);border-radius:16px;padding:24px;border:1px solid rgba(255,255,255,0.04);margin-bottom:24px}.url-label{font-size:0.6rem;font-weight:600;letter-spacing:0.35em;text-transform:uppercase;color:rgba(255,255,255,0.2);margin-bottom:12px}.url-value{font-family:'SF Mono','Fira Code',monospace;font-size:0.78rem;color:rgba(255,255,255,0.45);word-break:break-all;line-height:1.7;padding:14px 16px;background:rgba(0,0,0,0.35);border-radius:12px;border:1px solid rgba(255,255,255,0.03);transition:all 0.4s ease;letter-spacing:0.02em}.url-value:hover{color:rgba(255,255,255,0.75);border-color:rgba(102,126,234,0.2);background:rgba(0,0,0,0.5)}.action-button{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:15px 24px;background:linear-gradient(135deg,rgba(102,126,234,0.08),rgba(118,75,162,0.08));border:1px solid rgba(102,126,234,0.15);border-radius:14px;color:rgba(255,255,255,0.7);text-decoration:none;font-size:0.82rem;font-weight:600;letter-spacing:0.04em;transition:all 0.5s cubic-bezier(0.22,1,0.36,1);position:relative;overflow:hidden}.action-button::before{content:'';position:absolute;inset:0;background:linear-gradient(135deg,rgba(102,126,234,0.2),rgba(118,75,162,0.2));opacity:0;transition:opacity 0.5s ease}.action-button:hover{border-color:rgba(102,126,234,0.45);color:#fff;transform:translateY(-2px);box-shadow:0 14px 40px rgba(102,126,234,0.15)}.action-button:hover::before{opacity:1}.action-button span{position:relative;z-index:1}.btn-icon{position:relative;z-index:1;font-size:1.1rem;transition:transform 0.4s ease}.action-button:hover .btn-icon{transform:translateX(5px)}.status-bar{display:flex;align-items:center;justify-content:center;gap:10px;margin-top:28px}.status-indicator{width:4px;height:4px;background:#ff4757;border-radius:50%;animation:statusBlink 2.5s ease-in-out infinite}@keyframes statusBlink{0%,100%{box-shadow:0 0 0 0 rgba(255,71,87,0.5);opacity:0.6}50%{box-shadow:0 0 0 10px rgba(255,71,87,0);opacity:1}}.status-message{font-size:0.65rem;font-weight:500;letter-spacing:0.3em;text-transform:uppercase;color:rgba(255,255,255,0.25)}.bottom-text{text-align:center;margin-top:32px;font-size:0.58rem;font-weight:400;letter-spacing:0.3em;text-transform:uppercase;color:rgba(255,255,255,0.08)}@media(max-width:480px){.card{padding:38px 24px;border-radius:22px}.title-word{font-size:1.8rem}.title-two{font-size:2.4rem}.brand-text{font-size:0.6rem;letter-spacing:0.35em}.url-value{font-size:0.7rem;padding:12px}}</style></head><body><canvas id="bgCanvas"></canvas><div class="wrapper"><div class="card"><div class="content"><div class="brand-area"><div class="indicator"><div class="indicator-dot"></div><span class="indicator-label">Protected</span></div><div class="brand-text">APEX HUB</div><div class="title-stack"><span class="title-word title-one">ACTIVATE</span><span class="title-word title-two">PROTECTION</span></div></div><div class="divider-line"></div><div class="url-display"><div class="url-label">Editor Access</div><div class="url-value">https://code-editor-apex-ccmf.vercel.app/</div></div><a href="https://code-editor-apex-ccmf.vercel.app/" class="action-button"><span>Open Editor</span><span class="btn-icon">→</span></a><div class="status-bar"><div class="status-indicator"></div><span class="status-message">Script Locked</span></div></div></div><div class="bottom-text">APEX HUB PROTECTION SYSTEM</div></div><script>(function(){const c=document.getElementById('bgCanvas');const x=c.getContext('2d');let w,h,p=[];const n=60,d=120,r=180;let m={x:-1000,y:-1000};function R(){w=c.width=window.innerWidth;h=c.height=window.innerHeight}R();window.addEventListener('resize',R);document.addEventListener('mousemove',e=>{m.x=e.clientX;m.y=e.clientY});document.addEventListener('mouseleave',()=>{m.x=-1000;m.y=-1000});class P{constructor(){this.reset()}reset(){this.x=Math.random()*w;this.y=Math.random()*h;this.vx=(Math.random()-0.5)*0.5;this.vy=(Math.random()-0.5)*0.5;this.rad=Math.random()*1.5+0.5;this.bo=Math.random()*0.5+0.2;this.o=this.bo}update(){this.x+=this.vx;this.y+=this.vy;if(this.x<-20)this.x=w+20;if(this.x>w+20)this.x=-20;if(this.y<-20)this.y=h+20;if(this.y>h+20)this.y=-20;const dx=m.x-this.x,dy=m.y-this.y;const dist=Math.sqrt(dx*dx+dy*dy);if(dist<r){const f=(r-dist)/r,an=Math.atan2(dy,dx);this.vx-=Math.cos(an)*f*0.03;this.vy-=Math.sin(an)*f*0.03;this.o=Math.min(1,this.bo+f*0.8)}else this.o+=(this.bo-this.o)*0.05;const sp=Math.sqrt(this.vx*this.vx+this.vy*this.vy);if(sp>1){this.vx=(this.vx/sp)*1;this.vy=(this.vy/sp)*1}}draw(){x.beginPath();x.arc(this.x,this.y,this.rad,0,Math.PI*2);x.fillStyle='rgba(180,190,230,'+this.o+')';x.fill()}}for(let i=0;i<n;i++)p.push(new P());function conn(){for(let i=0;i<p.length;i++){for(let j=i+1;j<p.length;j++){const dx=p[i].x-p[j].x,dy=p[i].y-p[j].y;const dist=Math.sqrt(dx*dx+dy*dy);if(dist<d){const op=(1-dist/d)*0.15;x.beginPath();x.moveTo(p[i].x,p[i].y);x.lineTo(p[j].x,p[j].y);x.strokeStyle='rgba(140,150,200,'+op+')';x.lineWidth=0.5;x.stroke()}}}}function anim(){x.clearRect(0,0,w,h);for(let pt of p)pt.update();conn();for(let pt of p)pt.draw();if(m.x>0&&m.y>0){const g=x.createRadialGradient(m.x,m.y,0,m.x,m.y,r);g.addColorStop(0,'rgba(102,126,234,0.06)');g.addColorStop(0.5,'rgba(102,126,234,0.02)');g.addColorStop(1,'rgba(102,126,234,0)');x.beginPath();x.arc(m.x,m.y,r,0,Math.PI*2);x.fillStyle=g;x.fill()}requestAnimationFrame(anim)}anim()})();</script></body></html>`;

const ERROR = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>APEX HUB — Not Found</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter','SF Pro Display',-apple-system,BlinkMacSystemFont,sans-serif;background:#03050f;color:#fff;min-height:100vh;display:flex;justify-content:center;align-items:center;padding:20px;overflow:hidden;cursor:default;-webkit-font-smoothing:antialiased}body::before{content:'';position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:800px;height:800px;background:radial-gradient(circle,rgba(255,71,87,0.04) 0%,transparent 70%);animation:errorGlow 4s ease-in-out infinite;pointer-events:none;z-index:0}@keyframes errorGlow{0%,100%{transform:translate(-50%,-50%) scale(0.9);opacity:0.5}50%{transform:translate(-50%,-50%) scale(1.2);opacity:1}}.wrapper{position:relative;z-index:1;width:100%;max-width:420px;animation:fadeUp 0.8s cubic-bezier(0.22,1,0.36,1)}@keyframes fadeUp{from{opacity:0;transform:translateY(40px);filter:blur(6px)}to{opacity:1;transform:translateY(0);filter:blur(0)}}.card{background:rgba(12,14,28,0.7);backdrop-filter:blur(40px) saturate(180%);border-radius:24px;padding:48px 32px;text-align:center;border:1px solid rgba(255,71,87,0.08);box-shadow:0 0 0 1px rgba(255,255,255,0.02) inset,0 30px 60px rgba(0,0,0,0.5);position:relative;overflow:hidden}.card::before{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,rgba(255,71,87,0.15),transparent);animation:errorShimmer 3s ease-in-out infinite}@keyframes errorShimmer{0%,100%{opacity:0.2}50%{opacity:0.8}}.error-code{font-size:5rem;font-weight:900;letter-spacing:-0.06em;background:linear-gradient(135deg,#ff4757,#ff6b81,#ff4757);background-size:200% 200%;-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;animation:errorGradient 3s ease-in-out infinite;line-height:1;margin-bottom:16px}@keyframes errorGradient{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}.error-title{font-size:1.2rem;font-weight:700;color:#ff6b81;margin-bottom:14px;letter-spacing:-0.02em}.error-desc{font-size:0.82rem;color:rgba(255,255,255,0.4);line-height:1.7;margin-bottom:28px;font-weight:400;letter-spacing:0.02em}.back-link{display:inline-flex;align-items:center;gap:8px;padding:12px 22px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:12px;color:rgba(255,255,255,0.5);text-decoration:none;font-size:0.78rem;font-weight:500;letter-spacing:0.04em;transition:all 0.4s cubic-bezier(0.22,1,0.36,1)}.back-link:hover{color:#fff;border-color:rgba(255,255,255,0.2);background:rgba(255,255,255,0.06);transform:translateY(-1px);box-shadow:0 10px 30px rgba(0,0,0,0.3)}.back-arrow{transition:transform 0.3s ease}.back-link:hover .back-arrow{transform:translateX(-4px)}</style></head><body><div class="wrapper"><div class="card"><div class="error-code">404</div><h1 class="error-title">Script Not Found</h1><p class="error-desc">The requested script does not exist or may have been removed. All scripts are stored permanently in Firestore and persist across deployments.</p><a href="https://code-editor-apex-ccmf.vercel.app/" class="back-link"><span class="back-arrow">←</span><span>Back to Editor</span></a></div></div></body></html>`;

export { 
    generateToken, 
    verifyToken, 
    isHWIDWhitelisted, 
    addHWIDToWhitelist,
    encryptCode,
    encryptChunk,
    splitAndEncryptScript,
    encryptForStorage,
    decryptFromStorage,
    isDiscordBot,
    isDeobfuscator,
    isBot
};  





























