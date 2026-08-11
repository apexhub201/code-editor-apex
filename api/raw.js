// ============================================================
// api/raw.js - APEX HUB V9 (Hercules Obfuscator)
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
        }
    } catch (error) {
        console.error('Firebase init error:', error);
    }
}

const db = getFirestore();

// ============================================================
// HERCULES OBFUSCATOR
// ============================================================

class Hercules {
    constructor(seed) {
        this.seed = this.hash(seed || crypto.randomBytes(8).toString('hex'));
    }
    
    hash(s) {
        let h = 0;
        for (let i = 0; i < s.length; i++) {
            h = ((h << 5) - h) + s.charCodeAt(i);
            h |= 0;
        }
        return Math.abs(h);
    }
    
    rand() {
        this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
        return this.seed / 0x7fffffff;
    }
    
    rint(min, max) {
        return Math.floor(this.rand() * (max - min + 1)) + min;
    }
    
    rid() {
        return '_' + this.rint(1000, 9999).toString(36);
    }
    
    obfuscate(code) {
        let result = code;
        
        // String encryption
        result = result.replace(/"([^"]{4,})"/g, (match, str) => {
            if (this.rand() > 0.6) return match;
            const key = this.rint(1, 255);
            const enc = str.split('').map(c => String.fromCharCode(c.charCodeAt(0) ^ key)).join('');
            const esc = enc.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
            const fn = this.rid();
            return `(function()local ${fn}="${esc}"local k=${key}local r=""for i=1,#${fn}do r=r..string.char(string.byte(${fn},i)~k)end return r end)()`;
        });
        
        // Number encryption
        result = result.replace(/\b(\d+)\b/g, (match, num) => {
            const n = parseInt(num);
            if (n < 2 || n > 9999 || this.rand() > 0.5) return match;
            const a = this.rint(1, n - 1);
            return `(${a}+${n - a})`;
        });
        
        // Dead code injection
        const dead = [
            `local ${this.rid()}=function(...)local a=table.pack(...)local r=0 for i=1,a.n do r=r+(a[i]or 0)*i end return r end`,
            `local ${this.rid()}={}for i=1,${this.rint(3,8)}do ${this.rid()}[i]=i*${this.rint(2,7)}end`,
            `do local _=${this.rint(1000,9999)}while _>0 do _=_-1 break end end`,
        ];
        const lines = result.split('\n');
        const out = [];
        for (const line of lines) {
            out.push(line);
            if (line.trim() && this.rand() < 0.12) {
                out.push(dead[this.rint(0, dead.length - 1)]);
            }
        }
        result = out.join('\n');
        
        // Anti-debug
        const traps = [
            `if debug and debug.getinfo and debug.getinfo(1)and debug.getinfo(1).short_src:match("hook")then return end`,
            `if rawget and rawget(_G,"hooked")then return end`,
        ];
        result = `--[[ Hercules v2.0 | APEX HUB ]]--\n${traps[this.rint(0, traps.length - 1)]}\n${result}`;
        
        // Mutation
        result = result.replace(/\blocal\s+([a-zA-Z_]\w*)\s*=/g, (match, varName) => {
            if (varName.startsWith('_')) return match;
            return `local ${this.rid()}=`;
        });
        
        return result;
    }
    
    generateLoader(code) {
        const key = crypto.randomBytes(16);
        const enc = Buffer.alloc(code.length);
        for (let i = 0; i < code.length; i++) {
            enc[i] = code.charCodeAt(i) ^ key[i % 16];
        }
        const b64 = enc.toString('base64');
        const kh = key.toString('hex');
        
        return [
            `-- APEX HUB Loader (Hercules)`,
            `local k="${kh}"`,
            `local d="${b64}"`,
            `local function b64d(d)`,
            `  local b="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"`,
            `  d=string.gsub(d,'[^'..b..'=]','')`,
            `  return(d:gsub('.',function(x)`,
            `    if(x=='=')then return''end`,
            `    local _,f=string.find(b,x)`,
            `    local r=''`,
            `    f=f-1`,
            `    for _=6,1,-1 do r=r..(f%2^_-f%2^(_-1)>0 and'1'or'0')end`,
            `    return r`,
            `  end):gsub('%d%d%d?%d?%d?%d?%d?%d?',function(x)`,
            `    if(#x~=8)then return''end`,
            `    return string.char(tonumber(x,2))`,
            `  end))`,
            `end`,
            `local dc=b64d(d)`,
            `local r={}`,
            `for i=1,#dc do`,
            `  local kb=tonumber(string.sub(k,((i-1)%16)*2+1,((i-1)%16)*2+2),16)`,
            `  r[i]=string.char(string.byte(dc,i)~kb)`,
            `end`,
            `local c=table.concat(r)`,
            `d,dc,r,k=nil,nil,nil,nil`,
            `local f=loadstring(c)`,
            `if f then f()end`,
        ].join('\n');
    }
}

