// api/raw.js - APEX HUB V10 - Secure Script Delivery Gateway
// NO RAW BYPASS - Authentication required for all script access

import Crypto from '../lib/crypto.js';
import Security from '../lib/security.js';
import FirebaseManager from '../lib/firebase.js';
import { RateLimiter } from '../lib/rate-limit.js';
import { SessionManager } from '../lib/sessions.js';
import { ChallengeManager } from '../lib/challenges.js';
import { ScriptManager } from '../lib/scripts.js';
import { ErrorCodes, createErrorResponse, createResponse } from '../lib/errors.js';

// Initialize Firebase on startup
FirebaseManager.init();

export default async function handler(req, res) {
    // Security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    
    // CORS
    const allowedOrigin = process.env.ALLOWED_ORIGIN || 'https://apexhubeditor.vercel.app';
    res.setHeader('Access-Control-Allow-Origin', req.method === 'GET' ? allowedOrigin : '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Auth-Key');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    const requestId = Crypto.randomString(12);
    const clientIP = Security.getClientIP(req);
    const ipHash = Crypto.hashIP(clientIP);
    const userAgent = (req.headers['user-agent'] || '').toLowerCase();
    
    try {
        // Route based on method
        switch (req.method) {
            case 'GET':
                return await handleGet(req, res, { requestId, clientIP, ipHash, userAgent });
            case 'POST':
                return await handleCreate(req, res, { requestId, clientIP, ipHash });
            case 'PUT':
                return await handleUpdate(req, res, { requestId, clientIP, ipHash });
            case 'DELETE':
                return await handleDelete(req, res, { requestId, clientIP, ipHash });
            default:
                return res.status(405).json(createErrorResponse('METHOD_NOT_ALLOWED', 405, null, requestId));
        }
    } catch (error) {
        console.error(`[RAW] Unhandled error for ${req.method}:`, error.message);
        return res.status(500).json(createErrorResponse(ErrorCodes.INTERNAL_ERROR, 500, null, requestId));
    }
}

/**
 * GET /api/raw - Script retrieval
 * AUTHENTICATION REQUIRED - No raw bypass
 */
async function handleGet(req, res, ctx) {
    const { requestId, clientIP, ipHash, userAgent } = ctx;
    const { name, key, session, challenge, answer } = req.query;
    
    // Rate limit check
    const rateAllowed = await RateLimiter.checkLimit('ip', clientIP, 'default');
    if (!rateAllowed) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(429).send(getRateLimitHTML());
    }
    
    // No name provided - show welcome/status page
    if (!name) {
        // Check if request looks like a bot/scraper
        if (Security.isSuspiciousUA(userAgent)) {
            return res.status(403).json(createErrorResponse(ErrorCodes.ACCESS_BLOCKED, 403, null, requestId));
        }
        
        // Browser gets HTML, API clients get JSON
        if (isBrowserRequest(req)) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.send(getWelcomeHTML());
        }
        
        return res.status(200).json({
            success: true,
            requestId,
            message: 'APEX HUB API Gateway',
            version: '10.0.0',
            status: 'operational'
        });
    }
    
    // REMOVED: raw=true bypass - NO LONGER SUPPORTED
    // All script access requires authentication
    
    // Check for session-based authentication
    if (session) {
        const sessionResult = await SessionManager.validateSession(session);
        
        if (sessionResult.valid) {
            // Rate limit per session
            const sessionAllowed = await RateLimiter.checkLimit('session', sessionResult.session.tokenHash, 'get-script');
            if (!sessionAllowed) {
                return res.status(429).json(createErrorResponse(ErrorCodes.RATE_LIMIT_SESSION, 429, null, requestId));
            }
            
            const script = await ScriptManager.getScript(name);
            if (!script) {
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                return res.status(404).send(getNotFoundHTML(name));
            }
            
            console.log(`[RAW:GET] Script delivered to authenticated session: ${name}`);
            
            return res.status(200).json({
                success: true,
                requestId,
                code: script.code,
                scriptInfo: {
                    name: name,
                    target: script.target || 'lua',
                    size: script.size || 0
                }
            });
        }
    }
    
    // Check for challenge-based authentication
    if (challenge && answer) {
        const challengeResult = await ChallengeManager.verifyChallenge(challenge, answer);
        
        if (challengeResult.valid) {
            const script = await ScriptManager.getScript(name);
            if (!script) {
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                return res.status(404).send(getNotFoundHTML(name));
            }
            
            console.log(`[RAW:GET] Script delivered via challenge: ${name}`);
            
            return res.status(200).json({
                success: true,
                requestId,
                code: script.code,
                scriptInfo: {
                    name: name,
                    target: script.target || 'lua',
                    size: script.size || 0
                }
            });
        }
    }
    
    // Check for admin authentication via header
    const adminKey = req.headers['x-auth-key'] || req.headers['authorization']?.replace('Bearer ', '');
    if (adminKey && adminKey === process.env.ADMIN_API_SECRET) {
        const script = await ScriptManager.getScript(name);
        if (!script) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.status(404).send(getNotFoundHTML(name));
        }
        
        console.log(`[RAW:GET] Admin access to script: ${name}`);
        
        return res.status(200).json({
            success: true,
            requestId,
            code: script.code,
            adminAccess: true
        });
    }
    
    // NOT AUTHENTICATED
    // Return appropriate response based on client type
    if (isBrowserRequest(req)) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(403).send(getProtectionHTML(name));
    }
    
    // Generate challenge for API clients
    const newChallenge = await ChallengeManager.createChallenge(ipHash);
    
    return res.status(403).json({
        success: false,
        requestId,
        protected: true,
        error: ErrorCodes.AUTH_REQUIRED,
        message: 'Authentication required to access scripts',
        challenge: {
            question: newChallenge.question,
            token: newChallenge.token,
            type: newChallenge.type,
            expiresIn: 60
        },
        authMethods: ['session', 'challenge']
    });
}

