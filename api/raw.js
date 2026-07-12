// api/raw.js - APEX HUB COMPLETE WITH FIRESTORE
import { db } from '../lib/firebase.js';
import admin from 'firebase-admin';

// ============================================================
// HELPER FUNCTIONS
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
    const key = generateRandomKey(32);
    const encrypted = [];
    
    for (let i = 0; i < code.length; i++) {
        const charCode = code.charCodeAt(i);
        const keyChar = key.charCodeAt(i % key.length);
        encrypted.push((charCode ^ keyChar) & 0xFF);
    }
    
    let checksum = 0;
    for (let i = 0; i < code.length; i++) {
        checksum = (checksum + code.charCodeAt(i)) % 65536;
    }
    
    return { data: encrypted, key: key, checksum: checksum };
}

function generateAntiDumpLoader(encryptedPayload, host) {
    const v = {
        d: '_' + generateRandomKey(6),
        p: '_' + generateRandomKey(6),
        k: '_' + generateRandomKey(6),
        r: '_' + generateRandomKey(6),
        f: '_' + generateRandomKey(6),
        c: '_' + generateRandomKey(6),
        m: '_' + generateRandomKey(6)
    };

    return `--[[ APEX HUB Protected Loader ]]--
local ${v.p}={${encryptedPayload.data.join(',')}}
local ${v.k}="${encryptedPayload.key}"

local function ${v.c}()
    local _n=function()end
    print=_n;warn=_n;error=_n
    if writefile then writefile=function()end end
    if readfile then readfile=function()return""end end
    if appendfile then appendfile=function()end end
    if listfiles then listfiles=function()return{}end end
    if isfile then isfile=function()return false end end
    if loadfile then loadfile=function()error("Blocked",0)end end
    if dofile then dofile=function()error("Blocked",0)end end
    if getgc then getgc=function()return{}end end
    if getconstants then getconstants=function()return{}end end
    if getinfo then getinfo=function()return nil end end
    if getproto then getproto=function()return nil end end
    if getstack then getstack=function()return nil end end
    if getupvalue then getupvalue=function()return nil end end
    if getupvalues then getupvalues=function()return{}end end
    if dumpstring then dumpstring=function()return""end end
    if decompile then decompile=function()return""end end
    if hookfunction then hookfunction=function(f,h)return f end end
    if hookmetamethod then hookmetamethod=function()return function()end end end
    if newcclosure then newcclosure=function(f)return f end end
    if debug then
        pcall(function()debug.getinfo=function()return nil end end)
        pcall(function()debug.getupvalue=function()return nil end end)
        pcall(function()debug.getconstants=function()return{}end end)
        pcall(function()debug.getproto=function()return nil end end)
        pcall(function()debug.traceback=function()return""end end)
    end
    if getfenv then getfenv=function()return{}end end
    if setfenv then setfenv=function()end end
    if getgenv then getgenv=function()return{}end end
    if getrawmetatable then getrawmetatable=function()return nil end end
    if setreadonly then setreadonly=function()end end
    collectgarbage("collect")
end

local function ${v.d}(data,key)
    local ${v.r}={}
    for i=1,#data do
        local byte=data[i]
        local keyByte=string.byte(key,(i-1)%#key+1)
        ${v.r}[i]=string.char(bit32.bxor(byte,keyByte))
    end
    return table.concat(${v.r})
end

local function ${v.m}()
    ${v.c}()
    local ${v.f}=${v.d}(${v.p},${v.k})
    ${v.p}=nil;${v.k}=nil
    collectgarbage("collect")
    
    local ${v.exec},err=loadstring(${v.f})
    ${v.f}=nil
    collectgarbage("collect")
    collectgarbage("collect")
    
    if not ${v.exec}then while true do end end
    
    local success,result=pcall(${v.exec})
    ${v.exec}=nil
    collectgarbage("collect")
    collectgarbage("collect")
    
    if not success then while true do end end
    return result
end

local ok,res=pcall(${v.m})
if not ok then while true do end end`;
}

