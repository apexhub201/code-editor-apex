// ============================================================
// api/raw.js - APEX HUB COMPLETE PROTECTION SYSTEM
// ============================================================

global.scripts = global.scripts || {};
global.challenges = global.challenges || {};
global.rateLimits = global.rateLimits || {};
global.bannedIPs = global.bannedIPs || {};

export default function handler(req, res) {
    // CORS Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Challenge-Token, X-Challenge-Answer, X-Auth-Key');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // ========== ROUTING ==========
    if (req.method === 'GET') return handleGet(req, res);
    if (req.method === 'POST') return handleCreate(req, res);
    if (req.method === 'PUT') return handleUpdate(req, res);
    if (req.method === 'DELETE') return handleDelete(req, res);

    return res.status(405).json({ error: 'Method not allowed' });
}

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

function checkRateLimit(ip) {
    const now = Date.now();
    const windowMs = 60000;
    const maxRequests = 30;

    if (!global.rateLimits[ip]) {
        global.rateLimits[ip] = { count: 0, resetTime: now + windowMs };
    }
    if (now > global.rateLimits[ip].resetTime) {
        global.rateLimits[ip] = { count: 0, resetTime: now + windowMs };
    }
    global.rateLimits[ip].count++;
    return global.rateLimits[ip].count <= maxRequests;
}

function getRandomVarName() {
    return '_' + generateRandomKey(8);
}

// ============================================================
// ANTI-DUMP LOADER GENERATOR
// ============================================================

function generateAntiDumpLoader(encryptedPayload, host) {
    const v = {
        decrypt: getRandomVarName(),
        payload: getRandomVarName(),
        key: getRandomVarName(),
        result: getRandomVarName(),
        func: getRandomVarName(),
        exec: getRandomVarName(),
        cleanup: getRandomVarName(),
        main: getRandomVarName(),
        ok: getRandomVarName(),
        res: getRandomVarName()
    };

    return `
--[[ APEX HUB - Protected Loader ]]--
local ${v.payload} = {${encryptedPayload.data.join(',')}}
local ${v.key} = "${encryptedPayload.key}"

local function ${v.cleanup}()
    local _n = function() end
    print = _n; warn = _n; error = _n
    if writefile then writefile = function() end end
    if readfile then readfile = function() return "" end end
    if appendfile then appendfile = function() end end
    if listfiles then listfiles = function() return {} end end
    if isfile then isfile = function() return false end end
    if loadfile then loadfile = function() error("Blocked",0) end end
    if dofile then dofile = function() error("Blocked",0) end end
    if getgc then getgc = function() return {} end end
    if getconstants then getconstants = function() return {} end end
    if getinfo then getinfo = function() return nil end end
    if getproto then getproto = function() return nil end end
    if getstack then getstack = function() return nil end end
    if getupvalue then getupvalue = function() return nil end end
    if getupvalues then getupvalues = function() return {} end end
    if dumpstring then dumpstring = function() return "" end end
    if decompile then decompile = function() return "" end end
    if hookfunction then hookfunction = function(f,h) return f end end
    if hookmetamethod then hookmetamethod = function() return function() end end end
    if newcclosure then newcclosure = function(f) return f end end
    if debug then
        pcall(function() debug.getinfo = function() return nil end end)
        pcall(function() debug.getupvalue = function() return nil end end)
        pcall(function() debug.getconstants = function() return {} end end)
        pcall(function() debug.getproto = function() return nil end end)
        pcall(function() debug.traceback = function() return "" end end)
    end
    if getfenv then getfenv = function() return {} end end
    if setfenv then setfenv = function() end end
    if getgenv then getgenv = function() return {} end end
    if getrawmetatable then getrawmetatable = function() return nil end end
    if setreadonly then setreadonly = function() end end
    collectgarbage("collect")
end

local function ${v.decrypt}(data, key)
    local ${v.result} = {}
    for i = 1, #data do
        local byte = data[i]
        local keyByte = string.byte(key, (i - 1) % #key + 1)
        ${v.result}[i] = string.char(bit32.bxor(byte, keyByte))
    end
    return table.concat(${v.result})
end

local function ${v.main}()
    ${v.cleanup}()
    local ${v.exec} = ${v.decrypt}(${v.payload}, ${v.key})
    ${v.payload} = nil
    ${v.key} = nil
    collectgarbage("collect")
    
    local ${v.func}, err = loadstring(${v.exec})
    ${v.exec} = nil
    collectgarbage("collect")
    collectgarbage("collect")
    
    if not ${v.func} then while true do end end
    
    local success, result = pcall(${v.func})
    ${v.func} = nil
    collectgarbage("collect")
    collectgarbage("collect")
    
    if not success then while true do end end
    return result
end

local ${v.ok}, ${v.res} = pcall(${v.main})
if not ${v.ok} then while true do end end
`;
}

