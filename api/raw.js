// api/raw.js
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import Crypto from '../lib/crypto.js';
import Security from '../lib/security.js';

// Firebase init
if (!getApps().length) {
    try {
        const projectId = process.env.FIREBASE_PROJECT_ID;
        const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
        const privateKey = process.env.FIREBASE_PRIVATE_KEY;

        if (projectId && clientEmail && privateKey) {
            initializeApp({
                credential: cert({
                    projectId,
                    clientEmail,
                    privateKey: privateKey.replace(/\\n/g, '\n')
                })
            });
            console.log('[APEX] Firebase OK');
        } else {
            console.log('[APEX] No Firebase - memory mode');
        }
    } catch (e) {
        console.error('[APEX] Firebase error:', e.message);
    }
}

let db = null;
try {
    if (getApps().length > 0) db = getFirestore();
} catch (e) {}

// Memory cache
const cache = new Map();

// Obfuscator đơn giản
function obfuscate(code) {
    // Thêm anti-debug
    code = 'if debug and debug.getinfo and debug.getinfo(1) and debug.getinfo(1).short_src:match("hook") then return end\n' + code;
    // Mã hóa string
    code = code.replace(/"([^"]{6,})"/g, (match, str) => {
        const parts = [];
        let remaining = str;
        while (remaining.length > 0) {
            const len = Math.floor(Math.random() * 5) + 2;
            parts.push('"' + remaining.substring(0, len) + '"');
            remaining = remaining.substring(len);
        }
        const varName = '_s' + Math.random().toString(36).substring(2, 6);
        return '(function() local ' + varName + '="" local _p={' + parts.join(',') + '} for _i=1,#_p do ' + varName + '=' + varName + '.._p[_i] end return ' + varName + ' end)()';
    });
    return code;
}

// Loader generator đơn giản
function generateLoader(code) {
    const key = Crypto.generateRandomString(16);
    const bytes = Buffer.from(code, 'utf8');
    const encrypted = [];
    for (let i = 0; i < bytes.length; i++) {
        const k = key.charCodeAt(i % key.length);
        encrypted.push((bytes[i] + k) % 256);
    }
    const hexData = Buffer.from(encrypted).toString('hex');

    return `-- APEX HUB Loader v10
local _key="${key}"
local _hex="${hexData}"
local _bytes={}
local _idx=1
for _c in _hex:gmatch("..") do
    local _b=tonumber(_c,16)
    local _kb=string.byte(_key,(_idx-1)%#_key+1)
    _bytes[_idx]=string.char((_b-_kb)%256)
    _idx=_idx+1
end
local _code=table.concat(_bytes)
_hex=nil _key=nil _bytes=nil
local _f,_e=loadstring(_code)
if not _f then error("APEX: "..tostring(_e)) end
_code=nil
_f()
_f=nil
collectgarbage("collect")`;
}

// DB helpers
async function getScript(name) {
    const cached = cache.get(name);
    if (cached && Date.now() - cached.time < 300000) return cached.data;
    if (db) {
        try {
            const doc = await db.collection('scripts').doc(name).get();
            if (!doc.exists) return null;
            const data = doc.data();
            doc.ref.update({ lastAccessed: Date.now() }).catch(() => {});
            cache.set(name, { data, time: Date.now() });
            return data;
        } catch (e) {
            if (cached) return cached.data;
            return null;
        }
    }
    if (cached) return cached.data;
    return null;
}

async function saveScript(name, data) {
    if (db) {
        try {
            await db.collection('scripts').doc(name).set({ ...data, updatedAt: Date.now() }, { merge: true });
        } catch (e) {}
    }
    cache.set(name, { data, time: Date.now() });
    return true;
}

async function deleteScript(name) {
    if (db) {
        try { await db.collection('scripts').doc(name).delete(); } catch (e) {}
    }
    cache.delete(name);
    return true;
}

function normalizeName(name) {
    return String(name).trim().toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') || 'script';
}

