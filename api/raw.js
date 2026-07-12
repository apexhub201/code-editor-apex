// api/raw.js
global.scripts = global.scripts || {};

export default function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Session-Token');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // ========== GET - Hiển thị trang hoặc trả code ==========
    if (req.method === 'GET') {
        return handleGet(req, res);
    }

    // POST - Tạo script mới
    if (req.method === 'POST') {
        return handleCreate(req, res);
    }

    // PUT - Cập nhật script
    if (req.method === 'PUT') {
        return handleUpdate(req, res);
    }

    // DELETE - Xóa script
    if (req.method === 'DELETE') {
        return handleDelete(req, res);
    }

    return res.status(405).json({ error: 'Method not allowed' });
}

// ========== HANDLE GET ==========
function handleGet(req, res) {
    const { name, key, raw } = req.query;
    const ua = (req.headers['user-agent'] || '').toLowerCase();
    const acceptHeader = (req.headers['accept'] || '').toLowerCase();

    // Nếu không có name -> Trang chủ API
    if (!name) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(getWelcomePage(req.headers.host));
    }

    // Kiểm tra script tồn tại
    if (!global.scripts[name]) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(404).send(getErrorPage(req.headers.host, name));
    }

    // Cập nhật lastAccessed
    global.scripts[name].lastAccessed = Date.now();

    // Nếu có key hợp lệ hoặc raw=true -> Trả code thật
    const validKey = key === 'd0egkw6en9eusrjje5vn70p2tvkngkkn'; // Key của bạn
    const wantsRaw = raw === 'true' || validKey;

    // Kiểm tra có phải Roblox Executor không
    const isRoblox = ua.includes('roblox') || ua.includes('lua');
    const isExecutor = isRoblox || wantsRaw;

    if (isExecutor) {
        // Trả về code thật cho executor
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        return res.send(global.scripts[name].code);
    }

    // Browser -> Hiển thị trang bảo vệ đẹp
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(getProtectionPage(req.headers.host, name));
}