// ============================================================
// HANDLE GET
// ============================================================

function handleGet(req, res) {
    const { name, key, raw, challenge, answer } = req.query;
    const ua = (req.headers['user-agent'] || '').toLowerCase();
    const clientIP = req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown';
    const authKey = req.headers['x-auth-key'] || '';

    // IP Ban Check
    if (global.bannedIPs[clientIP] && Date.now() < global.bannedIPs[clientIP]) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(403).send(getBannedPage());
    }

    // Rate Limiting
    if (!checkRateLimit(clientIP)) {
        global.bannedIPs[clientIP] = Date.now() + 300000;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(429).send(getRateLimitPage());
    }

    // No name -> Welcome
    if (!name) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(getWelcomePage(req.headers.host));
    }

    // Script not found -> 404
    if (!global.scripts[name]) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(404).send(getErrorPage(name));
    }

    global.scripts[name].lastAccessed = Date.now();

    // Valid Key -> Encrypted payload
    const VALID_KEYS = ['d0egkw6en9eusrjje5vn70p2tvkngkkn', 'apex-master-key-2024'];
    const hasValidKey = VALID_KEYS.includes(key) || VALID_KEYS.includes(authKey);
    const wantsRaw = raw === 'true';

    if (hasValidKey || wantsRaw) {
        const payload = encryptPayload(global.scripts[name].code);
        return res.json({
            success: true,
            protected: true,
            payload: payload.data,
            decryptKey: payload.key,
            checksum: payload.checksum
        });
    }

    // Executor Detection -> Anti-Dump Loader
    const executorPatterns = [
        'roblox', 'synapse', 'krnl', 'script-ware', 'sentinel',
        'fluxus', 'electron', 'comet', 'oxygen', 'valyse',
        'hydrogen', 'codex', 'vega', 'trigon', 'nexus',
        'solara', 'jjsploit', 'celestial', 'evon', 'aris'
    ];
    const isExecutor = executorPatterns.some(p => ua.includes(p));

    if (isExecutor) {
        const payload = encryptPayload(global.scripts[name].code);
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        return res.send(generateAntiDumpLoader(payload, req.headers.host));
    }

    // Challenge Response
    if (challenge && answer) {
        const c = global.challenges[challenge];
        if (c && !c.used && Date.now() - c.createdAt < 60000) {
            if (answer === c.answer) {
                c.used = true;
                const payload = encryptPayload(global.scripts[name].code);
                return res.json({
                    success: true,
                    payload: payload.data,
                    decryptKey: payload.key
                });
            } else {
                c.attempts = (c.attempts || 0) + 1;
                if (c.attempts >= 3) {
                    global.bannedIPs[clientIP] = Date.now() + 600000;
                }
            }
        }
    }

    // Browser -> Protection Page
    const isBrowser = ua.includes('mozilla') || ua.includes('chrome') ||
                      ua.includes('safari') || ua.includes('firefox') ||
                      ua.includes('edge') || ua.includes('opera');

    if (isBrowser) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        return res.send(getProtectionPage(req.headers.host));
    }

    // Unknown -> Challenge
    const newChallenge = generateChallenge();
    global.challenges[newChallenge.token] = {
        answer: newChallenge.answer,
        createdAt: Date.now(),
        used: false,
        attempts: 0
    };

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
// HANDLE CREATE
// ============================================================

