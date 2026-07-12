// Sử dụng global để lưu scripts
global.scripts = global.scripts || {};

export default function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // POST - Tạo RAW mới
    if (req.method === 'POST') {
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

            console.log('Scripts in memory:', Object.keys(global.scripts));

            const rawUrl = `https://${req.headers.host}/api/raw?name=${nameSlug}`;
            
            return res.status(200).json({
                success: true,
                raw: rawUrl,
                name: nameSlug
            });
        } catch (error) {
            return res.status(500).json({ success: false, error: error.message });
        }
    }

    // PUT - Cập nhật
    if (req.method === 'PUT') {
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

    // DELETE
    if (req.method === 'DELETE') {
        const { name } = req.query;
        if (name && global.scripts[name]) {
            delete global.scripts[name];
            return res.status(200).json({ success: true, message: 'Deleted' });
        }
        return res.status(404).json({ success: false, error: 'Script not found' });
    }

    // GET
    if (req.method === 'GET') {
        const { name } = req.query;

        // Không có name -> trang chủ
        if (!name) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.send(getWelcomePage());
        }

        console.log('Looking for script:', name);
        console.log('Available scripts:', Object.keys(global.scripts));

        // Script không tồn tại
        if (!global.scripts[name]) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.status(404).send(getErrorPage());
        }

        global.scripts[name].lastAccessed = Date.now();

        const ua = (req.headers['user-agent'] || '').toLowerCase();
        const acceptHeader = (req.headers['accept'] || '').toLowerCase();
        
        const isBrowser = ua.includes('mozilla') || ua.includes('chrome') || ua.includes('safari') || ua.includes('firefox') || ua.includes('edge');
        const wantsHTML = acceptHeader.includes('text/html');

        if (isBrowser && wantsHTML) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.send(getProtectionPage());
        }

        // Trả về code thật cho executor
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        return res.send(global.scripts[name].code);
    }

    return res.status(405).json({ error: 'Method not allowed' });
}

