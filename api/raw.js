// api/raw.js - APEX HUB V9 (Security Refactored)
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getApps, cert, initializeApp } from 'firebase-admin/app';
import crypto from 'crypto';
import guard from './guard.js';

if (!getApps().length) {
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && privateKey) {
        initializeApp({
            credential: cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: privateKey
            })
        });
    }
}

const db = getFirestore();

const COLLECTIONS = {
    SCRIPTS: 'scripts',
    SESSIONS: 'security_sessions',
    CHALLENGES: 'security_challenges',
    RATE_LIMITS: 'security_rate_limits',
    BANS: 'security_bans'
};

// In-memory cache for scripts (short-lived optimization)
const scriptCache = new Map();
const CACHE_TTL = 300000; // 5 minutes

// Valid auth keys from environment
const VALID_KEYS = (process.env.VALID_AUTH_KEYS || '').split(',').filter(Boolean);

/**
 * Obfuscation helpers
 */
function phantomObfuscate(code) {
    code = injectAntiDebug(code);
    return code;
}

function injectAntiDebug(code) {
    const traps = [
        `if debug and debug.getinfo and debug.getinfo(1) and debug.getinfo(1).short_src:match("hook") then return end`,
        `if rawget and rawget(_G, "hooked") then return end`
    ];
    const trap = traps[crypto.randomInt(0, traps.length)];
    return `-- Protected by APEX HUB\n${trap}\n${code}`;
}

function normalizeName(name) {
    return name.trim().toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') || 'script';
}

/**
 * Get script from Firestore with caching
 */
async function getScript(name) {
    const cached = scriptCache.get(name);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        return cached.data;
    }
    
    try {
        const doc = await db.collection(COLLECTIONS.SCRIPTS).doc(name).get();
        if (!doc.exists) return null;
        
        const data = doc.data();
        scriptCache.set(name, { data, timestamp: Date.now() });
        return data;
    } catch (error) {
        console.error('[RAW] Script fetch error:', error.message);
        return null;
    }
}

/**
 * Save script to Firestore
 */
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

/**
 * Handle GET - Script retrieval
 */
async function handleGet(req, res) {
    const { name } = req.query;
    
    if (!name) {
        return res.status(400).json({ error: 'SCRIPT_NAME_REQUIRED' });
    }
    
    // Apply guard with session requirement
    const guardResult = await guard(req, res, {
        requireSession: true,
        rateLimit: true,
        rateLimitMax: 20,
        rateLimitWindow: 60000,
        botDetection: true,
        endpoint: 'raw_get'
    });
    
    if (guardResult.blocked) {
        return res.status(guardResult.status).json(guardResult.body);
    }
    
    try {
        const scriptData = await getScript(name);
        
        if (!scriptData) {
            return res.status(404).json({ error: 'SCRIPT_NOT_FOUND' });
        }
        
        // Check if client is an executor (allow loader format)
        const ua = (req.headers['user-agent'] || '').toLowerCase();
        const executorPatterns = [
            'roblox', 'synapse', 'krnl', 'script-ware', 'sentinel',
            'fluxus', 'electron', 'comet', 'oxygen', 'valyse'
        ];
        const isExecutor = executorPatterns.some(p => ua.includes(p));
        
        if (isExecutor) {
            // Return obfuscated loader for executors
            const loader = generateLoader(scriptData.code);
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            return res.send(loader);
        }
        
        // Standard response
        return res.json({
            success: true,
            code: scriptData.code,
            obfuscated: scriptData.obfuscated || false
        });
        
    } catch (error) {
        console.error('[RAW] GET error:', error.message);
        return res.status(500).json({ error: 'SCRIPT_RETRIEVAL_FAILED' });
    }
}

/**
 * Handle POST - Script creation
 */
async function handleCreate(req, res) {
    const { code, name, uid } = req.body;
    
    if (!code || !code.trim()) {
        return res.status(400).json({ error: 'CODE_REQUIRED' });
    }
    if (!name || !name.trim()) {
        return res.status(400).json({ error: 'NAME_REQUIRED' });
    }
    
    // Apply guard
    const guardResult = await guard(req, res, {
        rateLimit: true,
        rateLimitMax: 30,
        rateLimitWindow: 60000,
        endpoint: 'raw_create'
    });
    
    if (guardResult.blocked) {
        return res.status(guardResult.status).json(guardResult.body);
    }
    
    try {
        const nameSlug = normalizeName(name);
        const userId = uid || 'public';
        const fullName = `${userId}_${nameSlug}`;
        
        const obfuscatedCode = phantomObfuscate(code);
        
        await saveScript(fullName, {
            code: obfuscatedCode,
            originalCode: code,
            name: name.trim(),
            created: Date.now(),
            owner: userId,
            obfuscated: true
        });
        
        const rawUrl = `https://${req.headers.host}/api/raw?name=${fullName}`;
        
        return res.status(200).json({
            success: true,
            raw: rawUrl,
            name: fullName
        });
        
    } catch (error) {
        console.error('[RAW] Create error:', error.message);
        return res.status(500).json({ error: 'SCRIPT_CREATION_FAILED' });
    }
}

/**
 * Generate loader for executors
 */
function generateLoader(code) {
    const seed = crypto.randomBytes(8).toString('hex');
    return `-- APEX HUB Loader\nlocal s="${seed}"\n${code}`;
}

export default async function handler(req, res) {
    // Security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Session-Token, X-Challenge-Token, X-Challenge-Answer');
    
    if (req.method === 'OPTIONS') return res.status(200).end();
    
    try {
        switch (req.method) {
            case 'GET':
                return await handleGet(req, res);
            case 'POST':
                return await handleCreate(req, res);
            default:
                return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
        }
    } catch (error) {
        console.error('[RAW] Handler error:', error.message);
        return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
}