function handleCreate(req, res) {
    try {
        const { code, name } = req.body;
        if (!code || !code.trim()) return res.status(400).json({ success: false, error: 'Code is required' });
        if (!name || !name.trim()) return res.status(400).json({ success: false, error: 'Name is required' });

        const nameSlug = name.trim().toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '') || 'script';

        if (global.scripts[nameSlug]) return res.status(409).json({ success: false, error: 'Script name already exists' });

        global.scripts[nameSlug] = {
            code: code,
            name: name.trim(),
            created: Date.now(),
            lastAccessed: Date.now()
        };

        const rawUrl = `https://${req.headers.host}/api/raw?name=${nameSlug}`;
        const rawUrlWithKey = `https://${req.headers.host}/api/raw?name=${nameSlug}&key=d0egkw6en9eusrjje5vn70p2tvkngkkn`;

        return res.status(200).json({
            success: true,
            raw: rawUrl,
            rawWithKey: rawUrlWithKey,
            name: nameSlug
        });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
}

// ============================================================
// HANDLE UPDATE
// ============================================================

function handleUpdate(req, res) {
    try {
        const { name, code } = req.body;
        if (!name || !global.scripts[name]) return res.status(404).json({ success: false, error: 'Script not found' });
        if (!code || !code.trim()) return res.status(400).json({ success: false, error: 'Code is required' });

        global.scripts[name].code = code;
        global.scripts[name].updated = Date.now();
        global.scripts[name].lastAccessed = Date.now();

        const rawUrl = `https://${req.headers.host}/api/raw?name=${name}`;
        return res.status(200).json({ success: true, message: 'Updated successfully', raw: rawUrl, name: name });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
}

// ============================================================
// HANDLE DELETE
// ============================================================

function handleDelete(req, res) {
    const { name } = req.query;
    if (name && global.scripts[name]) {
        delete global.scripts[name];
        return res.status(200).json({ success: true, message: 'Deleted' });
    }
    return res.status(404).json({ success: false, error: 'Script not found' });
}

// ============================================================
// PROTECTION PAGE (ANIMATION CỰC ĐẸP)
// ============================================================

function getProtectionPage(host) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>APEX HUB | Protected System</title>
    <meta name="robots" content="noindex, nofollow">
    <style>
        :root {
            --bg: #050510;
            --card-bg: rgba(15, 15, 40, 0.85);
            --accent: #ff3366;
            --accent2: #6366f1;
            --gold: #f59e0b;
            --text: #e2e8f0;
            --text-dim: #64748b;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif;
            background: var(--bg);
            color: var(--text);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            overflow: hidden;
            position: relative;
            user-select: none;
            -webkit-user-select: none;
            -webkit-tap-highlight-color: transparent;
        }

        .bg-layer { position: fixed; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 0; }

        .aurora {
            position: absolute;
            border-radius: 50%;
            filter: blur(120px);
            opacity: 0.4;
            animation: auroraFloat 25s infinite ease-in-out;
            mix-blend-mode: screen;
        }

        .aurora-1 {
            width: 600px; height: 600px;
            background: radial-gradient(circle at 30% 30%, #ff3366, #ff336600 70%);
            top: -200px; left: -150px;
        }

        .aurora-2 {
            width: 500px; height: 500px;
            background: radial-gradient(circle at 70% 70%, #6366f1, #6366f100 70%);
            bottom: -200px; right: -100px;
            animation-delay: -8s;
        }

        .aurora-3 {
            width: 450px; height: 450px;
            background: radial-gradient(circle at 50% 50%, #a855f7, #a855f700 70%);
            top: 40%; left: 50%; transform: translate(-50%, -50%);
            animation-delay: -16s;
        }

        .aurora-4 {
            width: 350px; height: 350px;
            background: radial-gradient(circle at 40% 60%, #f59e0b, #f59e0b00 70%);
            top: 20%; right: 15%;
            animation-delay: -5s;
            opacity: 0.25;
        }

        @keyframes auroraFloat {
            0%, 100% { transform: translate(0, 0) scale(1) rotate(0deg); }
            25% { transform: translate(80px, -60px) scale(1.15) rotate(3deg); }
            50% { transform: translate(-40px, 80px) scale(0.9) rotate(-2deg); }
            75% { transform: translate(-100px, -30px) scale(1.1) rotate(1deg); }
        }

        .grid-pattern {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background-image: 
                linear-gradient(rgba(99, 102, 241, 0.04) 1px, transparent 1px),
                linear-gradient(90deg, rgba(99, 102, 241, 0.04) 1px, transparent 1px);
            background-size: 50px 50px;
            z-index: 0; pointer-events: none;
            animation: gridShift 15s linear infinite;
        }

        @keyframes gridShift {
            0% { transform: translate(0, 0); }
            100% { transform: translate(50px, 50px); }
        }

        .particles { position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 0; pointer-events: none; }

        .particle {
            position: absolute;
            border-radius: 50%;
            animation: particleRise 10s infinite ease-in-out;
            opacity: 0;
        }

        ${Array.from({length: 30}, (_, i) => {
            const size = Math.random() * 3 + 1;
            const left = Math.random() * 100;
            const delay = Math.random() * 10;
            const duration = 8 + Math.random() * 12;
            const color = ['#ff3366', '#6366f1', '#a855f7', '#f59e0b', '#22d3ee'][Math.floor(Math.random() * 5)];
            return `.particle:nth-child(${i + 1}) { width: ${size}px; height: ${size}px; left: ${left}%; bottom: -20px; background: ${color}; animation-delay: -${delay}s; animation-duration: ${duration}s; box-shadow: 0 0 ${size * 4}px ${color}80; }`;
        }).join('')}

        @keyframes particleRise {
            0% { transform: translateY(0) translateX(0) scale(1); opacity: 0; }
            10% { opacity: 1; }
            50% { transform: translateY(-50vh) translateX(${Math.random() > 0.5 ? '' : '-'}30px) scale(1.5); opacity: 0.6; }
            90% { opacity: 0; }
            100% { transform: translateY(-100vh) translateX(0) scale(0.5); opacity: 0; }
        }

        .container { position: relative; z-index: 1; width: 90%; max-width: 480px; }

        .card {
            background: var(--card-bg);
            backdrop-filter: blur(30px);
            -webkit-backdrop-filter: blur(30px);
            border-radius: 28px;
            padding: 50px 44px;
            border: 1px solid rgba(255, 255, 255, 0.06);
            box-shadow: 0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,51,102,0.08) inset, 0 0 150px rgba(255,51,102,0.06), 0 0 80px rgba(99,102,241,0.04);
            animation: cardEnter 0.8s cubic-bezier(0.16, 1, 0.3, 1);
            position: relative;
            overflow: hidden;
        }

        .card::before {
            content: '';
            position: absolute; top: -1px; left: -1px; right: -1px; height: 2px;
            background: linear-gradient(90deg, transparent 0%, rgba(255,51,102,0.3) 20%, rgba(99,102,241,0.5) 40%, rgba(168,85,247,0.5) 60%, rgba(245,158,11,0.3) 80%, transparent 100%);
            animation: borderShine 4s ease-in-out infinite;
            z-index: 2;
        }

        .card::after {
            content: '';
            position: absolute; top: 0; left: 0; right: 0; bottom: 0;
            background: radial-gradient(ellipse at 50% 0%, rgba(255,51,102,0.06), transparent 60%), radial-gradient(ellipse at 80% 100%, rgba(99,102,241,0.04), transparent 60%);
            pointer-events: none;
        }

        @keyframes cardEnter {
            0% { opacity: 0; transform: translateY(40px) scale(0.92); }
            100% { opacity: 1; transform: translateY(0) scale(1); }
        }

        @keyframes borderShine {
            0%, 100% { transform: translateX(-100%); }
            50% { transform: translateX(100%); }
        }

        .shield-wrapper { position: relative; display: inline-block; margin-bottom: 30px; }

        .shield-outer-ring {
            position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
            width: 120px; height: 120px;
            border-radius: 50%;
            border: 2px solid rgba(255, 51, 102, 0.15);
            animation: ringRotate 10s linear infinite;
        }

        .shield-outer-ring::before {
            content: '';
            position: absolute; top: -2px; left: 50%;
            width: 6px; height: 6px;
            background: #ff3366;
            border-radius: 50%;
            box-shadow: 0 0 15px #ff3366, 0 0 30px #ff3366;
            transform: translateX(-50%);
        }

        @keyframes ringRotate {
            0% { transform: translate(-50%, -50%) rotate(0deg); }
            100% { transform: translate(-50%, -50%) rotate(360deg); }
        }

        .shield-icon {
            width: 90px; height: 90px;
            position: relative; z-index: 1;
            animation: shieldFloat 3s ease-in-out infinite;
            filter: drop-shadow(0 0 30px rgba(255, 51, 102, 0.4));
        }

        @keyframes shieldFloat {
            0%, 100% { transform: translateY(0); filter: drop-shadow(0 0 30px rgba(255,51,102,0.4)); }
            50% { transform: translateY(-8px); filter: drop-shadow(0 0 50px rgba(255,51,102,0.7)); }
        }

        .pulse-ring {
            position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
            border-radius: 50%;
            border: 1px solid rgba(255, 51, 102, 0.3);
            animation: pulseExpand 3s ease-out infinite;
        }

        .pulse-ring:nth-child(2) { animation-delay: 0.5s; }
        .pulse-ring:nth-child(3) { animation-delay: 1s; }
        .pulse-ring:nth-child(4) { animation-delay: 1.5s; }

        @keyframes pulseExpand {
            0% { width: 90px; height: 90px; opacity: 1; }
            100% { width: 200px; height: 200px; opacity: 0; }
        }

        .title-section { text-align: center; margin-bottom: 30px; }

        .main-title {
            font-size: 1.3rem; font-weight: 700;
            letter-spacing: 0.2em; text-transform: uppercase;
            color: #94a3b8; margin-bottom: 6px;
        }

        .gradient-title {
            font-size: 2.8rem; font-weight: 900;
            letter-spacing: -0.02em; line-height: 1;
            background: linear-gradient(135deg, #ff3366 0%, #ff6b81 25%, #a855f7 50%, #6366f1 75%, #ff3366 100%);
            background-size: 300% 300%;
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            animation: gradientFlow 4s ease-in-out infinite;
            filter: drop-shadow(0 0 20px rgba(255, 51, 102, 0.3));
        }

        @keyframes gradientFlow {
            0%, 100% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
        }

        .divider-container { display: flex; align-items: center; gap: 16px; margin: 28px 0; }

        .divider-line { flex: 1; height: 1px; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent); }

        .divider-diamond {
            width: 8px; height: 8px;
            background: #ff3366;
            transform: rotate(45deg);
            box-shadow: 0 0 12px #ff336680;
            animation: diamondPulse 2s ease-in-out infinite;
        }

        @keyframes diamondPulse {
            0%, 100% { box-shadow: 0 0 12px #ff336680; transform: rotate(45deg) scale(1); }
            50% { box-shadow: 0 0 25px #ff3366; transform: rotate(45deg) scale(1.5); }
        }

        .message-box {
            background: rgba(255,255,255,0.02);
            border: 1px solid rgba(255,255,255,0.05);
            border-radius: 16px;
            padding: 20px 24px;
            text-align: center;
            position: relative;
            overflow: hidden;
        }

        .message-box::before {
            content: '';
            position: absolute; top: 0; left: 0; right: 0; bottom: 0;
            background: linear-gradient(135deg, rgba(255,51,102,0.03) 0%, transparent 50%, rgba(99,102,241,0.03) 100%);
            pointer-events: none;
        }

        .message-text { font-size: 0.95rem; color: #94a3b8; line-height: 1.7; letter-spacing: 0.02em; }

        .message-highlight { color: #f59e0b; font-weight: 600; }

        .lock-icon-row { display: flex; justify-content: center; gap: 20px; margin-top: 16px; }

        .lock-dot {
            width: 4px; height: 4px;
            border-radius: 50%;
            background: #ff3366;
            animation: dotBlink 1.5s ease-in-out infinite;
        }

        .lock-dot:nth-child(2) { animation-delay: 0.3s; background: #a855f7; }
        .lock-dot:nth-child(3) { animation-delay: 0.6s; background: #6366f1; }

        @keyframes dotBlink {
            0%, 100% { opacity: 0.3; transform: scale(1); }
            50% { opacity: 1; transform: scale(1.8); }
        }

        .status-row { display: flex; justify-content: center; gap: 30px; margin-top: 24px; }

        .status-item {
            display: flex; align-items: center; gap: 8px;
            font-size: 0.7rem; text-transform: uppercase;
            letter-spacing: 0.15em; color: #475569;
        }

        .status-bar-container {
            width: 24px; height: 2px;
            background: rgba(255,255,255,0.08);
            border-radius: 1px;
            overflow: hidden;
        }

        .status-bar-fill { height: 100%; border-radius: 1px; animation: barPulse 2s ease-in-out infinite; }

        .status-bar-fill.red { background: #ff3366; box-shadow: 0 0 6px #ff3366; width: 100%; }
        .status-bar-fill.purple { background: #a855f7; box-shadow: 0 0 6px #a855f7; width: 80%; animation-delay: 0.5s; }
        .status-bar-fill.blue { background: #6366f1; box-shadow: 0 0 6px #6366f1; width: 100%; animation-delay: 1s; }

        @keyframes barPulse {
            0%, 100% { opacity: 0.6; }
            50% { opacity: 1; }
        }

        .action-button {
            display: flex; align-items: center; justify-content: center; gap: 12px;
            width: 100%; padding: 16px 24px; margin-top: 28px;
            background: linear-gradient(135deg, rgba(255,51,102,0.08), rgba(99,102,241,0.08));
            border: 1px solid rgba(255,51,102,0.2);
            border-radius: 16px;
            color: #e2e8f0;
            text-decoration: none;
            font-weight: 600; font-size: 0.95rem; letter-spacing: 0.03em;
            transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
            position: relative; overflow: hidden; cursor: pointer;
        }

        .action-button::before {
            content: '';
            position: absolute; top: 0; left: -100%; width: 100%; height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent);
            transition: left 0.6s ease;
        }

        .action-button:hover {
            background: linear-gradient(135deg, rgba(255,51,102,0.15), rgba(99,102,241,0.15));
            border-color: rgba(255,51,102,0.4);
            transform: translateY(-3px);
            box-shadow: 0 12px 30px rgba(0,0,0,0.3), 0 0 40px rgba(255,51,102,0.1);
        }

        .action-button:hover::before { left: 100%; }

        .button-icon { width: 20px; height: 20px; transition: transform 0.4s ease; }

        .action-button:hover .button-icon { transform: rotate(-10deg) scale(1.1); }

        .footer-text {
            text-align: center; margin-top: 24px;
            font-size: 0.6rem; letter-spacing: 0.25em;
            text-transform: uppercase; color: #334155;
        }

        .footer-dot {
            display: inline-block; width: 3px; height: 3px;
            background: #ff3366; border-radius: 50%;
            margin: 0 6px; vertical-align: middle;
            animation: dotBlink 2s ease-in-out infinite;
        }

        .devtools-warning {
            display: none;
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: #050510; z-index: 9999;
            justify-content: center; align-items: center;
            font-size: 2rem; color: #ff3366; text-align: center;
            flex-direction: column; gap: 16px;
        }

        @media (max-width: 600px) {
            .card { padding: 36px 24px; border-radius: 22px; }
            .gradient-title { font-size: 2rem; }
            .main-title { font-size: 1rem; }
            .shield-icon { width: 70px; height: 70px; }
            .shield-outer-ring { width: 100px; height: 100px; }
            .status-row { gap: 16px; }
        }
    </style>
</head>
<body>
    <div class="bg-layer">
        <div class="aurora aurora-1"></div>
        <div class="aurora aurora-2"></div>
        <div class="aurora aurora-3"></div>
        <div class="aurora aurora-4"></div>
    </div>
    <div class="grid-pattern"></div>
    <div class="particles">
        ${Array.from({length: 30}, () => '<div class="particle"></div>').join('')}
    </div>

    <div class="container">
        <div class="card">
            <div style="text-align: center;">
                <div class="shield-wrapper">
                    <div class="shield-outer-ring"></div>
                    <div class="pulse-ring"></div>
                    <div class="pulse-ring"></div>
                    <div class="pulse-ring"></div>
                    <div class="pulse-ring"></div>
                    <svg class="shield-icon" viewBox="0 0 24 24" fill="none">
                        <defs>
                            <linearGradient id="sg" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" style="stop-color:#ff3366"/>
                                <stop offset="50%" style="stop-color:#a855f7"/>
                                <stop offset="100%" style="stop-color:#6366f1"/>
                            </linearGradient>
                            <filter id="glow">
                                <feGaussianBlur stdDeviation="2" result="blur"/>
                                <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                            </filter>
                        </defs>
                        <circle cx="12" cy="12" r="11" stroke="url(#sg)" stroke-width="0.5" opacity="0.3" fill="none">
                            <animate attributeName="r" from="11" to="12" dur="2s" repeatCount="indefinite" direction="alternate"/>
                            <animate attributeName="opacity" from="0.3" to="0.5" dur="2s" repeatCount="indefinite" direction="alternate"/>
                        </circle>
                        <path d="M12 2L3 6v6c0 4.4 3.6 8 9 10 5.4-2 9-5.6 9-10V6L12 2z" fill="none" stroke="url(#sg)" stroke-width="1.5" filter="url(#glow)">
                            <animate attributeName="stroke-opacity" from="0.8" to="1" dur="1.5s" repeatCount="indefinite" direction="alternate"/>
                        </path>
                        <path d="M8 12l3 3 5-5" fill="none" stroke="#22d3ee" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="20" stroke-dashoffset="20">
                            <animate attributeName="stroke-dashoffset" from="20" to="0" dur="0.6s" begin="0.4s" fill="freeze"/>
                        </path>
                    </svg>
                </div>
            </div>

            <div class="title-section">
                <div class="main-title">System</div>
                <div class="gradient-title">PROTECTED</div>
            </div>

            <div class="divider-container">
                <div class="divider-line"></div>
                <div class="divider-diamond"></div>
                <div class="divider-line"></div>
            </div>

            <div class="message-box">
                <p class="message-text">This endpoint is secured by <span class="message-highlight">APEX HUB</span>.<br>Access is restricted to authorized executors only.</p>
                <div class="lock-icon-row">
                    <div class="lock-dot"></div>
                    <div class="lock-dot"></div>
                    <div class="lock-dot"></div>
                </div>
            </div>

            <div class="status-row">
                <div class="status-item">
                    <div class="status-bar-container"><div class="status-bar-fill red"></div></div>
                    <span>Encrypted</span>
                </div>
                <div class="status-item">
                    <div class="status-bar-container"><div class="status-bar-fill purple"></div></div>
                    <span>Protected</span>
                </div>
                <div class="status-item">
                    <div class="status-bar-container"><div class="status-bar-fill blue"></div></div>
                    <span>Secure</span>
                </div>
            </div>

            <a href="https://code-editor-apex-ccmf.vercel.app/" class="action-button" target="_blank" rel="noopener">
                <svg class="button-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                Open APEX HUB Editor
                <svg class="button-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;">
                    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                </svg>
            </a>

            <div class="footer-text">
                <span class="footer-dot"></span> APEX HUB Protection System <span class="footer-dot"></span>
            </div>
        </div>
    </div>

    <div class="devtools-warning" id="dw">
        <div style="font-size:5rem;">🔒</div>
        <div>SECURITY BREACH DETECTED</div>
        <div style="font-size:1rem;color:#64748b;">Developer tools access is forbidden</div>
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
            document.addEventListener('keydown',function(e){
                if(e.key==='F12'||(e.ctrlKey&&e.shiftKey&&(e.key==='I'||e.key==='J'))||(e.ctrlKey&&e.key==='U')){e.preventDefault()}
            });
            document.addEventListener('selectstart',function(e){e.preventDefault()});
            var n=function(){};
            console.log=n;console.warn=n;console.error=n;console.clear=n;console.table=n;console.trace=n;console.dir=n;
            setInterval(function(){debugger},100);
        })();
    </script>
</body>
</html>`;
}

// ============================================================
// WELCOME PAGE
// ============================================================

function getWelcomePage(host) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>APEX HUB | Raw API</title>
    <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:system-ui,sans-serif;background:#0a0a1a;color:#e0e0ff;min-height:100vh;display:flex;justify-content:center;align-items:center}
        .card{background:rgba(21,21,48,0.9);border-radius:24px;padding:48px;border:1px solid rgba(102,126,234,0.15);text-align:center;max-width:500px}
        h1{font-size:2rem;margin-bottom:16px}
        .gradient{background:linear-gradient(135deg,#667eea,#764ba2);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
        p{color:#666;margin-bottom:24px}
        .endpoints{text-align:left;background:rgba(0,0,0,0.2);border-radius:12px;padding:20px}
        .ep{display:flex;gap:12px;padding:8px 0;font-family:monospace;font-size:0.85rem}
        .post{color:#00d25b;font-weight:700;min-width:50px}
        .put{color:#ffa502;font-weight:700;min-width:50px}
        .get{color:#667eea;font-weight:700;min-width:50px}
        .del{color:#ff4757;font-weight:700;min-width:50px}
        .path{color:#888}
    </style>
</head>
<body>
    <div class="card">
        <h1>🚀 <span class="gradient">APEX HUB</span></h1>
        <p>Raw API Service - v1.0</p>
        <div class="endpoints">
            <div class="ep"><span class="post">POST</span><span class="path">/api/raw</span></div>
            <div class="ep"><span class="put">PUT</span><span class="path">/api/raw</span></div>
            <div class="ep"><span class="get">GET</span><span class="path">/api/raw?name=script</span></div>
            <div class="ep"><span class="del">DEL</span><span class="path">/api/raw?name=script</span></div>
        </div>
    </div>
</body>
</html>`;
}

// ============================================================
// ERROR PAGE
// ============================================================

function getErrorPage(name) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>404 | APEX HUB</title>
    <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:system-ui,sans-serif;background:#0a0a1a;color:#e0e0ff;min-height:100vh;display:flex;justify-content:center;align-items:center}
        .card{background:rgba(21,21,48,0.9);border-radius:24px;padding:48px;border:1px solid rgba(255,71,87,0.15);text-align:center}
        .err{font-size:6rem;font-weight:900;background:linear-gradient(135deg,#ff4757,#ff6b81);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
        h2{margin:16px 0;color:#ff4757}
        p{color:#666}
        .name{font-family:monospace;color:#ffa502;margin-top:8px}
    </style>
</head>
<body>
    <div class="card">
        <div class="err">404</div>
        <h2>Script Not Found</h2>
        <p>The script doesn't exist.</p>
        <p class="name">"${name}"</p>
    </div>
</body>
</html>`;
}

// ============================================================
// BANNED PAGE
// ============================================================

function getBannedPage() {
    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Banned | APEX HUB</title>
<style>*{margin:0;padding:0}body{font-family:system-ui;background:#0a0a1a;color:#e0e0ff;display:flex;justify-content:center;align-items:center;height:100vh}.card{background:rgba(21,21,48,0.9);border-radius:24px;padding:48px;border:1px solid rgba(255,71,87,0.3);text-align:center}h1{color:#ff4757;font-size:3rem}p{color:#888;margin-top:16px}</style>
</head><body><div class="card"><h1>🚫 BANNED</h1><p>Your IP has been temporarily banned due to suspicious activity.</p></div></body></html>`;
}

// ============================================================
// RATE LIMIT PAGE
// ============================================================

function getRateLimitPage() {
    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Rate Limited | APEX HUB</title>
<style>*{margin:0;padding:0}body{font-family:system-ui;background:#0a0a1a;color:#e0e0ff;display:flex;justify-content:center;align-items:center;height:100vh}.card{background:rgba(21,21,48,0.9);border-radius:24px;padding:48px;border:1px solid rgba(255,165,2,0.3);text-align:center}h1{color:#ffa502;font-size:3rem}p{color:#888;margin-top:16px}</style>
</head><body><div class="card"><h1>⏳ RATE LIMITED</h1><p>Too many requests. Please wait and try again.</p></div></body></html>`;
}
