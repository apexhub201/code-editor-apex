// ============================================================
// api/raw.js - APEX HUB COMPLETE (CLIENT HOẠT ĐỘNG ỔN ĐỊNH)
// ============================================================

global.scripts = global.scripts || {};
global.challenges = global.challenges || {};
global.rateLimits = global.rateLimits || {};
global.bannedIPs = global.bannedIPs || {};

export default function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Challenge-Token, X-Challenge-Answer, X-Auth-Key');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method === 'GET') return handleGet(req, res);
    if (req.method === 'POST') return handleCreate(req, res);
    if (req.method === 'PUT') return handleUpdate(req, res);
    if (req.method === 'DELETE') return handleDelete(req, res);

    return res.status(405).json({ error: 'Method not allowed' });
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
    const key = generateRandomKey(16);
    const encrypted = [];
    for (let i = 0; i < code.length; i++) {
        const charCode = code.charCodeAt(i);
        const keyChar = key.charCodeAt(i % key.length);
        encrypted.push((charCode ^ keyChar) & 0xFF);
    }
    return { data: encrypted, key: key };
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
    if (!global.rateLimits[ip]) {
        global.rateLimits[ip] = { count: 0, resetTime: now + 60000 };
    }
    if (now > global.rateLimits[ip].resetTime) {
        global.rateLimits[ip] = { count: 0, resetTime: now + 60000 };
    }
    global.rateLimits[ip].count++;
    return global.rateLimits[ip].count <= 30;
}

// ============================================================
// LOADER CHO EXECUTOR - NHẸ, ỔN ĐỊNH, KHÔNG CRASH
// ============================================================