function getWelcomePage() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>APEX HUB | Raw API</title>
    <style>
        :root {
            --bg-primary: #0a0a1a;
            --bg-card: rgba(21, 21, 48, 0.8);
            --border: rgba(100, 100, 255, 0.15);
            --text-primary: #e0e0ff;
            --text-secondary: #8888aa;
            --gradient-1: #667eea;
            --gradient-2: #764ba2;
            --green: #00d25b;
            --orange: #ffa502;
            --blue: #667eea;
            --red: #ff4757;
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
            background: var(--bg-primary);
            color: var(--text-primary);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            overflow: hidden;
            position: relative;
        }

        /* Animated background */
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
            animation: float 20s infinite ease-in-out;
        }

        .orb-1 {
            width: 400px;
            height: 400px;
            background: radial-gradient(circle, #667eea, transparent);
            top: -100px;
            left: -100px;
            animation-delay: 0s;
        }

        .orb-2 {
            width: 350px;
            height: 350px;
            background: radial-gradient(circle, #764ba2, transparent);
            bottom: -100px;
            right: -100px;
            animation-delay: -7s;
        }

        .orb-3 {
            width: 300px;
            height: 300px;
            background: radial-gradient(circle, #ff4757, transparent);
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            animation-delay: -14s;
        }

        @keyframes float {
            0%, 100% {
                transform: translate(0, 0) scale(1);
            }
            25% {
                transform: translate(100px, -50px) scale(1.1);
            }
            50% {
                transform: translate(50px, 100px) scale(0.9);
            }
            75% {
                transform: translate(-100px, 50px) scale(1.05);
            }
        }

        /* Grid pattern overlay */
        .grid-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-image: 
                linear-gradient(rgba(100, 100, 255, 0.03) 1px, transparent 1px),
                linear-gradient(90deg, rgba(100, 100, 255, 0.03) 1px, transparent 1px);
            background-size: 60px 60px;
            z-index: 0;
            pointer-events: none;
        }

        /* Main card */
        .container {
            position: relative;
            z-index: 1;
            width: 90%;
            max-width: 500px;
        }

        .card {
            background: var(--bg-card);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border-radius: 24px;
            padding: 48px 40px;
            border: 1px solid var(--border);
            box-shadow: 
                0 8px 32px rgba(0, 0, 0, 0.4),
                0 0 0 1px rgba(100, 100, 255, 0.05) inset,
                0 0 120px rgba(102, 126, 234, 0.1);
            animation: cardAppear 0.8s cubic-bezier(0.16, 1, 0.3, 1);
            position: relative;
            overflow: hidden;
        }

        .card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 1px;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
        }

        .card::after {
            content: '';
            position: absolute;
            top: -50%;
            left: -50%;
            width: 200%;
            height: 200%;
            background: conic-gradient(from 0deg, transparent, rgba(102, 126, 234, 0.05), transparent, rgba(118, 75, 162, 0.05), transparent);
            animation: rotate 10s linear infinite;
            pointer-events: none;
        }

        @keyframes cardAppear {
            from {
                opacity: 0;
                transform: translateY(30px) scale(0.95);
            }
            to {
                opacity: 1;
                transform: translateY(0) scale(1);
            }
        }

        @keyframes rotate {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }

        /* Logo */
        .logo-container {
            position: relative;
            display: inline-block;
            margin-bottom: 24px;
        }

        .logo-icon {
            width: 64px;
            height: 64px;
            background: linear-gradient(135deg, var(--gradient-1), var(--gradient-2));
            border-radius: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto;
            position: relative;
            animation: logoPulse 3s ease-in-out infinite;
            box-shadow: 0 8px 32px rgba(102, 126, 234, 0.3);
        }

        .logo-icon svg {
            width: 32px;
            height: 32px;
            filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
        }

        @keyframes logoPulse {
            0%, 100% {
                box-shadow: 0 8px 32px rgba(102, 126, 234, 0.3);
                transform: scale(1);
            }
            50% {
                box-shadow: 0 8px 48px rgba(118, 75, 162, 0.5);
                transform: scale(1.05);
            }
        }

        .logo-text {
            font-size: 2rem;
            font-weight: 800;
            background: linear-gradient(135deg, var(--gradient-1) 0%, var(--gradient-2) 50%, #ff6b81 100%);
            background-size: 200% 200%;
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            animation: gradientShift 4s ease-in-out infinite;
            letter-spacing: -0.5px;
        }

        @keyframes gradientShift {
            0%, 100% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
        }

        .subtitle {
            color: var(--text-secondary);
            font-size: 0.9rem;
            margin-bottom: 32px;
            letter-spacing: 0.05em;
        }

        /* Endpoints section */
        .endpoints {
            background: rgba(15, 15, 35, 0.6);
            border-radius: 16px;
            padding: 24px;
            border: 1px solid rgba(255,255,255,0.05);
            position: relative;
            z-index: 1;
        }

        .endpoint {
            display: flex;
            align-items: center;
            padding: 12px 16px;
            margin-bottom: 8px;
            border-radius: 10px;
            background: rgba(255,255,255,0.02);
            transition: all 0.3s ease;
            cursor: default;
            position: relative;
        }

        .endpoint:last-child {
            margin-bottom: 0;
        }

        .endpoint:hover {
            background: rgba(255,255,255,0.05);
            transform: translateX(4px);
        }

        .method {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 4px 10px;
            border-radius: 6px;
            font-weight: 700;
            font-size: 0.7rem;
            letter-spacing: 0.05em;
            min-width: 56px;
            margin-right: 12px;
            text-transform: uppercase;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            animation: methodGlow 2s ease-in-out infinite;
        }

        .method.post {
            background: linear-gradient(135deg, #00d25b, #00a844);
            color: #fff;
        }

        .method.put {
            background: linear-gradient(135deg, #ffa502, #e68a00);
            color: #fff;
        }

        .method.get {
            background: linear-gradient(135deg, #667eea, #4c63d2);
            color: #fff;
        }

        .method.delete {
            background: linear-gradient(135deg, #ff4757, #e03444);
            color: #fff;
        }

        @keyframes methodGlow {
            0%, 100% { filter: brightness(1); }
            50% { filter: brightness(1.15); }
        }

        .path {
            font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
            font-size: 0.82rem;
            color: #aab;
        }

        /* CTA Button */
        .cta-button {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            margin-top: 28px;
            padding: 14px 32px;
            background: linear-gradient(135deg, rgba(102, 126, 234, 0.2), rgba(118, 75, 162, 0.2));
            border: 1px solid rgba(102, 126, 234, 0.3);
            border-radius: 14px;
            color: #aab;
            text-decoration: none;
            font-weight: 600;
            font-size: 0.9rem;
            transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            position: relative;
            z-index: 1;
            overflow: hidden;
        }

        .cta-button::before {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent);
            transition: left 0.5s ease;
        }

        .cta-button:hover {
            background: linear-gradient(135deg, rgba(102, 126, 234, 0.35), rgba(118, 75, 162, 0.35));
            border-color: var(--gradient-1);
            color: #fff;
            transform: translateY(-2px);
            box-shadow: 0 8px 24px rgba(102, 126, 234, 0.2);
        }

        .cta-button:hover::before {
            left: 100%;
        }

        .cta-button svg {
            width: 16px;
            height: 16px;
            transition: transform 0.3s ease;
        }

        .cta-button:hover svg {
            transform: translateX(3px);
        }

        /* Status indicator */
        .status-bar {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            margin-top: 20px;
            font-size: 0.7rem;
            color: #555;
            letter-spacing: 0.15em;
            text-transform: uppercase;
        }

        .status-dot {
            width: 6px;
            height: 6px;
            background: #00d25b;
            border-radius: 50%;
            animation: statusPulse 2s ease-in-out infinite;
        }

        @keyframes statusPulse {
            0%, 100% {
                box-shadow: 0 0 0 0 rgba(0, 210, 91, 0.6);
            }
            50% {
                box-shadow: 0 0 0 12px rgba(0, 210, 91, 0);
            }
        }
    </style>
</head>
<body>
    <!-- Animated background -->
    <div class="bg-animation">
        <div class="orb orb-1"></div>
        <div class="orb orb-2"></div>
        <div class="orb orb-3"></div>
    </div>
    <div class="grid-overlay"></div>

    <!-- Main content -->
    <div class="container">
        <div class="card">
            <!-- Logo -->
            <div style="text-align: center;">
                <div class="logo-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2"></polygon>
                        <line x1="12" y1="22" x2="12" y2="15.5"></line>
                        <polyline points="22 8.5 12 15.5 2 8.5"></polyline>
                    </svg>
                </div>
                <div class="logo-text">APEX HUB</div>
                <div class="subtitle">Raw API Service</div>
            </div>

            <!-- Endpoints -->
            <div class="endpoints">
                <div class="endpoint">
                    <span class="method post">POST</span>
                    <span class="path">/api/raw</span>
                    <span style="margin-left: auto; color: #555; font-size: 0.7rem;">Create</span>
                </div>
                <div class="endpoint">
                    <span class="method put">PUT</span>
                    <span class="path">/api/raw</span>
                    <span style="margin-left: auto; color: #555; font-size: 0.7rem;">Update</span>
                </div>
                <div class="endpoint">
                    <span class="method get">GET</span>
                    <span class="path">/api/raw?name=...</span>
                    <span style="margin-left: auto; color: #555; font-size: 0.7rem;">Retrieve</span>
                </div>
                <div class="endpoint">
                    <span class="method delete">DEL</span>
                    <span class="path">/api/raw?name=...</span>
                    <span style="margin-left: auto; color: #555; font-size: 0.7rem;">Delete</span>
                </div>
            </div>

            <!-- CTA -->
            <div style="text-align: center;">
                <a href="https://code-editor-apex-ccmf.vercel.app/" class="cta-button" target="_blank">
                    Open Editor
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                        <polyline points="12 5 19 12 12 19"></polyline>
                    </svg>
                </a>
            </div>

            <!-- Status -->
            <div class="status-bar">
                <span class="status-dot"></span>
                <span>System Online</span>
            </div>
        </div>
    </div>
</body>
</html>`;
}

function getProtectionPage() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>APEX HUB | Protected</title>
    <style>
        :root {
            --bg-primary: #0a0a1a;
            --bg-card: rgba(21, 21, 48, 0.8);
            --border: rgba(100, 100, 255, 0.15);
            --text-primary: #e0e0ff;
            --text-secondary: #8888aa;
            --gradient-1: #667eea;
            --gradient-2: #764ba2;
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
            background: var(--bg-primary);
            color: var(--text-primary);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            overflow: hidden;
            position: relative;
        }

        /* Animated background */
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
            animation: float 20s infinite ease-in-out;
        }

        .orb-1 {
            width: 400px;
            height: 400px;
            background: radial-gradient(circle, #ff4757, transparent);
            top: -100px;
            left: -100px;
            animation-delay: 0s;
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

        @keyframes float {
            0%, 100% {
                transform: translate(0, 0) scale(1);
            }
            25% {
                transform: translate(80px, -40px) scale(1.1);
            }
            50% {
                transform: translate(30px, 80px) scale(0.9);
            }
            75% {
                transform: translate(-80px, 30px) scale(1.05);
            }
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

        /* Card */
        .container {
            position: relative;
            z-index: 1;
            width: 90%;
            max-width: 460px;
        }

        .card {
            background: var(--bg-card);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border-radius: 24px;
            padding: 48px 40px;
            border: 1px solid var(--border);
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
            height: 1px;
            background: linear-gradient(90deg, transparent, rgba(255,71,87,0.3), transparent);
        }

        @keyframes cardAppear {
            from {
                opacity: 0;
                transform: translateY(20px) scale(0.96);
            }
            to {
                opacity: 1;
                transform: translateY(0) scale(1);
            }
        }

        /* Shield icon */
        .shield-container {
            position: relative;
            display: inline-block;
            margin-bottom: 20px;
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
            animation: shieldRotate 3s ease-in-out infinite;
        }

        @keyframes shieldRotate {
            0%, 100% { transform: rotate(0deg); }
            25% { transform: rotate(2deg); }
            75% { transform: rotate(-2deg); }
        }

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

        .divider {
            height: 1px;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent);
            margin: 28px 0;
        }

        .info-box {
            background: rgba(15, 15, 35, 0.6);
            border-radius: 14px;
            padding: 20px;
            border: 1px solid rgba(255,255,255,0.05);
            position: relative;
            z-index: 1;
        }

        .info-label {
            font-size: 0.65rem;
            color: #555;
            text-transform: uppercase;
            letter-spacing: 0.2em;
            margin-bottom: 10px;
            font-weight: 600;
        }

        .info-value {
            font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
            font-size: 0.8rem;
            color: #888;
            word-break: break-all;
            padding: 12px;
            background: rgba(0,0,0,0.3);
            border-radius: 8px;
            border: 1px solid rgba(255,255,255,0.05);
        }

        .cta-button {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            width: 100%;
            padding: 15px;
            margin-top: 24px;
            background: linear-gradient(135deg, rgba(255, 71, 87, 0.15), rgba(255, 107, 129, 0.15));
            border: 1px solid rgba(255, 71, 87, 0.25);
            border-radius: 14px;
            color: #ff6b81;
            text-decoration: none;
            font-weight: 600;
            font-size: 0.9rem;
            transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            position: relative;
            z-index: 1;
            overflow: hidden;
            letter-spacing: 0.02em;
        }

        .cta-button::before {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent);
            transition: left 0.5s ease;
        }

        .cta-button:hover {
            background: linear-gradient(135deg, rgba(255, 71, 87, 0.25), rgba(255, 107, 129, 0.25));
            border-color: #ff4757;
            color: #fff;
            transform: translateY(-2px);
            box-shadow: 0 8px 24px rgba(255, 71, 87, 0.2);
        }

        .cta-button:hover::before {
            left: 100%;
        }

        .cta-button svg {
            width: 18px;
            height: 18px;
            transition: transform 0.3s ease;
        }

        .cta-button:hover svg {
            transform: rotate(90deg);
        }

        /* Status */
        .status-container {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            margin-top: 24px;
        }

        .status-ring {
            position: relative;
            width: 12px;
            height: 12px;
        }

        .status-dot {
            width: 8px;
            height: 8px;
            background: #ff4757;
            border-radius: 50%;
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            z-index: 2;
        }

        .status-ripple {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 8px;
            height: 8px;
            border: 2px solid #ff4757;
            border-radius: 50%;
            animation: ripple 2s ease-out infinite;
        }

        .status-ripple:nth-child(2) {
            animation-delay: 0.6s;
        }

        .status-ripple:nth-child(3) {
            animation-delay: 1.2s;
        }

        @keyframes ripple {
            0% {
                width: 8px;
                height: 8px;
                opacity: 1;
            }
            100% {
                width: 40px;
                height: 40px;
                opacity: 0;
            }
        }

        .status-text {
            font-size: 0.7rem;
            color: #555;
            text-transform: uppercase;
            letter-spacing: 0.2em;
            font-weight: 600;
        }

        .footer-text {
            text-align: center;
            margin-top: 20px;
            font-size: 0.6rem;
            color: #333;
            letter-spacing: 0.15em;
            text-transform: uppercase;
        }
    </style>
</head>
<body>
    <!-- Animated background -->
    <div class="bg-animation">
        <div class="orb orb-1"></div>
        <div class="orb orb-2"></div>
        <div class="orb orb-3"></div>
    </div>
    <div class="grid-overlay"></div>

    <!-- Main content -->
    <div class="container">
        <div class="card">
            <!-- Shield Icon -->
            <div style="text-align: center;">
                <div class="shield-container">
                    <svg class="shield-svg" viewBox="0 0 24 24" fill="none" stroke="url(#shieldGradient)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <defs>
                            <linearGradient id="shieldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" style="stop-color:#ff6b81;stop-opacity:1" />
                                <stop offset="100%" style="stop-color:#ff4757;stop-opacity:1" />
                            </linearGradient>
                        </defs>
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                        <path d="M9 12l2 2 4-4" stroke="#ff4757" stroke-width="2"></path>
                    </svg>
                </div>
            </div>

            <!-- Title -->
            <div class="title">
                ACTIVATE<br>
                <span class="title-gradient">PROTECTION</span>
            </div>

            <div class="divider"></div>

            <!-- Info -->
            <div class="info-box">
                <div class="info-label">🔒 Access URL</div>
                <div class="info-value">code-editor-apex-ccmf.vercel.app</div>
            </div>

            <!-- CTA -->
            <a href="https://code-editor-apex-ccmf.vercel.app/" class="cta-button" target="_blank">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
                Open Editor
            </a>

            <!-- Status -->
            <div class="status-container">
                <div class="status-ring">
                    <div class="status-dot"></div>
                    <div class="status-ripple"></div>
                    <div class="status-ripple"></div>
                    <div class="status-ripple"></div>
                </div>
                <span class="status-text">Protected Script</span>
            </div>

            <div class="footer-text">APEX HUB PROTECTION SYSTEM</div>
        </div>
    </div>
</body>
</html>`;
}

function getErrorPage() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>404 | APEX HUB</title>
    <style>
        :root {
            --bg-primary: #0a0a1a;
            --bg-card: rgba(21, 21, 48, 0.8);
            --border: rgba(100, 100, 255, 0.15);
            --gradient-1: #667eea;
            --gradient-2: #764ba2;
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
            background: var(--bg-primary);
            color: #e0e0ff;
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            overflow: hidden;
            position: relative;
        }

        /* Animated particles */
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

        .particle:nth-child(1) { left: 10%; top: 20%; animation-delay: 0s; }
        .particle:nth-child(2) { left: 30%; top: 60%; animation-delay: -2s; }
        .particle:nth-child(3) { left: 50%; top: 10%; animation-delay: -4s; }
        .particle:nth-child(4) { left: 70%; top: 70%; animation-delay: -1s; }
        .particle:nth-child(5) { left: 90%; top: 30%; animation-delay: -3s; }
        .particle:nth-child(6) { left: 15%; top: 80%; animation-delay: -5s; }
        .particle:nth-child(7) { left: 40%; top: 40%; animation-delay: -6s; }
        .particle:nth-child(8) { left: 65%; top: 25%; animation-delay: -2.5s; }
        .particle:nth-child(9) { left: 85%; top: 55%; animation-delay: -4.5s; }
        .particle:nth-child(10) { left: 55%; top: 85%; animation-delay: -1.5s; }

        @keyframes particleFloat {
            0%, 100% {
                transform: translateY(0) translateX(0);
                opacity: 0;
            }
            20% {
                opacity: 0.6;
            }
            50% {
                transform: translateY(-100px) translateX(30px);
                opacity: 0.2;
            }
            80% {
                opacity: 0.6;
            }
        }

        /* Card */
        .container {
            position: relative;
            z-index: 1;
            width: 90%;
            max-width: 420px;
        }

        .card {
            background: var(--bg-card);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border-radius: 24px;
            padding: 48px 40px;
            border: 1px solid var(--border);
            box-shadow: 
                0 8px 32px rgba(0, 0, 0, 0.4),
                0 0 0 1px rgba(100, 100, 255, 0.05) inset;
            animation: shakeIn 0.6s cubic-bezier(0.16, 1, 0.3, 1);
            text-align: center;
            position: relative;
            overflow: hidden;
        }

        @keyframes shakeIn {
            0% {
                opacity: 0;
                transform: translateX(-20px) rotate(-1deg);
            }
            60% {
                transform: translateX(5px) rotate(0.5deg);
            }
            100% {
                opacity: 1;
                transform: translateX(0) rotate(0deg);
            }
        }

        .error-code {
            font-size: 6rem;
            font-weight: 900;
            background: linear-gradient(135deg, #ff4757, #ff6b81);
            background-size: 200% 200%;
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            animation: glitchText 3s ease-in-out infinite;
            line-height: 1;
            position: relative;
        }

        .error-code::after {
            content: '404';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            background: linear-gradient(135deg, #667eea, #764ba2);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            animation: glitchClip 3s ease-in-out infinite;
            opacity: 0.5;
            clip-path: inset(0 0 0 0);
        }

        @keyframes glitchText {
            0%, 90%, 100% { transform: translate(0); }
            92% { transform: translate(-3px, 1px); }
            94% { transform: translate(3px, -1px); }
            96% { transform: translate(-1px, -1px); }
            98% { transform: translate(1px, 1px); }
        }

        @keyframes glitchClip {
            0%, 90%, 100% { clip-path: inset(0 0 0 0); }
            92% { clip-path: inset(20% 0 40% 0); }
            94% { clip-path: inset(60% 0 10% 0); }
            96% { clip-path: inset(10% 0 50% 0); }
            98% { clip-path: inset(50% 0 20% 0); }
        }

        .error-title {
            font-size: 1.4rem;
            font-weight: 700;
            margin: 16px 0 8px;
            color: #ff4757;
        }

        .error-message {
            color: #888;
            font-size: 0.9rem;
            margin-bottom: 32px;
        }

        .divider {
            height: 1px;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent);
            margin: 24px 0;
        }

        .back-button {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 14px 28px;
            background: linear-gradient(135deg, rgba(102, 126, 234, 0.15), rgba(118, 75, 162, 0.15));
            border: 1px solid rgba(102, 126, 234, 0.25);
            border-radius: 14px;
            color: #667eea;
            text-decoration: none;
            font-weight: 600;
            font-size: 0.9rem;
            transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            position: relative;
            overflow: hidden;
        }

        .back-button::before {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent);
            transition: left 0.5s ease;
        }

        .back-button:hover {
            background: linear-gradient(135deg, rgba(102, 126, 234, 0.25), rgba(118, 75, 162, 0.25));
            border-color: #667eea;
            color: #fff;
            transform: translateY(-2px);
            box-shadow: 0 8px 24px rgba(102, 126, 234, 0.2);
        }

        .back-button:hover::before {
            left: 100%;
        }

        .back-button svg {
            width: 16px;
            height: 16px;
            transition: transform 0.3s ease;
        }

        .back-button:hover svg {
            transform: translateX(-3px);
        }
    </style>
</head>
<body>
    <!-- Particles -->
    <div class="particles">
        <div class="particle"></div>
        <div class="particle"></div>
        <div class="particle"></div>
        <div class="particle"></div>
        <div class="particle"></div>
        <div class="particle"></div>
        <div class="particle"></div>
        <div class="particle"></div>
        <div class="particle"></div>
        <div class="particle"></div>
    </div>

    <!-- Main content -->
    <div class="container">
        <div class="card">
            <div class="error-code">404</div>
            <div class="error-title">Script Not Found</div>
            <div class="error-message">The script doesn't exist or has expired.</div>
            
            <div class="divider"></div>
            
            <a href="https://code-editor-apex-ccmf.vercel.app/" class="back-button">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="19" y1="12" x2="5" y2="12"></line>
                    <polyline points="12 19 5 12 12 5"></polyline>
                </svg>
                Back to Editor
            </a>
        </div>
    </div>
</body>
</html>`;
}