// HTML Pages
function getProtectionPage() {
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>APEX HUB | Security Gateway</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;background:#070708;color:#f5f5f5;min-height:100vh;display:flex;justify-content:center;align-items:center}.card{background:rgba(18,18,21,0.9);backdrop-filter:blur(36px);border-radius:18px;padding:56px 52px;border:1px solid rgba(255,255,255,0.07);max-width:560px;width:90%;text-align:center;box-shadow:0 16px 48px rgba(0,0,0,0.5)}.logo{font-size:26px;font-weight:600;margin-bottom:6px}.sub{font-size:10px;text-transform:uppercase;letter-spacing:0.18em;color:#666;margin-bottom:36px}.sep{width:100%;height:1px;background:rgba(255,255,255,0.07);margin:24px 0}.title{font-size:22px;font-weight:600;margin-bottom:12px}.desc{font-size:14px;color:#8b8b93;line-height:1.7;margin-bottom:32px}.status{background:rgba(255,255,255,0.015);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:20px;text-align:left;margin-bottom:28px}.row{display:flex;justify-content:space-between;padding:6px 0;font-size:11px}.label{color:#505057;text-transform:uppercase;font-size:10px}.value{font-family:monospace;color:#8b8b93}.btn{display:inline-block;padding:15px 28px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:10px;color:#f5f5f5;text-decoration:none;font-size:14px;transition:0.3s}.btn:hover{background:rgba(255,255,255,0.05)}.footer{margin-top:28px;font-size:10px;text-transform:uppercase;color:#505057}</style></head><body><div class="card"><div class="logo">APEX HUB</div><div class="sub">Security Gateway</div><div class="sep"></div><div class="title">Restricted Endpoint</div><p class="desc">Access to this resource is limited to authorized clients. Browser requests are not permitted.</p><div class="status"><div class="row"><span class="label">Status</span><span class="value">ACTIVE</span></div><div class="row"><span class="label">Transport</span><span class="value">ENCRYPTED</span></div><div class="row"><span class="label">Access</span><span class="value">RESTRICTED</span></div><div class="row"><span class="label">Gateway</span><span class="value">V10 PHANTOM</span></div></div><a href="https://apexhubeditor.vercel.app/" class="btn">Open APEX HUB &rarr;</a><div class="footer">APEX HUB / Security Infrastructure</div></div></body></html>`;
}

function getWelcomePage() {
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>APEX HUB | API Gateway</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;background:#070708;color:#f5f5f5;min-height:100vh;display:flex;justify-content:center;align-items:center}.card{background:rgba(18,18,21,0.9);border-radius:18px;padding:52px 48px;border:1px solid rgba(255,255,255,0.07);max-width:560px;width:90%;text-align:center}.brand{font-size:28px;font-weight:600}.sub{font-size:10px;text-transform:uppercase;letter-spacing:0.18em;color:#666;margin:6px 0 32px}.desc{font-size:14px;color:#8b8b93;margin-bottom:32px}.sep{height:1px;background:rgba(255,255,255,0.07);margin-bottom:28px}.ep{display:flex;align-items:center;gap:14px;padding:12px 16px;font-size:13px;font-family:monospace;border-radius:8px}.method{font-size:10px;text-transform:uppercase;padding:4px 10px;border-radius:6px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.05);color:#8b8b93}.footer{margin-top:32px;font-size:10px;text-transform:uppercase;color:#505057}</style></head><body><div class="card"><h1 class="brand">APEX HUB</h1><div class="sub">API Gateway</div><p class="desc">Production infrastructure for secure script delivery.</p><div class="sep"></div><div class="ep"><span class="method">POST</span>/api/raw</div><div class="ep"><span class="method">GET</span>/api/raw?name=script</div><div class="ep"><span class="method">DEL</span>/api/raw?name=script</div><div class="footer">APEX HUB &middot; V10</div></div></body></html>`;
}