// ========== HANDLE CREATE ==========
function handleCreate(req, res) {
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

        if (global.scripts[nameSlug]) {
            return res.status(409).json({ success: false, error: 'Script name already exists' });
        }

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

// ========== HANDLE UPDATE ==========
function handleUpdate(req, res) {
    try {
        const { name, code } = req.body;

        if (!name || !global.scripts[name]) {
            return res.status(404).json({ success: false, error: 'Script not found' });
        }

        if (!code || !code.trim()) {
            return res.status(400).json({ success: false, error: 'Code is required' });
        }

        global.scripts[name].code = code;
        global.scripts[name].updated = Date.now();
        global.scripts[name].lastAccessed = Date.now();

        const rawUrl = `https://${req.headers.host}/api/raw?name=${name}`;

        return res.status(200).json({
            success: true,
            message: 'Updated successfully',
            raw: rawUrl,
            name: name
        });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
}

// ========== HANDLE DELETE ==========
function handleDelete(req, res) {
    const { name } = req.query;
    if (name && global.scripts[name]) {
        delete global.scripts[name];
        return res.status(200).json({ success: true, message: 'Deleted' });
    }
    return res.status(404).json({ success: false, error: 'Script not found' });
}

// ========== PROTECTION PAGE (Đẹp + Animation) ==========
function getProtectionPage(host, scriptName) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>APEX HUB | Protected Script</title>
    <meta name="robots" content="noindex, nofollow">
    <style>
        :root {
            --bg: #0a0a1a;
            --card-bg: rgba(21, 21, 48, 0.9);
            --accent: #ff4757;
            --accent2: #667eea;
            --text: #e0e0ff;
            --text-secondary: #8888aa;
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
            background: var(--bg);
            color: var(--text);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            overflow: hidden;
            position: relative;
        }

        /* Animated Background */
        .bg-animation {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 0;
            pointer-events: none;
        }

        .orb {
            position: absolute;
            border-radius: 50%;
            filter: blur(80px);
            opacity: 0.3;
            animation: orbFloat 20s infinite ease-in-out;
        }

        .orb-1 {
            width: 400px;
            height: 400px;
            background: radial-gradient(circle, #ff4757, transparent);
            top: -100px;
            left: -100px;
        }

        .orb-2 {
            width: 350px;
            height: 350px;
            background: radial-gradient(circle, #667eea, transparent);
            bottom: -100px;
            right: -100px;
            animation-delay: -7s;
        }

        .orb-3 {
            width: 300px;
            height: 300px;
            background: radial-gradient(circle, #764ba2, transparent);
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            animation-delay: -14s;
        }

        @keyframes orbFloat {
            0%, 100% { transform: translate(0, 0) scale(1); }
            25% { transform: translate(100px, -50px) scale(1.1); }
            50% { transform: translate(50px, 100px) scale(0.9); }
            75% { transform: translate(-100px, 50px) scale(1.05); }
        }

        .grid-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-image: 
                linear-gradient(rgba(255, 71, 87, 0.03) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255, 71, 87, 0.03) 1px, transparent 1px);
            background-size: 60px 60px;
            z-index: 0;
            pointer-events: none;
        }

        .particles {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 0;
            pointer-events: none;
        }

        .particle {
            position: absolute;
            width: 2px;
            height: 2px;
            background: #667eea;
            border-radius: 50%;
            animation: particleFloat 8s infinite ease-in-out;
            opacity: 0;
        }

        ${Array.from({length: 15}, (_, i) => `
        .particle:nth-child(${i + 1}) {
            left: ${Math.random() * 100}%;
            top: ${Math.random() * 100}%;
            animation-delay: -${Math.random() * 8}s;
            animation-duration: ${6 + Math.random() * 4}s;
        }`).join('')}

        @keyframes particleFloat {
            0%, 100% { transform: translateY(0) translateX(0); opacity: 0; }
            20% { opacity: 0.6; }
            50% { transform: translateY(-100px) translateX(30px); opacity: 0.2; }
            80% { opacity: 0.6; }
        }

        /* Main Card */
        .container {
            position: relative;
            z-index: 1;
            width: 90%;
            max-width: 500px;
        }

        .card {
            background: var(--card-bg);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border-radius: 24px;
            padding: 48px 40px;
            border: 1px solid rgba(255, 71, 87, 0.15);
            box-shadow: 
                0 8px 32px rgba(0, 0, 0, 0.4),
                0 0 0 1px rgba(255, 71, 87, 0.05) inset,
                0 0 120px rgba(255, 71, 87, 0.08);
            animation: cardAppear 0.6s cubic-bezier(0.16, 1, 0.3, 1);
            position: relative;
            overflow: hidden;
        }

        .card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 2px;
            background: linear-gradient(90deg, 
                transparent, 
                rgba(255, 71, 87, 0.5), 
                rgba(102, 126, 234, 0.5), 
                rgba(255, 71, 87, 0.5), 
                transparent
            );
            animation: scanLine 3s ease-in-out infinite;
        }

        @keyframes cardAppear {
            from { opacity: 0; transform: translateY(30px) scale(0.95); }
            to { opacity: 1; transform: translateY(0) scale(1); }
        }

        @keyframes scanLine {
            0%, 100% { transform: translateX(-100%); }
            50% { transform: translateX(100%); }
        }

        /* Shield Icon */
        .shield-container {
            position: relative;
            display: inline-block;
            margin-bottom: 24px;
            animation: shieldPulse 2.5s ease-in-out infinite;
        }

        @keyframes shieldPulse {
            0%, 100% {
                filter: drop-shadow(0 0 20px rgba(255, 71, 87, 0.4));
                transform: scale(1);
            }
            50% {
                filter: drop-shadow(0 0 40px rgba(255, 71, 87, 0.8));
                transform: scale(1.08);
            }
        }

        .shield-svg {
            width: 80px;
            height: 80px;
        }

        /* Title */
        .title {
            font-size: 1.8rem;
            font-weight: 900;
            text-align: center;
            line-height: 1.2;
            margin-bottom: 8px;
        }

        .title-gradient {
            background: linear-gradient(135deg, #ff6b81, #ff4757, #ff6b81);
            background-size: 200% 200%;
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            animation: gradientShift 3s ease-in-out infinite;
        }

        @keyframes gradientShift {
            0%, 100% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
        }

        .subtitle {
            color: var(--text-secondary);
            font-size: 0.9rem;
            text-align: center;
            margin-bottom: 28px;
            letter-spacing: 0.05em;
        }

        /* Info Grid */
        .divider {
            height: 1px;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent);
            margin: 24px 0;
        }

        .info-grid {
            display: grid;
            gap: 10px;
            margin-bottom: 24px;
        }

        .info-item {
            background: rgba(15, 15, 35, 0.6);
            border: 1px solid rgba(255,255,255,0.05);
            border-radius: 12px;
            padding: 14px 16px;
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .info-icon {
            width: 40px;
            height: 40px;
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            font-size: 1.2rem;
        }

        .info-icon.red { background: rgba(255, 71, 87, 0.15); }
        .info-icon.blue { background: rgba(102, 126, 234, 0.15); }
        .info-icon.green { background: rgba(0, 210, 91, 0.15); }
        .info-icon.purple { background: rgba(118, 75, 162, 0.15); }

        .info-content {
            flex: 1;
            min-width: 0;
        }

        .info-label {
            font-size: 0.65rem;
            color: #555;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            font-weight: 600;
            margin-bottom: 3px;
        }

        .info-value {
            font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
            font-size: 0.78rem;
            color: #999;
            word-break: break-all;
        }

        /* CTA Button */
        .cta-button {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            width: 100%;
            padding: 15px;
            margin-top: 20px;
            background: linear-gradient(135deg, rgba(255, 71, 87, 0.15), rgba(255, 107, 129, 0.15));
            border: 1px solid rgba(255, 71, 87, 0.25);
            border-radius: 14px;
            color: #ff6b81;
            text-decoration: none;
            font-weight: 600;
            font-size: 0.95rem;
            transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            cursor: pointer;
        }

        .cta-button:hover {
            background: linear-gradient(135deg, rgba(255, 71, 87, 0.25), rgba(255, 107, 129, 0.25));
            border-color: #ff4757;
            color: #fff;
            transform: translateY(-2px);
            box-shadow: 0 8px 24px rgba(255, 71, 87, 0.2);
        }

        /* Status */
        .status-container {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 16px;
            margin-top: 20px;
        }

        .status-item {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 0.65rem;
            color: #555;
            text-transform: uppercase;
            letter-spacing: 0.1em;
        }

        .status-dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
        }

        .status-dot.active {
            background: #00ff88;
            animation: statusPulse 2s ease-in-out infinite;
            box-shadow: 0 0 10px rgba(0, 255, 136, 0.5);
        }

        .status-dot.warning {
            background: #ffa502;
            animation: statusPulse 2s ease-in-out infinite;
            box-shadow: 0 0 10px rgba(255, 165, 2, 0.5);
        }

        @keyframes statusPulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }

        .footer-text {
            text-align: center;
            margin-top: 20px;
            font-size: 0.6rem;
            color: #333;
            letter-spacing: 0.15em;
            text-transform: uppercase;
        }

        @media (max-width: 600px) {
            .card {
                padding: 32px 24px;
            }
            .title {
                font-size: 1.4rem;
            }
            .shield-svg {
                width: 60px;
                height: 60px;
            }
        }
    </style>
</head>
<body>
    <!-- Animated Background -->
    <div class="bg-animation">
        <div class="orb orb-1"></div>
        <div class="orb orb-2"></div>
        <div class="orb orb-3"></div>
    </div>
    <div class="grid-overlay"></div>
    <div class="particles">
        ${Array.from({length: 15}, () => '<div class="particle"></div>').join('')}
    </div>

    <!-- Main Content -->
    <div class="container">
        <div class="card">
            <!-- Shield Icon -->
            <div style="text-align: center;">
                <div class="shield-container">
                    <svg class="shield-svg" viewBox="0 0 24 24">
                        <defs>
                            <linearGradient id="shieldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" style="stop-color:#ff6b81"/>
                                <stop offset="100%" style="stop-color:#ff4757"/>
                            </linearGradient>
                        </defs>
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" 
                              fill="none" stroke="url(#shieldGrad)" stroke-width="1.5"/>
                        <path d="M9 12l2 2 4-4" fill="none" stroke="#00ff88" stroke-width="2" 
                              stroke-dasharray="20" stroke-dashoffset="20">
                            <animate attributeName="stroke-dashoffset" from="20" to="0" 
                                     dur="0.5s" begin="0.5s" fill="freeze"/>
                        </path>
                    </svg>
                </div>
            </div>

            <!-- Title -->
            <div class="title">
                <span style="color: #e0e0ff;">SCRIPT</span><br>
                <span class="title-gradient">PROTECTED</span>
            </div>
            <div class="subtitle">This script is secured by APEX HUB</div>

            <div class="divider"></div>

            <!-- Info -->
            <div class="info-grid">
                <div class="info-item">
                    <div class="info-icon red">🔒</div>
                    <div class="info-content">
                        <div class="info-label">Script Name</div>
                        <div class="info-value">${scriptName}</div>
                    </div>
                </div>
                <div class="info-item">
                    <div class="info-icon blue">🔗</div>
                    <div class="info-content">
                        <div class="info-label">Raw URL</div>
                        <div class="info-value">${host}/api/raw?name=${scriptName}</div>
                    </div>
                </div>
                <div class="info-item">
                    <div class="info-icon green">✅</div>
                    <div class="info-content">
                        <div class="info-label">Status</div>
                        <div class="info-value" style="color: #00d25b;">Active & Protected</div>
                    </div>
                </div>
                <div class="info-item">
                    <div class="info-icon purple">⚡</div>
                    <div class="info-content">
                        <div class="info-label">Access</div>
                        <div class="info-value">Executor Only</div>
                    </div>
                </div>
            </div>

            <!-- CTA Button -->
            <a href="https://code-editor-apex-ccmf.vercel.app/" class="cta-button" target="_blank">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="11" width="18" height="11" rx="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                Open APEX HUB Editor
            </a>

            <!-- Status -->
            <div class="status-container">
                <div class="status-item">
                    <div class="status-dot active"></div>
                    <span>Anti-Debug</span>
                </div>
                <div class="status-item">
                    <div class="status-dot active"></div>
                    <span>Anti-Hook</span>
                </div>
                <div class="status-item">
                    <div class="status-dot warning"></div>
                    <span>Protected</span>
                </div>
            </div>

            <div class="footer-text">APEX HUB &copy; ${new Date().getFullYear()} | ALL RIGHTS RESERVED</div>
        </div>
    </div>

    <!-- Anti-DevTools -->
    <script>
        (function() {
            setInterval(function() {
                const w = window.outerWidth - window.innerWidth > 160;
                const h = window.outerHeight - window.innerHeight > 160;
                if (w || h) {
                    document.body.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:100vh;color:#ff4757;font-size:2rem;text-align:center;">🔒 SECURITY BREACH<br>DevTools is forbidden</div>';
                }
            }, 1000);
            document.addEventListener('contextmenu', e => e.preventDefault());
            document.addEventListener('keydown', function(e) {
                if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key === 'I') || (e.ctrlKey && e.key === 'U')) {
                    e.preventDefault();
                }
            });
        })();
    </script>