/**
 * POST /api/raw - Create new script
 */
async function handleCreate(req, res, ctx) {
    const { requestId, clientIP, ipHash } = ctx;
    
    // Rate limit
    const allowed = await RateLimiter.checkLimit('ip', clientIP, 'default');
    if (!allowed) {
        return res.status(429).json(createErrorResponse(ErrorCodes.RATE_LIMIT_IP, 429, null, requestId));
    }
    
    const body = req.body || {};
    const { code, name, uid } = body;
    
    if (!code || !code.trim()) {
        return res.status(400).json(createErrorResponse(ErrorCodes.MISSING_FIELDS, 400, null, requestId));
    }
    
    if (!name || !name.trim()) {
        return res.status(400).json(createErrorResponse(ErrorCodes.MISSING_FIELDS, 400, null, requestId));
    }
    
    const sanitizedName = Security.sanitizeName(name);
    const userId = uid || 'public';
    const fullName = `${userId}_${sanitizedName}`;
    
    // Apply obfuscation (Phantom Obfuscator - simplified safe version)
    const obfuscatedCode = safeObfuscate(code);
    
    const result = await ScriptManager.storeScript(fullName, obfuscatedCode, {
        displayName: name.trim(),
        owner: userId,
        target: detectTarget(code),
        obfuscated: true
    });
    
    if (!result.success) {
        return res.status(500).json(createErrorResponse(ErrorCodes.INTERNAL_ERROR, 500, null, requestId));
    }
    
    const scriptUrl = `https://${req.headers.host}/api/raw?name=${fullName}`;
    
    return res.status(200).json({
        success: true,
        requestId,
        name: fullName,
        url: scriptUrl
    });
}

/**
 * PUT /api/raw - Update existing script
 */
async function handleUpdate(req, res, ctx) {
    const { requestId, clientIP } = ctx;
    
    const allowed = await RateLimiter.checkLimit('ip', clientIP, 'default');
    if (!allowed) {
        return res.status(429).json(createErrorResponse(ErrorCodes.RATE_LIMIT_IP, 429, null, requestId));
    }
    
    const body = req.body || {};
    const { name, code, uid } = body;
    
    if (!name || !code) {
        return res.status(400).json(createErrorResponse(ErrorCodes.MISSING_FIELDS, 400, null, requestId));
    }
    
    const existing = await ScriptManager.getScript(name);
    if (!existing) {
        return res.status(404).json(createErrorResponse(ErrorCodes.SCRIPT_NOT_FOUND, 404, null, requestId));
    }
    
    if (uid && existing.owner && existing.owner !== 'public' && existing.owner !== uid) {
        return res.status(403).json(createErrorResponse(ErrorCodes.REQUEST_DENIED, 403, null, requestId));
    }
    
    const obfuscatedCode = safeObfuscate(code);
    const result = await ScriptManager.storeScript(name, obfuscatedCode, {
        ...existing,
        owner: uid || existing.owner
    });
    
    return res.status(200).json({
        success: true,
        requestId,
        name: name,
        updated: true
    });
}