function generateLoader(encryptedPayload, host) {
    return `
-- APEX HUB Loader
local _d = {${encryptedPayload.data.join(',')}}
local _k = "${encryptedPayload.key}"

local function _x(data, key)
    local r = {}
    for i = 1, #data do
        local b = data[i]
        local kb = string.byte(key, (i - 1) % #key + 1)
        r[i] = string.char(bit32.bxor(b, kb))
    end
    return table.concat(r)
end

local _c = _x(_d, _k)
_d = nil
_k = nil

local _f, _e = loadstring(_c)
_c = nil

if _f then
    _f()
else
    error(_e or "Compile error")
end

_f = nil
collectgarbage("collect")
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

    // IP Ban
    if (global.bannedIPs[clientIP] && Date.now() < global.bannedIPs[clientIP]) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(403).send(getBannedPage());
    }

    // Rate Limit
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

    // Not found -> 404
    if (!global.scripts[name]) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(404).send(getErrorPage(name));
    }

    global.scripts[name].lastAccessed = Date.now();

    // Valid Key -> Encrypted payload (JSON)
    const VALID_KEYS = ['d0egkw6en9eusrjje5vn70p2tvkngkkn', 'apex-master-key-2024'];
    const hasValidKey = VALID_KEYS.includes(key) || VALID_KEYS.includes(authKey);
    const wantsRaw = raw === 'true';

    if (hasValidKey || wantsRaw) {
        const payload = encryptPayload(global.scripts[name].code);
        return res.json({
            success: true,
            payload: payload.data,
            decryptKey: payload.key
        });
    }

    // Executor -> Loader (raw text)
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
        return res.send(generateLoader(payload, req.headers.host));
    }

    // Challenge
    if (challenge && answer) {
        const c = global.challenges[challenge];
        if (c && !c.used && Date.now() - c.createdAt < 60000) {
            if (answer === c.answer) {
                c.used = true;
                const payload = encryptPayload(global.scripts[name].code);
                return res.json({ success: true, payload: payload.data, decryptKey: payload.key });
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
        challenge: { question: newChallenge.question, token: newChallenge.token }
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
    <title>APEX HUB | Protected</title>
    <meta name="robots" content="noindex, nofollow">
    <style>
        :root {
            --bg: #050510;
            --card-bg: rgba(15, 15, 40, 0.85);
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
            background: var(--bg);
            color: #e2e8f0;
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            overflow: hidden;
            user-select: none;
            -webkit-user-select: none;
        }

        .bg-layer { position: fixed; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 0; }

        .aurora {
            position: absolute;
            border-radius: 50%;
            filter: blur(120px);
            opacity: 0.4;
            mix-blend-mode: screen;
            animation: float 25s infinite ease-in-out;
        }
        .aurora-1 {
            width: 600px; height: 600px;
            background: radial-gradient(circle at 30% 30%, #ff3366, transparent 70%);
            top: -200px; left: -150px;
        }
        .aurora-2 {
            width: 500px; height: 500px;
            background: radial-gradient(circle at 70% 70%, #6366f1, transparent 70%);
            bottom: -200px; right: -100px;
            animation-delay: -8s;
        }
        .aurora-3 {
            width: 450px; height: 450px;
            background: radial-gradient(circle at 50% 50%, #a855f7, transparent 70%);
            top: 40%; left: 50%; transform: translate(-50%, -50%);
            animation-delay: -16s;
        }

        @keyframes float {
            0%, 100% { transform: translate(0, 0) scale(1) rotate(0deg); }
            25% { transform: translate(80px, -60px) scale(1.15) rotate(3deg); }
            50% { transform: translate(-40px, 80px) scale(0.9) rotate(-2deg); }
            75% { transform: translate(-100px, -30px) scale(1.1) rotate(1deg); }
        }

        .grid-pattern {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background-image: 
                linear-gradient(rgba(99,102,241,0.04) 1px, transparent 1px),
                linear-gradient(90deg, rgba(99,102,241,0.04) 1px, transparent 1px);
            background-size: 50px 50px;
            z-index: 0; pointer-events: none;
        }

        .container { position: relative; z-index: 1; width: 90%; max-width: 460px; }

        .card {
            background: var(--card-bg);
            backdrop-filter: blur(30px);
            -webkit-backdrop-filter: blur(30px);
            border-radius: 28px;
            padding: 50px 40px;
            border: 1px solid rgba(255,255,255,0.06);
            box-shadow: 0 20px 60px rgba(0,0,0,0.5), 0 0 150px rgba(255,51,102,0.06);
            animation: appear 0.8s cubic-bezier(0.16, 1, 0.3, 1);
            position: relative;
            overflow: hidden;
        }

        .card::before {
            content: '';
            position: absolute; top: -1px; left: -1px; right: -1px; height: 2px;
            background: linear-gradient(90deg, transparent, rgba(255,51,102,0.4), rgba(99,102,241,0.4), rgba(168,85,247,0.4), transparent);
            animation: shine 4s ease-in-out infinite;
        }

        @keyframes appear {
            from { opacity: 0; transform: translateY(40px) scale(0.92); }
            to { opacity: 1; transform: translateY(0) scale(1); }
        }

        @keyframes shine {
            0%, 100% { transform: translateX(-100%); }
            50% { transform: translateX(100%); }
        }

        .shield-wrapper { position: relative; display: inline-block; margin-bottom: 28px; }

        .shield-outer-ring {
            position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
            width: 120px; height: 120px;
            border-radius: 50%;
            border: 2px solid rgba(255,51,102,0.15);
            animation: rotate 10s linear infinite;
        }

        @keyframes rotate {
            0% { transform: translate(-50%, -50%) rotate(0deg); }
            100% { transform: translate(-50%, -50%) rotate(360deg); }
        }

        .shield-icon {
            width: 85px; height: 85px;
            position: relative; z-index: 1;
            animation: pulse 3s ease-in-out infinite;
            filter: drop-shadow(0 0 25px rgba(255,51,102,0.4));
        }

        @keyframes pulse {
            0%, 100% { transform: translateY(0); filter: drop-shadow(0 0 25px rgba(255,51,102,0.4)); }
            50% { transform: translateY(-6px); filter: drop-shadow(0 0 45px rgba(255,51,102,0.7)); }
        }

        .gradient-title {
            font-size: 2.6rem; font-weight: 900;
            letter-spacing: -0.02em; line-height: 1;
            background: linear-gradient(135deg, #ff3366, #ff6b81, #a855f7, #6366f1, #ff3366);
            background-size: 300% 300%;
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            animation: gradient 4s ease-in-out infinite;
            text-align: center;
            margin-bottom: 8px;
        }

        @keyframes gradient {
            0%, 100% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
        }

        .subtitle {
            text-align: center;
            color: #94a3b8;
            font-size: 0.85rem;
            letter-spacing: 0.15em;
            text-transform: uppercase;
            margin-bottom: 28px;
        }

        .divider {
            display: flex; align-items: center; gap: 14px;
            margin: 24px 0;
        }
        .divider-line {
            flex: 1; height: 1px;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent);
        }
        .diamond {
            width: 8px; height: 8px;
            background: #ff3366;
            transform: rotate(45deg);
            box-shadow: 0 0 12px #ff336680;
            animation: diamond 2s ease-in-out infinite;
        }

        @keyframes diamond {
            0%, 100% { box-shadow: 0 0 12px #ff336680; transform: rotate(45deg) scale(1); }
            50% { box-shadow: 0 0 25px #ff3366; transform: rotate(45deg) scale(1.5); }
        }

        .msg-box {
            background: rgba(255,255,255,0.02);
            border: 1px solid rgba(255,255,255,0.05);
            border-radius: 14px;
            padding: 18px 20px;
            text-align: center;
        }
        .msg-text {
            color: #94a3b8;
            font-size: 0.9rem;
            line-height: 1.7;
        }
        .highlight { color: #f59e0b; font-weight: 600; }

        .dots {
            display: flex; justify-content: center; gap: 16px;
            margin-top: 14px;
        }
        .dot {
            width: 4px; height: 4px;
            border-radius: 50%;
            animation: blink 1.5s ease-in-out infinite;
        }
        .dot:nth-child(1) { background: #ff3366; }
        .dot:nth-child(2) { background: #a855f7; animation-delay: 0.3s; }
        .dot:nth-child(3) { background: #6366f1; animation-delay: 0.6s; }

        @keyframes blink {
            0%, 100% { opacity: 0.3; transform: scale(1); }
            50% { opacity: 1; transform: scale(1.8); }
        }

        .status-row {
            display: flex; justify-content: center; gap: 24px;
            margin-top: 22px;
        }
        .status-item {
            display: flex; align-items: center; gap: 6px;
            font-size: 0.65rem; text-transform: uppercase;
            letter-spacing: 0.12em; color: #475569;
        }
        .bar {
            width: 20px; height: 2px;
            background: rgba(255,255,255,0.08);
            border-radius: 1px;
            overflow: hidden;
        }
        .bar-fill { height: 100%; border-radius: 1px; animation: barPulse 2s ease-in-out infinite; }
        .bar-fill.red { background: #ff3366; width: 100%; box-shadow: 0 0 6px #ff3366; }
        .bar-fill.purple { background: #a855f7; width: 80%; animation-delay: 0.5s; box-shadow: 0 0 6px #a855f7; }
        .bar-fill.blue { background: #6366f1; width: 100%; animation-delay: 1s; box-shadow: 0 0 6px #6366f1; }

        @keyframes barPulse {
            0%, 100% { opacity: 0.6; }
            50% { opacity: 1; }
        }

        .btn {
            display: flex; align-items: center; justify-content: center; gap: 10px;
            width: 100%; padding: 15px;
            margin-top: 26px;
            background: linear-gradient(135deg, rgba(255,51,102,0.08), rgba(99,102,241,0.08));
            border: 1px solid rgba(255,51,102,0.2);
            border-radius: 14px;
            color: #e2e8f0;
            text-decoration: none;
            font-weight: 600; font-size: 0.9rem;
            transition: all 0.4s;
            cursor: pointer;
        }
        .btn:hover {
            background: linear-gradient(135deg, rgba(255,51,102,0.15), rgba(99,102,241,0.15));
            border-color: rgba(255,51,102,0.4);
            transform: translateY(-3px);
            box-shadow: 0 12px 30px rgba(0,0,0,0.3), 0 0 40px rgba(255,51,102,0.1);
        }

        .footer {
            text-align: center; margin-top: 22px;
            font-size: 0.6rem; letter-spacing: 0.2em;
            text-transform: uppercase; color: #334155;
        }

        @media (max-width: 600px) {
            .card { padding: 36px 24px; }
            .gradient-title { font-size: 2rem; }
            .shield-icon { width: 65px; height: 65px; }
            .shield-outer-ring { width: 100px; height: 100px; }
        }
    </style>
</head>
<body>
    <div class="bg-layer">
        <div class="aurora aurora-1"></div>
        <div class="aurora aurora-2"></div>
        <div class="aurora aurora-3"></div>
    </div>
    <div class="grid-pattern"></div>

    <div class="container">
        <div class="card">
            <div style="text-align:center;">
                <div class="shield-wrapper">
                    <div class="shield-outer-ring"></div>
                    <svg class="shield-icon" viewBox="0 0 24 24" fill="none">
                        <defs>
                            <linearGradient id="sg" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" style="stop-color:#ff3366"/>
                                <stop offset="50%" style="stop-color:#a855f7"/>
                                <stop offset="100%" style="stop-color:#6366f1"/>
                            </linearGradient>
                        </defs>
                        <path d="M12 2L3 6v6c0 4.4 3.6 8 9 10 5.4-2 9-5.6 9-10V6L12 2z" fill="none" stroke="url(#sg)" stroke-width="1.5"/>
                        <path d="M8 12l3 3 5-5" fill="none" stroke="#22d3ee" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </div>
            </div>

            <div class="gradient-title">PROTECTED</div>
            <div class="subtitle">System Secured</div>

            <div class="divider">
                <div class="divider-line"></div>
                <div class="diamond"></div>
                <div class="divider-line"></div>
            </div>

            <div class="msg-box">
                <p class="msg-text">This endpoint is secured by <span class="highlight">APEX HUB</span>.<br>Access restricted to authorized executors only.</p>
                <div class="dots">
                    <div class="dot"></div>
                    <div class="dot"></div>
                    <div class="dot"></div>
                </div>
            </div>

            <div class="status-row">
                <div class="status-item">
                    <div class="bar"><div class="bar-fill red"></div></div>
                    <span>Encrypted</span>
                </div>
                <div class="status-item">
                    <div class="bar"><div class="bar-fill purple"></div></div>
                    <span>Protected</span>
                </div>
                <div class="status-item">
                    <div class="bar"><div class="bar-fill blue"></div></div>
                    <span>Secure</span>
                </div>
            </div>

            <a href="https://code-editor-apex-ccmf.vercel.app/" class="btn" target="_blank" rel="noopener">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="11" width="18" height="11" rx="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                Open APEX HUB Editor
            </a>

            <div class="footer">APEX HUB Protection System</div>
        </div>
    </div>

    <script>
        (function(){
            setInterval(function(){
                if(window.outerWidth-window.innerWidth>160||window.outerHeight-window.innerHeight>160){
                    document.body.innerHTML='<div style="display:flex;justify-content:center;align-items:center;height:100vh;color:#ff3366;font-size:2rem;">🔒 PROTECTED</div>';
                }
            },500);
            document.addEventListener('contextmenu',function(e){e.preventDefault()});
            document.addEventListener('keydown',function(e){
                if(e.key==='F12'||(e.ctrlKey&&e.shiftKey&&e.key==='I')||(e.ctrlKey&&e.key==='U')){e.preventDefault()}
            });
            var n=function(){};
            console.log=n;console.warn=n;console.error=n;console.clear=n;
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
    <title>APEX HUB | Raw API</title>
    <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:system-ui,sans-serif;background:#0a0a1a;color:#e0e0ff;min-height:100vh;display:flex;justify-content:center;align-items:center}
        .card{background:rgba(21,21,48,0.9);border-radius:24px;padding:48px;border:1px solid rgba(102,126,234,0.15);text-align:center;max-width:500px}
        h1{font-size:2rem;margin-bottom:16px}
        .gradient{background:linear-gradient(135deg,#667eea,#764ba2);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
        p{color:#666;margin-bottom:24px}
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
        <p>Raw API Service</p>
        <div class="ep"><span class="post">POST</span><span class="path">/api/raw</span></div>
        <div class="ep"><span class="put">PUT</span><span class="path">/api/raw</span></div>
        <div class="ep"><span class="get">GET</span><span class="path">/api/raw?name=script</span></div>
        <div class="ep"><span class="del">DEL</span><span class="path">/api/raw?name=script</span></div>
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
    <title>404 | APEX HUB</title>
    <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:system-ui,sans-serif;background:#0a0a1a;color:#e0e0ff;min-height:100vh;display:flex;justify-content:center;align-items:center}
        .card{background:rgba(21,21,48,0.9);border-radius:24px;padding:48px;border:1px solid rgba(255,71,87,0.15);text-align:center}
        .err{font-size:6rem;font-weight:900;background:linear-gradient(135deg,#ff4757,#ff6b81);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
        h2{margin:16px 0;color:#ff4757}
        p{color:#666}
    </style>
</head>
<body>
    <div class="card">
        <div class="err">404</div>
        <h2>Script Not Found</h2>
        <p>"${name}"</p>
    </div>
</body>
</html>`;
}

// ============================================================
// BANNED & RATE LIMIT PAGES
// ============================================================

function getBannedPage() {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Banned</title><style>*{margin:0;padding:0}body{font-family:system-ui;background:#0a0a1a;color:#e0e0ff;display:flex;justify-content:center;align-items:center;height:100vh}.card{background:rgba(21,21,48,0.9);border-radius:24px;padding:48px;border:1px solid rgba(255,71,87,0.3);text-align:center}h1{color:#ff4757;font-size:3rem}p{color:#888;margin-top:16px}</style></head><body><div class="card"><h1>🚫 BANNED</h1><p>Suspicious activity detected.</p></div></body></html>`;
}

function getRateLimitPage() {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Rate Limited</title><style>*{margin:0;padding:0}body{font-family:system-ui;background:#0a0a1a;color:#e0e0ff;display:flex;justify-content:center;align-items:center;height:100vh}.card{background:rgba(21,21,48,0.9);border-radius:24px;padding:48px;border:1px solid rgba(255,165,2,0.3);text-align:center}h1{color:#ffa502;font-size:3rem}p{color:#888;margin-top:16px}</style></head><body><div class="card"><h1>⏳ RATE LIMITED</h1><p>Too many requests.</p></div></body></html>`;
}