// ============================================================
// HELPERS
// ============================================================

const scriptCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

const executorPatterns = [
    'roblox', 'synapse', 'krnl', 'script-ware', 'sentinel',
    'fluxus', 'electron', 'comet', 'oxygen', 'valyse',
    'hydrogen', 'codex', 'vega', 'trigon', 'nexus',
    'solara', 'jjsploit', 'celestial', 'evon', 'aris'
];

function normalizeName(name) {
    return name.trim().toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') || 'script';
}

async function getScript(name) {
    const cached = scriptCache.get(name);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) return cached.data;
    
    try {
        const doc = await db.collection('scripts').doc(name).get();
        if (!doc.exists) return null;
        const data = doc.data();
        doc.ref.update({ lastAccessed: Date.now() }).catch(() => {});
        scriptCache.set(name, { data, timestamp: Date.now() });
        return data;
    } catch (error) {
        return null;
    }
}

async function saveScript(name, data) {
    try {
        await db.collection('scripts').doc(name).set({
            ...data,
            updatedAt: Date.now()
        }, { merge: true });
        scriptCache.delete(name);
        return true;
    } catch (error) {
        return false;
    }
}

async function deleteScript(name) {
    try {
        await db.collection('scripts').doc(name).delete();
        scriptCache.delete(name);
        return true;
    } catch (error) {
        return false;
    }
}

// ============================================================
// HANDLERS
// ============================================================

async function handleGet(req, res) {
    const { name, key } = req.query;
    const ua = (req.headers['user-agent'] || '').toLowerCase();
    
    if (!name) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(getWelcomePage());
    }
    
    const scriptData = await getScript(name);
    if (!scriptData) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(404).send(getErrorPage(name));
    }
    
    // Admin key bypass
    const VALID_KEYS = ['d0egkw6en9eusrjje5vn70p2tvkngkkn', 'apex-master-key-2024'];
    if (VALID_KEYS.includes(key) || VALID_KEYS.includes(req.headers['x-auth-key'])) {
        return res.json({ success: true, code: scriptData.code });
    }
    
    // Executor → Hercules Loader
    if (executorPatterns.some(p => ua.includes(p))) {
        const hercules = new Hercules();
        const loader = hercules.generateLoader(scriptData.code);
        
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        return res.send(loader);
    }
    
    // Browser
    if (ua.includes('mozilla') || ua.includes('chrome') || ua.includes('safari') || ua.includes('firefox')) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(getProtectionPage());
    }
    
    // Other → JSON
    return res.json({ success: true, code: scriptData.code });
}