/**
 * DELETE /api/raw - Delete script
 */
async function handleDelete(req, res, ctx) {
    const { requestId, clientIP } = ctx;
    
    const allowed = await RateLimiter.checkLimit('ip', clientIP, 'default');
    if (!allowed) {
        return res.status(429).json(createErrorResponse(ErrorCodes.RATE_LIMIT_IP, 429, null, requestId));
    }
    
    const { name, uid } = req.query;
    
    if (!name) {
        return res.status(400).json(createErrorResponse(ErrorCodes.MISSING_FIELDS, 400, null, requestId));
    }
    
    const existing = await ScriptManager.getScript(name);
    if (!existing) {
        return res.status(404).json(createErrorResponse(ErrorCodes.SCRIPT_NOT_FOUND, 404, null, requestId));
    }
    
    if (uid && existing.owner && existing.owner !== 'public' && existing.owner !== uid) {
        return res.status(403).json(createErrorResponse(ErrorCodes.REQUEST_DENIED, 403, null, requestId));
    }
    
    await ScriptManager.deleteScript(name);
    
    return res.status(200).json({
        success: true,
        requestId,
        name: name,
        deleted: true
    });
}

// ============================================================
// SAFE OBFUSCATOR (Simplified - doesn't break Lua syntax)
// ============================================================

function safeObfuscate(code) {
    // Only apply safe obfuscation that won't break syntax
    // This is a simplified version that adds comment noise and minor transformations
    
    const lines = code.split('\n');
    const result = [];
    const headerComments = [
        '-- Protected by APEX HUB V10',
        '-- Authentication required for access',
        '',
    ];
    
    result.push(...headerComments);
    
    for (const line of lines) {
        result.push(line);
        
        // Add random noise comments (safe)
        if (line.trim() && Math.random() < 0.1 && !line.trim().startsWith('--')) {
            const noiseChars = 'abcdefghijklmnopqrstuvwxyz0123456789';
            let noise = '';
            for (let i = 0; i < 8; i++) {
                noise += noiseChars.charAt(Math.floor(Math.random() * noiseChars.length));
            }
            result.push(`--[[${noise}]]`);
        }
    }
    
    return result.join('\n');
}