// ============================================================
// FIRESTORE OPERATIONS
// ============================================================

async function getScript(name) {
    try {
        const docRef = db.collection('scripts').doc(name);
        const doc = await docRef.get();
        
        if (!doc.exists) return null;
        
        await docRef.update({ 
            lastAccessed: admin.firestore.FieldValue.serverTimestamp() 
        }).catch(() => {}); // Không quan trọng nếu update fail
        
        return { id: doc.id, ...doc.data() };
    } catch (error) {
        console.error('❌ Get script error:', error.message);
        return null;
    }
}

async function scriptExists(name) {
    try {
        const doc = await db.collection('scripts').doc(name).get();
        return doc.exists;
    } catch (error) {
        return false;
    }
}

async function createScript(name, code, originalName) {
    try {
        await db.collection('scripts').doc(name).set({
            code: code,
            name: originalName,
            created: admin.firestore.FieldValue.serverTimestamp(),
            lastAccessed: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log(`✅ Script created: ${name}`);
        return true;
    } catch (error) {
        console.error('❌ Create script error:', error.message);
        return false;
    }
}

async function updateScript(name, code) {
    try {
        const docRef = db.collection('scripts').doc(name);
        const doc = await docRef.get();
        
        if (!doc.exists) return false;
        
        await docRef.update({
            code: code,
            updated: admin.firestore.FieldValue.serverTimestamp(),
            lastAccessed: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log(`✅ Script updated: ${name}`);
        return true;
    } catch (error) {
        console.error('❌ Update script error:', error.message);
        return false;
    }
}

async function deleteScript(name) {
    try {
        const docRef = db.collection('scripts').doc(name);
        const doc = await docRef.get();
        
        if (!doc.exists) return false;
        
        await docRef.delete();
        console.log(`✅ Script deleted: ${name}`);
        return true;
    } catch (error) {
        console.error('❌ Delete script error:', error.message);
        return false;
    }
}

async function checkRateLimit(ip) {
    try {
        const ref = db.collection('rateLimits').doc(ip);
        const doc = await ref.get();
        const now = Date.now();
        const windowMs = 60000;
        const maxRequests = 30;

        if (!doc.exists) {
            await ref.set({ count: 1, resetTime: now + windowMs });
            return true;
        }

        const data = doc.data();
        if (now > data.resetTime) {
            await ref.set({ count: 1, resetTime: now + windowMs });
            return true;
        }

        const newCount = (data.count || 0) + 1;
        await ref.update({ count: newCount });
        return newCount <= maxRequests;
    } catch (error) {
        return true; // Cho qua nếu Firestore lỗi
    }
}

async function banIP(ip, durationMs = 300000) {
    try {
        await db.collection('bannedIPs').doc(ip).set({
            bannedAt: Date.now(),
            until: Date.now() + durationMs
        });
    } catch (error) {
        console.error('❌ Ban IP error:', error.message);
    }
}

async function isIPBanned(ip) {
    try {
        const doc = await db.collection('bannedIPs').doc(ip).get();
        if (!doc.exists) return false;
        
        const data = doc.data();
        if (Date.now() > data.until) {
            await db.collection('bannedIPs').doc(ip).delete();
            return false;
        }
        return true;
    } catch (error) {
        return false;
    }
}

// ============================================================
// MAIN HANDLER
// ============================================================

export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Challenge-Token, X-Challenge-Answer, X-Auth-Key');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        if (req.method === 'GET') return await handleGet(req, res);
        if (req.method === 'POST') return await handleCreate(req, res);
        if (req.method === 'PUT') return await handleUpdate(req, res);
        if (req.method === 'DELETE') return await handleDelete(req, res);
    } catch (error) {
        console.error('❌ Handler error:', error.message);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
}

// ============================================================
// GET HANDLER
// ============================================================

async function handleGet(req, res) {
    const { name, key, raw } = req.query;
    const ua = (req.headers['user-agent'] || '').toLowerCase();
    const clientIP = req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown';
    const authKey = req.headers['x-auth-key'] || '';

    // IP Ban Check
    if (await isIPBanned(clientIP)) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(403).send(getBannedPage());
    }

    // Rate Limit
    if (!(await checkRateLimit(clientIP))) {
        await banIP(clientIP, 300000);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(429).send(getRateLimitPage());
    }

    // No name → Welcome
    if (!name) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(getWelcomePage(req.headers.host));
    }

    // Get script from Firestore
    const scriptData = await getScript(name);
    
    if (!scriptData) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(404).send(getErrorPage(name));
    }

    // Valid Key → Encrypted payload
    const VALID_KEYS = ['d0egkw6en9eusrjje5vn70p2tvkngkkn', 'apex-master-key-2024'];
    const hasValidKey = VALID_KEYS.includes(key) || VALID_KEYS.includes(authKey);
    const wantsRaw = raw === 'true';

    if (hasValidKey || wantsRaw) {
        const payload = encryptPayload(scriptData.code);
        return res.json({
            success: true,
            payload: payload.data,
            decryptKey: payload.key,
            checksum: payload.checksum
        });
    }

    // Executor Detection → Anti-Dump Loader
    const executorPatterns = [
        'roblox', 'synapse', 'krnl', 'script-ware', 'sentinel',
        'fluxus', 'electron', 'comet', 'oxygen', 'valyse',
        'hydrogen', 'codex', 'vega', 'trigon', 'nexus',
        'solara', 'jjsploit', 'celestial', 'evon', 'aris'
    ];
    const isExecutor = executorPatterns.some(p => ua.includes(p));

    if (isExecutor) {
        const payload = encryptPayload(scriptData.code);
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        return res.send(generateAntiDumpLoader(payload, req.headers.host));
    }

    // Browser → Protection Page
    const isBrowser = ua.includes('mozilla') || ua.includes('chrome') ||
                      ua.includes('safari') || ua.includes('firefox') ||
                      ua.includes('edge') || ua.includes('opera');

    if (isBrowser) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(getProtectionPage(req.headers.host));
    }

    // Unknown → Challenge
    const newChallenge = {
        question: `${Math.floor(Math.random() * 50) + 1} + ${Math.floor(Math.random() * 50) + 1} = ?`,
        answer: '0',
        token: generateRandomKey(16)
    };
    newChallenge.answer = eval(newChallenge.question.replace('= ?', '')).toString();

    // Lưu challenge vào Firestore
    await db.collection('challenges').doc(newChallenge.token).set({
        answer: newChallenge.answer,
        createdAt: Date.now(),
        used: false,
        attempts: 0
    });

    return res.json({
        protected: true,
        message: 'Challenge required',
        challenge: {
            question: newChallenge.question,
            token: newChallenge.token
        }
    });
}