async function handleCreate(req, res) {
    try {
        const { code, name, uid } = req.body;
        
        if (!code || !code.trim()) return res.status(400).json({ success: false, error: 'Code is required' });
        if (!name || !name.trim()) return res.status(400).json({ success: false, error: 'Name is required' });
        
        const nameSlug = normalizeName(name);
        const userId = uid || 'public';
        const fullName = `${userId}_${nameSlug}`;
        
        // Hercules obfuscation
        const hercules = new Hercules();
        const obfuscatedCode = hercules.obfuscate(code);
        
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
            obfuscator: 'hercules'
        });
        
        const rawUrl = `https://${req.headers.host}/api/raw?name=${fullName}`;
        return res.status(200).json({ success: true, raw: rawUrl, name: fullName });
        
    } catch (error) {
        console.error('Create error:', error);
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
        
        const hercules = new Hercules();
        scriptData.code = hercules.obfuscate(code);
        scriptData.originalCode = code;
        scriptData.updated = Date.now();
        scriptData.obfuscator = 'hercules';
        
        await saveScript(name, scriptData);
        return res.status(200).json({ success: true, message: 'Updated successfully', name: name });
        
    } catch (error) {
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
        return res.status(500).json({ success: false, error: 'SCRIPT_DELETE_FAILED' });
    }
}

// ============================================================
// UI PAGES
// ============================================================

function getProtectionPage() {
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>APEX HUB | Security</title><style>*{margin:0;padding:0;box-sizing:border-box}body{background:#070708;color:#f5f5f5;font-family:system-ui,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh}.card{background:rgba(18,18,21,0.72);border:1px solid rgba(255,255,255,0.07);border-radius:18px;padding:56px 52px;text-align:center;max-width:480px;width:90%}.logo{font-size:24px;font-weight:600;margin-bottom:24px}.title{font-size:18px;margin-bottom:12px}.desc{font-size:14px;color:#8b8b93;margin-bottom:24px}a{color:#8b8b93;text-decoration:none;font-size:13px}a:hover{color:#f5f5f5}</style></head><body><div class="card"><div class="logo">APEX HUB</div><div class="title">Restricted Access</div><p class="desc">This endpoint requires authorized client access.</p><a href="https://apexhubeditor.vercel.app/">Open APEX HUB →</a></div></body></html>`;
}

function getWelcomePage() {
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>APEX HUB</title><style>*{margin:0;padding:0;box-sizing:border-box}body{background:#070708;color:#f5f5f5;font-family:system-ui,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh}.card{background:rgba(18,18,21,0.72);border:1px solid rgba(255,255,255,0.07);border-radius:18px;padding:52px 48px;text-align:center;max-width:480px;width:90%}h1{font-size:28px;margin-bottom:16px}p{color:#8b8b93;font-size:14px;margin-bottom:24px}.ep{font-family:monospace;font-size:12px;padding:8px 12px;margin:4px 0;border-radius:6px;background:rgba(255,255,255,0.02);color:#8b8b93}.method{font-size:10px;text-transform:uppercase;margin-right:8px;color:#505057}</style></head><body><div class="card"><h1>APEX HUB</h1><p>API Gateway V9</p><div class="ep"><span class="method">POST</span>/api/raw</div><div class="ep"><span class="method">GET</span>/api/raw?name=script</div><div class="ep"><span class="method">PUT</span>/api/raw</div><div class="ep"><span class="method">DEL</span>/api/raw?name=script</div></div></body></html>`;
}

function getErrorPage(name) {
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>404 | APEX HUB</title><style>*{margin:0;padding:0;box-sizing:border-box}body{background:#070708;color:#f5f5f5;font-family:system-ui,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh}.card{background:rgba(18,18,21,0.72);border:1px solid rgba(255,255,255,0.07);border-radius:18px;padding:52px 48px;text-align:center}.code{font-size:4rem;color:#8b8b93;margin-bottom:12px}.msg{font-size:14px;color:#8b8b93;margin-bottom:16px}.ref{font-family:monospace;font-size:12px;color:#505057;padding:8px 16px;background:rgba(255,255,255,0.02);border-radius:6px;display:inline-block}a{display:block;margin-top:16px;color:#8b8b93;text-decoration:none;font-size:13px}</style></head><body><div class="card"><div class="code">404</div><p class="msg">Script not found</p><div class="ref">${name}</div><a href="https://apexhubeditor.vercel.app/">← Return</a></div></body></html>`;
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
        console.error('Handler error:', error);
        return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
    }
}