function detectTarget(code) {
    if (code.match(/\bgame\s*:\s*GetService\s*\(/) ||
        code.match(/\bInstance\.new\s*\(/) ||
        code.match(/\btask\.(spawn|wait|defer)\s*\(/) ||
        code.match(/\bworkspace\b/)) {
        return 'luau';
    }
    return 'lua';
}

function isBrowserRequest(req) {
    const ua = (req.headers['user-agent'] || '').toLowerCase();
    const accept = (req.headers['accept'] || '').toLowerCase();
    
    return (ua.includes('mozilla') || ua.includes('chrome') || 
            ua.includes('safari') || ua.includes('firefox')) &&
           (accept.includes('text/html') || !accept);
}

// ============================================================
// HTML PAGES
// ============================================================

function getWelcomeHTML() {
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>APEX HUB | API Gateway</title><style>:root{--bg:#0a0a0d;--card:rgba(20,20,25,0.8);--border:rgba(255,255,255,0.06);--t1:#e8e8ed;--t2:#8e8e98;--t3:#555560}*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;background:var(--bg);color:var(--t1);min-height:100vh;display:flex;justify-content:center;align-items:center}.card{background:var(--card);backdrop-filter:blur(40px);border-radius:16px;padding:48px;border:1px solid var(--border);max-width:520px;width:90%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.5)}.logo{font-size:28px;font-weight:600;letter-spacing:-0.02em;margin-bottom:4px}.ver{font-size:11px;text-transform:uppercase;letter-spacing:0.15em;color:var(--t3);margin-bottom:32px}.sep{height:1px;background:var(--border);margin:24px 0}.desc{font-size:14px;color:var(--t2);margin-bottom:28px}.status{display:inline-block;padding:6px 16px;border:1px solid rgba(255,255,255,0.1);border-radius:20px;font-size:12px;color:var(--t2)}.footer{margin-top:32px;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:var(--t3)}</style></head><body><div class="card"><div class="logo">APEX HUB</div><div class="ver">Gateway V10</div><div class="sep"></div><p class="desc">Secure script delivery infrastructure for authorized clients.</p><div class="status">Operational</div><div class="footer">APEX HUB · Security Infrastructure</div></div></body></html>`;
}

function getProtectionHTML(scriptName = '') {
    const safeName = scriptName.replace(/[<>"'&]/g, '');
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Restricted | APEX HUB</title><style>:root{--bg:#0a0a0d;--card:rgba(20,20,25,0.8);--border:rgba(255,255,255,0.06);--t1:#e8e8ed;--t2:#8e8e98;--t3:#555560;--red:rgba(255,80,80,0.8)}*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;background:var(--bg);color:var(--t1);min-height:100vh;display:flex;justify-content:center;align-items:center}.card{background:var(--card);backdrop-filter:blur(40px);border-radius:16px;padding:48px;border:1px solid var(--border);max-width:500px;width:90%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.5)}.icon{width:56px;height:56px;border:1px solid var(--red);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 24px;color:var(--red);font-size:24px}.title{font-size:16px;font-weight:500;margin-bottom:10px}.msg{font-size:14px;color:var(--t2);margin-bottom:8px;line-height:1.6}.ref{display:inline-block;margin-top:16px;padding:8px 16px;background:rgba(255,255,255,0.02);border:1px solid var(--border);border-radius:8px;font-family:monospace;font-size:12px;color:var(--t3)}.sep{height:1px;background:var(--border);margin:20px 0}.info{font-size:11px;color:var(--t3);text-transform:uppercase;letter-spacing:0.06em}.footer{margin-top:24px;font-size:10px;color:var(--t3)}</style></head><body><div class="card"><div class="icon">!</div><div class="title">Authentication Required</div><p class="msg">This endpoint requires valid authentication. Direct browser access is not permitted for script retrieval.</p>${safeName ? `<div class="sep"></div><div class="ref">${safeName}</div>` : ''}<div class="sep"></div><div class="info">Use authorized client to access this resource</div><div class="footer">APEX HUB · V10 · Security Infrastructure</div></div></body></html>`;
}

function getNotFoundHTML(name = '') {
    const safeName = name.replace(/[<>"'&]/g, '');
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>404 | APEX HUB</title><style>:root{--bg:#0a0a0d;--card:rgba(20,20,25,0.8);--border:rgba(255,255,255,0.06);--t1:#e8e8ed;--t2:#8e8e98}*{margin:0;padding:0}body{font-family:system-ui,sans-serif;background:var(--bg);color:var(--t1);min-height:100vh;display:flex;justify-content:center;align-items:center}.card{background:var(--card);border-radius:16px;padding:48px;border:1px solid var(--border);text-align:center;max-width:460px;width:90%}.code{font-size:4rem;font-family:monospace;color:var(--t2);margin-bottom:8px}.title{font-size:15px;margin-bottom:10px}.ref{display:inline-block;margin-top:12px;padding:8px 16px;background:rgba(255,255,255,0.02);border:1px solid var(--border);border-radius:8px;font-family:monospace;font-size:12px;color:var(--t2)}</style></head><body><div class="card"><div class="code">404</div><div class="title">Script not found</div>${safeName ? `<div class="ref">${safeName}</div>` : ''}</div></body></html>`;
}

function getRateLimitHTML() {
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Rate Limited | APEX HUB</title><style>:root{--bg:#0a0a0d;--card:rgba(20,20,25,0.8);--border:rgba(255,255,255,0.06);--t1:#e8e8ed;--t2:#8e8e98;--t3:#555560}*{margin:0;padding:0}body{font-family:system-ui,sans-serif;background:var(--bg);color:var(--t1);min-height:100vh;display:flex;justify-content:center;align-items:center}.card{background:var(--card);border-radius:16px;padding:48px;border:1px solid var(--border);text-align:center;max-width:460px;width:90%}.title{font-size:16px;margin-bottom:10px}.msg{font-size:14px;color:var(--t2);margin-bottom:16px}.bar{width:100%;height:2px;background:rgba(255,255,255,0.05);border-radius:2px;overflow:hidden}.fill{width:100%;height:100%;background:rgba(255,255,255,0.1);animation:fill 60s linear}@keyframes fill{from{transform:scaleX(0)}to{transform:scaleX(1)}}.footer{margin-top:20px;font-size:10px;color:var(--t3);text-transform:uppercase}</style></head><body><div class="card"><div class="title">Too Many Requests</div><p class="msg">Please wait before making another request.</p><div class="bar"><div class="fill"></div></div><div class="footer">APEX HUB · Rate Limit Active</div></div></body></html>`;
}