</body>
</html>`;
}

// ========== WELCOME PAGE ==========
function getWelcomePage(host) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>APEX HUB | Raw API</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: system-ui, sans-serif;
            background: #0a0a1a;
            color: #e0e0ff;
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
        }
        .card {
            background: rgba(21,21,48,0.9);
            border-radius: 24px;
            padding: 48px;
            border: 1px solid rgba(102,126,234,0.15);
            text-align: center;
            max-width: 500px;
        }
        h1 { font-size: 2rem; margin-bottom: 16px; }
        .gradient {
            background: linear-gradient(135deg, #667eea, #764ba2);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        p { color: #666; margin-bottom: 24px; }
        .endpoints {
            text-align: left;
            background: rgba(0,0,0,0.2);
            border-radius: 12px;
            padding: 20px;
        }
        .endpoint {
            display: flex;
            gap: 12px;
            padding: 8px 0;
            font-family: monospace;
            font-size: 0.85rem;
        }
        .method {
            font-weight: 700;
            min-width: 50px;
        }
        .post { color: #00d25b; }
        .put { color: #ffa502; }
        .get { color: #667eea; }
        .delete { color: #ff4757; }
        .path { color: #888; }
    </style>
</head>
<body>
    <div class="card">
        <h1>🚀 <span class="gradient">APEX HUB</span></h1>
        <p>Raw API Service - v1.0</p>
        <div class="endpoints">
            <div class="endpoint">
                <span class="method post">POST</span>
                <span class="path">/api/raw</span>
            </div>
            <div class="endpoint">
                <span class="method put">PUT</span>
                <span class="path">/api/raw</span>
            </div>
            <div class="endpoint">
                <span class="method get">GET</span>
                <span class="path">/api/raw?name=script</span>
            </div>
            <div class="endpoint">
                <span class="method delete">DEL</span>
                <span class="path">/api/raw?name=script</span>
            </div>
        </div>
    </div>
</body>
</html>`;
}

// ========== ERROR PAGE ==========
function getErrorPage(host, name) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>404 | APEX HUB</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: system-ui, sans-serif;
            background: #0a0a1a;
            color: #e0e0ff;
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
        }
        .card {
            background: rgba(21,21,48,0.9);
            border-radius: 24px;
            padding: 48px;
            border: 1px solid rgba(255,71,87,0.15);
            text-align: center;
        }
        .error-code {
            font-size: 6rem;
            font-weight: 900;
            background: linear-gradient(135deg, #ff4757, #ff6b81);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        h2 { margin: 16px 0; color: #ff4757; }
        p { color: #666; }
        .script-name {
            font-family: monospace;
            color: #ffa502;
            margin-top: 8px;
        }
    </style>
</head>
<body>
    <div class="card">
        <div class="error-code">404</div>
        <h2>Script Not Found</h2>
        <p>The script you're looking for doesn't exist.</p>
        <p class="script-name">"${name}"</p>
    </div>
</body>
</html>`;
}