// ============================================================
// CREATE HANDLER
// ============================================================

async function handleCreate(req, res) {
    try {
        const { code, name } = req.body;
        
        if (!code || !code.trim()) {
            return res.status(400).json({ success: false, error: 'Code is required' });
        }
        
        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, error: 'Name is required' });
        }

        const nameSlug = name.trim()
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '') || 'script';

        const exists = await scriptExists(nameSlug);
        if (exists) {
            return res.status(409).json({ success: false, error: 'Script name already exists' });
        }

        const saved = await createScript(nameSlug, code, name.trim());
        if (!saved) {
            return res.status(500).json({ success: false, error: 'Failed to save script' });
        }

        const rawUrl = `https://${req.headers.host}/api/raw?name=${nameSlug}`;
        const rawUrlWithKey = `https://${req.headers.host}/api/raw?name=${nameSlug}&key=d0egkw6en9eusrjje5vn70p2tvkngkkn`;

        return res.status(200).json({
            success: true,
            raw: rawUrl,
            rawWithKey: rawUrlWithKey,
            name: nameSlug
        });
    } catch (error) {
        console.error('❌ Create error:', error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
}

// ============================================================
// UPDATE HANDLER
// ============================================================

async function handleUpdate(req, res) {
    try {
        const { name, code } = req.body;
        
        if (!name) {
            return res.status(400).json({ success: false, error: 'Name is required' });
        }
        
        if (!code || !code.trim()) {
            return res.status(400).json({ success: false, error: 'Code is required' });
        }

        const updated = await updateScript(name, code);
        if (!updated) {
            return res.status(404).json({ success: false, error: 'Script not found' });
        }

        const rawUrl = `https://${req.headers.host}/api/raw?name=${name}`;

        return res.status(200).json({
            success: true,
            message: 'Updated successfully',
            raw: rawUrl,
            name: name
        });
    } catch (error) {
        console.error('❌ Update error:', error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
}

// ============================================================
// DELETE HANDLER
// ============================================================

async function handleDelete(req, res) {
    try {
        const { name } = req.query;
        
        if (!name) {
            return res.status(400).json({ success: false, error: 'Name is required' });
        }

        const deleted = await deleteScript(name);
        if (!deleted) {
            return res.status(404).json({ success: false, error: 'Script not found' });
        }

        return res.status(200).json({ success: true, message: 'Deleted successfully' });
    } catch (error) {
        console.error('❌ Delete error:', error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
}

// ============================================================
// HTML PAGES
// ============================================================

function getProtectionPage(host) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>APEX HUB | Protected</title>
    <meta name="robots" content="noindex, nofollow">
    <style>
        :root{--bg:#050510;--card:rgba(15,15,40,0.85);--red:#ff3366;--blue:#6366f1;--purple:#a855f7;--gold:#f59e0b;--text:#e2e8f0}
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:'Inter',system-ui,sans-serif;background:var(--bg);color:var(--text);min-height:100vh;display:flex;justify-content:center;align-items:center;overflow:hidden;user-select:none;-webkit-user-select:none}
        
        .bg{position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:0}
        .aurora{position:absolute;border-radius:50%;filter:blur(120px);opacity:.4;animation:auroraFloat 25s infinite ease-in-out;mix-blend-mode:screen}
        .aurora-1{width:600px;height:600px;background:radial-gradient(circle at 30% 30%,#ff3366,transparent 70%);top:-200px;left:-150px}
        .aurora-2{width:500px;height:500px;background:radial-gradient(circle at 70% 70%,#6366f1,transparent 70%);bottom:-200px;right:-100px;animation-delay:-8s}
        .aurora-3{width:450px;height:450px;background:radial-gradient(circle at 50% 50%,#a855f7,transparent 70%);top:40%;left:50%;transform:translate(-50%,-50%);animation-delay:-16s}
        @keyframes auroraFloat{0%,100%{transform:translate(0,0)scale(1)rotate(0deg)}25%{transform:translate(80px,-60px)scale(1.15)rotate(3deg)}50%{transform:translate(-40px,80px)scale(.9)rotate(-2deg)}75%{transform:translate(-100px,-30px)scale(1.1)rotate(1deg)}}
        
        .grid{position:fixed;top:0;left:0;width:100%;height:100%;background-image:linear-gradient(rgba(99,102,241,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(99,102,241,.04) 1px,transparent 1px);background-size:50px 50px;z-index:0;pointer-events:none;animation:gridShift 15s linear infinite}
        @keyframes gridShift{0%{transform:translate(0,0)}100%{transform:translate(50px,50px)}}
        
        .container{position:relative;z-index:1;width:90%;max-width:480px}
        .card{background:var(--card);backdrop-filter:blur(30px);-webkit-backdrop-filter:blur(30px);border-radius:28px;padding:50px 44px;border:1px solid rgba(255,255,255,.06);box-shadow:0 20px 60px rgba(0,0,0,.5),0 0 0 1px rgba(255,51,102,.08)inset,0 0 150px rgba(255,51,102,.06);animation:cardEnter .8s cubic-bezier(.16,1,.3,1);position:relative;overflow:hidden}
        .card::before{content:'';position:absolute;top:-1px;left:-1px;right:-1px;height:2px;background:linear-gradient(90deg,transparent,rgba(255,51,102,.3)20%,rgba(99,102,241,.5)40%,rgba(168,85,247,.5)60%,rgba(245,158,11,.3)80%,transparent);animation:borderShine 4s ease-in-out infinite;z-index:2}
        @keyframes cardEnter{0%{opacity:0;transform:translateY(40px)scale(.92)}100%{opacity:1;transform:translateY(0)scale(1)}}
        @keyframes borderShine{0%,100%{transform:translateX(-100%)}50%{transform:translateX(100%)}}
        
        .shield-wrapper{position:relative;display:inline-block;margin-bottom:30px}
        .shield-icon{width:90px;height:90px;position:relative;z-index:1;animation:shieldFloat 3s ease-in-out infinite;filter:drop-shadow(0 0 30px rgba(255,51,102,.4))}
        @keyframes shieldFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
        
        .title-section{text-align:center;margin-bottom:30px}
        .main-title{font-size:1.3rem;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:#94a3b8;margin-bottom:6px}
        .gradient-title{font-size:2.8rem;font-weight:900;letter-spacing:-.02em;line-height:1;background:linear-gradient(135deg,#ff3366,#ff6b81 25%,#a855f7 50%,#6366f1 75%,#ff3366);background-size:300% 300%;-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;animation:gradientFlow 4s ease-in-out infinite}
        @keyframes gradientFlow{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}
        
        .divider{display:flex;align-items:center;gap:16px;margin:28px 0}
        .divider-line{flex:1;height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.08),transparent)}
        .divider-diamond{width:8px;height:8px;background:#ff3366;transform:rotate(45deg);box-shadow:0 0 12px rgba(255,51,102,.5);animation:diamondPulse 2s ease-in-out infinite}
        @keyframes diamondPulse{0%,100%{box-shadow:0 0 12px rgba(255,51,102,.5);transform:rotate(45deg)scale(1)}50%{box-shadow:0 0 25px #ff3366;transform:rotate(45deg)scale(1.5)}}
        
        .message-box{background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.05);border-radius:16px;padding:20px 24px;text-align:center}
        .message-text{font-size:.95rem;color:#94a3b8;line-height:1.7}
        .highlight{color:#f59e0b;font-weight:600}
        
        .status-row{display:flex;justify-content:center;gap:30px;margin-top:24px}
        .status-item{display:flex;align-items:center;gap:8px;font-size:.7rem;text-transform:uppercase;letter-spacing:.15em;color:#475569}
        .status-bar{width:24px;height:2px;background:rgba(255,255,255,.08);border-radius:1px;overflow:hidden}
        .status-fill{height:100%;border-radius:1px;animation:barPulse 2s ease-in-out infinite}
        .status-fill.red{background:#ff3366;box-shadow:0 0 6px #ff3366;width:100%}
        .status-fill.purple{background:#a855f7;box-shadow:0 0 6px #a855f7;width:80%;animation-delay:.5s}
        .status-fill.blue{background:#6366f1;box-shadow:0 0 6px #6366f1;width:100%;animation-delay:1s}
        @keyframes barPulse{0%,100%{opacity:.6}50%{opacity:1}}
        
        .btn{display:flex;align-items:center;justify-content:center;gap:12px;width:100%;padding:16px 24px;margin-top:28px;background:linear-gradient(135deg,rgba(255,51,102,.08),rgba(99,102,241,.08));border:1px solid rgba(255,51,102,.2);border-radius:16px;color:#e2e8f0;text-decoration:none;font-weight:600;font-size:.95rem;transition:all .4s;cursor:pointer}
        .btn:hover{background:linear-gradient(135deg,rgba(255,51,102,.15),rgba(99,102,241,.15));border-color:rgba(255,51,102,.4);transform:translateY(-3px);box-shadow:0 12px 30px rgba(0,0,0,.3),0 0 40px rgba(255,51,102,.1)}
        
        .footer{text-align:center;margin-top:24px;font-size:.6rem;letter-spacing:.25em;text-transform:uppercase;color:#334155}
        .footer-dot{display:inline-block;width:3px;height:3px;background:#ff3366;border-radius:50%;margin:0 6px;animation:dotBlink 2s infinite}
        @keyframes dotBlink{0%,100%{opacity:.3}50%{opacity:1}}
        
        .devtools-warning{display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:#050510;z-index:9999;justify-content:center;align-items:center;font-size:2rem;color:#ff3366;text-align:center;flex-direction:column;gap:16px}
        
        @media(max-width:600px){.card{padding:36px 24px;border-radius:22px}.gradient-title{font-size:2rem}.main-title{font-size:1rem}.shield-icon{width:70px;height:70px}.status-row{gap:16px}}
    </style>
</head>
<body>
    <div class="bg">
        <div class="aurora aurora-1"></div>
        <div class="aurora aurora-2"></div>
        <div class="aurora aurora-3"></div>
    </div>
    <div class="grid"></div>

    <div class="container">
        <div class="card">
            <div style="text-align:center">
                <div class="shield-wrapper">
                    <svg class="shield-icon" viewBox="0 0 24 24" fill="none">
                        <defs>
                            <linearGradient id="sg" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" style="stop-color:#ff3366"/>
                                <stop offset="50%" style="stop-color:#a855f7"/>
                                <stop offset="100%" style="stop-color:#6366f1"/>
                            </linearGradient>
                        </defs>
                        <circle cx="12" cy="12" r="11" stroke="url(#sg)" stroke-width="0.5" opacity="0.3" fill="none">
                            <animate attributeName="r" from="11" to="12" dur="2s" repeatCount="indefinite" direction="alternate"/>
                        </circle>
                        <path d="M12 2L3 6v6c0 4.4 3.6 8 9 10 5.4-2 9-5.6 9-10V6L12 2z" fill="none" stroke="url(#sg)" stroke-width="1.5"/>
                        <path d="M8 12l3 3 5-5" fill="none" stroke="#22d3ee" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </div>
            </div>

            <div class="title-section">
                <div class="main-title">System</div>
                <div class="gradient-title">PROTECTED</div>
            </div>

            <div class="divider">
                <div class="divider-line"></div>
                <div class="divider-diamond"></div>
                <div class="divider-line"></div>
            </div>

            <div class="message-box">
                <p class="message-text">This endpoint is secured by <span class="highlight">APEX HUB</span>.<br>Access is restricted to authorized executors only.</p>
            </div>

            <div class="status-row">
                <div class="status-item">
                    <div class="status-bar"><div class="status-fill red"></div></div>
                    <span>Encrypted</span>
                </div>
                <div class="status-item">
                    <div class="status-bar"><div class="status-fill purple"></div></div>
                    <span>Protected</span>
                </div>
                <div class="status-item">
                    <div class="status-bar"><div class="status-fill blue"></div></div>
                    <span>Secure</span>
                </div>
            </div>

            <a href="https://code-editor-apex-ccmf.vercel.app/" class="btn" target="_blank" rel="noopener">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                Open APEX HUB Editor
            </a>

            <div class="footer">
                <span class="footer-dot"></span> APEX HUB Protection System <span class="footer-dot"></span>
            </div>
        </div>
    </div>

    <div class="devtools-warning" id="dw">
        <div style="font-size:5rem">🔒</div>
        <div>SECURITY BREACH</div>
        <div style="font-size:1rem;color:#64748b">DevTools is forbidden</div>
    </div>

    <script>
        (function(){
            var dt=!1;
            setInterval(function(){
                var w=window.outerWidth-window.innerWidth>160;
                var h=window.outerHeight-window.innerHeight>160;
                if(w||h){if(!dt){dt=!0;document.getElementById('dw').style.display='flex';document.querySelector('.container').style.display='none'}}
                else{if(dt){dt=!1;document.getElementById('dw').style.display='none';document.querySelector('.container').style.display='block'}}
            },500);
            document.addEventListener('contextmenu',function(e){e.preventDefault()});
            document.addEventListener('keydown',function(e){if(e.key==='F12'||(e.ctrlKey&&e.shiftKey&&e.key==='I')||(e.ctrlKey&&e.key==='U'))e.preventDefault()});
            var n=function(){};
            console.log=n;console.warn=n;console.error=n;console.clear=n;
            setInterval(function(){debugger},100);
        })();
    </script>
</body>
</html>`;
}

function getWelcomePage(host) {
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>APEX HUB | Raw API</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;background:#0a0a1a;color:#e0e0ff;min-height:100vh;display:flex;justify-content:center;align-items:center}.card{background:rgba(21,21,48,0.9);border-radius:24px;padding:48px;border:1px solid rgba(102,126,234,0.15);text-align:center;max-width:500px}h1{font-size:2rem;margin-bottom:16px}.gradient{background:linear-gradient(135deg,#667eea,#764ba2);-webkit-background-clip:text;-webkit-text-fill-color:transparent}p{color:#666;margin-bottom:24px}.endpoints{text-align:left;background:rgba(0,0,0,0.2);border-radius:12px;padding:20px}.ep{display:flex;gap:12px;padding:8px 0;font-family:monospace;font-size:.85rem}.post{color:#00d25b;font-weight:700;min-width:50px}.put{color:#ffa502;font-weight:700;min-width:50px}.get{color:#667eea;font-weight:700;min-width:50px}.del{color:#ff4757;font-weight:700;min-width:50px}.path{color:#888}</style>
</head><body><div class="card"><h1>🚀 <span class="gradient">APEX HUB</span></h1><p>Raw API Service</p><div class="endpoints"><div class="ep"><span class="post">POST</span><span class="path">/api/raw</span></div><div class="ep"><span class="put">PUT</span><span class="path">/api/raw</span></div><div class="ep"><span class="get">GET</span><span class="path">/api/raw?name=script</span></div><div class="ep"><span class="del">DEL</span><span class="path">/api/raw?name=script</span></div></div></div></body></html>`;
}

function getErrorPage(name) {
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>404 | APEX HUB</title>
<style>*{margin:0;padding:0}body{font-family:system-ui;background:#0a0a1a;color:#e0e0ff;min-height:100vh;display:flex;justify-content:center;align-items:center}.card{background:rgba(21,21,48,0.9);border-radius:24px;padding:48px;text-align:center}.err{font-size:6rem;font-weight:900;background:linear-gradient(135deg,#ff4757,#ff6b81);-webkit-background-clip:text;-webkit-text-fill-color:transparent}h2{margin:16px 0;color:#ff4757}p{color:#666}</style>
</head><body><div class="card"><div class="err">404</div><h2>Script Not Found</h2><p>"${name}"</p></div></body></html>`;
}

function getBannedPage() {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Banned | APEX HUB</title>
<style>*{margin:0;padding:0}body{font-family:system-ui;background:#0a0a1a;color:#e0e0ff;display:flex;justify-content:center;align-items:center;height:100vh}.card{background:rgba(21,21,48,0.9);border-radius:24px;padding:48px;text-align:center}h1{color:#ff4757;font-size:3rem}p{color:#888;margin-top:16px}</style>
</head><body><div class="card"><h1>🚫 BANNED</h1><p>Your IP has been temporarily banned.</p></div></body></html>`;
}

function getRateLimitPage() {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Rate Limited | APEX HUB</title>
<style>*{margin:0;padding:0}body{font-family:system-ui;background:#0a0a1a;color:#e0e0ff;display:flex;justify-content:center;align-items:center;height:100vh}.card{background:rgba(21,21,48,0.9);border-radius:24px;padding:48px;text-align:center}h1{color:#ffa502;font-size:3rem}p{color:#888;margin-top:16px}</style>
</head><body><div class="card"><h1>⏳ RATE LIMITED</h1><p>Too many requests. Please wait.</p></div></body></html>`;
}