function getErrorPage(name) {
    const safeName = String(name || 'unknown').replace(/[<>"'&]/g, '');
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>404 | APEX HUB</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;background:#070708;color:#f5f5f5;min-height:100vh;display:flex;justify-content:center;align-items:center}.card{background:rgba(18,18,21,0.9);border-radius:18px;padding:52px 48px;border:1px solid rgba(255,255,255,0.07);text-align:center;max-width:480px;width:90%}.code{font-size:5rem;font-family:monospace;color:#8b8b93;margin-bottom:8px}.title{font-size:16px;font-weight:500;margin-bottom:12px}.msg{font-size:14px;color:#8b8b93;margin-bottom:20px}.ref{display:inline-block;padding:8px 18px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.07);border-radius:8px;font-family:monospace;font-size:12px;color:#8b8b93}a{display:inline-block;margin-top:20px;color:#8b8b93;text-decoration:none;font-size:13px}a:hover{color:#f5f5f5}</style></head><body><div class="card"><div class="code">404</div><div class="title">Resource not found</div><p class="msg">Script not found.</p><div class="ref">${safeName}</div><br><a href="/api/raw">&larr; Gateway</a></div></body></html>`;
}

function getBannedPage() {
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Banned | APEX HUB</title><style>*{margin:0;padding:0}body{font-family:system-ui,sans-serif;background:#070708;color:#f5f5f5;min-height:100vh;display:flex;justify-content:center;align-items:center}.card{background:rgba(18,18,21,0.9);border-radius:18px;padding:52px 48px;border:1px solid rgba(255,255,255,0.07);text-align:center;max-width:480px;width:90%}.icon{font-size:48px;margin-bottom:24px;color:#8b8b93}.title{font-size:16px;margin-bottom:12px}.msg{font-size:14px;color:#8b8b93;margin-bottom:24px}.footer{margin-top:24px;font-size:10px;text-transform:uppercase;color:#505057}</style></head><body><div class="card"><div class="icon">&#128683;</div><div class="title">Access Denied</div><p class="msg">Your IP has been temporarily blocked.</p><div class="footer">APEX HUB</div></div></body></html>`;
}

function getRateLimitPage() {
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Rate Limited | APEX HUB</title><style>*{margin:0;padding:0}body{font-family:system-ui,sans-serif;background:#070708;color:#f5f5f5;min-height:100vh;display:flex;justify-content:center;align-items:center}.card{background:rgba(18,18,21,0.9);border-radius:18px;padding:52px 48px;border:1px solid rgba(255,255,255,0.07);text-align:center;max-width:480px;width:90%}.icon{font-size:48px;margin-bottom:24px;color:#8b8b93}.title{font-size:16px;margin-bottom:12px}.msg{font-size:14px;color:#8b8b93;margin-bottom:24px}.footer{margin-top:24px;font-size:10px;text-transform:uppercase;color:#505057}</style></head><body><div class="card"><div class="icon">&#9200;</div><div class="title">Rate Limited</div><p class="msg">Too many requests. Please wait.</p><div class="footer">APEX HUB</div></div></body></html>`;
}

// ============================================================
// MAIN HANDLER
// ============================================================
export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Access-Token, X-Nonce, X-HWID');
    Security.setSecurityHeaders(res);

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const clientIP = Security.getClientIP(req);
    const ua = (req.headers['user-agent'] || '').toLowerCase();

    // GET request
    if (req.method === 'GET') {
        const { name, accessToken, nonce } = req.query;
        const tokenFromHeader = req.headers['x-access-token'] || '';
        const effectiveToken = accessToken || tokenFromHeader;

        // IP ban check
        if (Security.isIPBanned(clientIP)) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.status(403).send(getBannedPage());
        }

        // Rate limit
        const rateCheck = Security.checkRateLimit('raw:' + clientIP, 10, 60000);
        if (!rateCheck.allowed) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.status(429).send(getRateLimitPage());
        }

        // Welcome page
        if (!name) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.send(getWelcomePage());
        }

        // No token -> challenge
        if (!effectiveToken) {
            const isBrowser = ua.includes('mozilla') || ua.includes('chrome') || ua.includes('safari');
            if (isBrowser) {
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                return res.send(getProtectionPage());
            }
            const challenge = Security.generateChallenge();
            return res.json({
                protected: true,
                requireChallenge: true,
                challenge: {
                    question: challenge.question,
                    token: challenge.token,
                    type: challenge.type,
                    expiresIn: challenge.expiresIn
                }
            });
        }

        // Validate token
        const tokenCheck = Security.validateAccessToken(effectiveToken, nonce);
        if (!tokenCheck.valid) {
            Security.addStrike(clientIP);
            return res.status(403).json({ success: false, error: tokenCheck.error, requireChallenge: true });
        }

        // Get script
        const scriptData = await getScript(name);
        if (!scriptData) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.status(404).send(getErrorPage(name));
        }

        // Executor detection -> loader
        const executorPatterns = ['roblox', 'synapse', 'krnl', 'script-ware', 'sentinel', 'fluxus', 'electron', 'comet', 'oxygen', 'valyse', 'hydrogen', 'codex', 'vega', 'trigon', 'nexus', 'solara', 'jjsploit', 'celestial', 'evon', 'aris'];
        const isExecutor = executorPatterns.some(p => ua.includes(p));

        if (isExecutor) {
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Cache-Control', 'no-store');
            return res.send(generateLoader(scriptData.code));
        }

        // Default: encrypted JSON
        const encKey = Crypto.generateRandomString(32);
        const encrypted = Crypto.encrypt(scriptData.code, encKey);
        return res.json({
            success: true,
            name,
            payload: encrypted.data,
            iv: encrypted.iv,
            decryptKey: encKey,
            checksum: encrypted.checksum
        });
    }

    // POST request - Create script
    if (req.method === 'POST') {
        try {
            const { code, name, uid } = req.body || {};
            if (!code || !name) {
                return res.status(400).json({ success: false, error: 'Code and name required' });
            }

            const slug = normalizeName(name);
            const userId = uid || 'public';
            const fullName = userId + '_' + slug;

            const obfuscatedCode = obfuscate(code);

            const existing = await getScript(fullName);
            if (existing) {
                const newName = fullName + '_' + Date.now().toString(36);
                await saveScript(newName, {
                    code: obfuscatedCode,
                    originalCode: code,
                    name: String(name).trim(),
                    created: Date.now(),
                    lastAccessed: Date.now(),
                    owner: userId
                });
                const rawUrl = 'https://' + req.headers.host + '/api/raw?name=' + newName;
                return res.json({ success: true, raw: rawUrl, name: newName, existed: true });
            }

            await saveScript(fullName, {
                code: obfuscatedCode,
                originalCode: code,
                name: String(name).trim(),
                created: Date.now(),
                lastAccessed: Date.now(),
                owner: userId
            });

            const rawUrl = 'https://' + req.headers.host + '/api/raw?name=' + fullName;
            return res.json({ success: true, raw: rawUrl, name: fullName });
        } catch (error) {
            return res.status(500).json({ success: false, error: error.message });
        }
    }

    // DELETE request
    if (req.method === 'DELETE') {
        const { name } = req.query;
        if (!name) return res.status(400).json({ success: false, error: 'Name required' });
        await deleteScript(name);
        return res.json({ success: true, message: 'Deleted' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
