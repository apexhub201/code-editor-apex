// Sử dụng global để lưu scripts với mã hóa
global.scripts = global.scripts || {};
global.scriptKeys = global.scriptKeys || {};

// Hàm mã hóa đơn giản (nên thay bằng crypto thực tế trong production)
function simpleEncrypt(text, key) {
    let result = '';
    for (let i = 0; i < text.length; i++) {
        result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return Buffer.from(result).toString('base64');
}

function simpleDecrypt(encrypted, key) {
    const text = Buffer.from(encrypted, 'base64').toString();
    let result = '';
    for (let i = 0; i < text.length; i++) {
        result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return result;
}

// Tạo key ngẫu nhiên
function generateKey() {
    return Array.from({length: 32}, () => Math.random().toString(36)[2]).join('');
}

// Bot detection
function detectBot(req) {
    const ua = (req.headers['user-agent'] || '').toLowerCase();
    const acceptHeader = (req.headers['accept'] || '').toLowerCase();
    
    // Discord bot patterns
    const discordPatterns = [
        'discordbot', 'discord', 'telegrambot', 'slackbot', 'whatsapp',
        'facebookexternalhit', 'twitterbot', 'linkedinbot', 'googlebot',
        'bingbot', 'yandexbot', 'baiduspider', 'duckduckbot',
        'ahrefsbot', 'semrushbot', 'mj12bot', 'dotbot', 'rogerbot'
    ];
    
    const isBot = discordPatterns.some(pattern => ua.includes(pattern));
    
    // Check if request wants HTML (browser)
    const wantsHTML = acceptHeader.includes('text/html') || 
                      acceptHeader.includes('application/xhtml') ||
                      acceptHeader.includes('*/*');
    
    return {
        isDiscordBot: discordPatterns.some(p => ua.includes(p)),
        isBot: isBot || ua.includes('bot') || ua.includes('crawler') || ua.includes('spider'),
        wantsHTML: wantsHTML,
        isBrowser: ua.includes('mozilla') || ua.includes('chrome') || ua.includes('safari') || ua.includes('firefox')
    };
}

export default function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, X-Script-Key, X-Access-Token');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // POST - Tạo RAW mới với mã hóa
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
            
            // Tạo key mã hóa duy nhất cho script này
            const scriptKey = generateKey();
            
            // Mã hóa nội dung trước khi lưu
            const encryptedCode = simpleEncrypt(code, scriptKey);
            
            global.scripts[nameSlug] = {
                encryptedCode: encryptedCode,
                name: name.trim(),
                created: Date.now(),
                lastAccessed: Date.now(),
                accessCount: 0
            };
            
            // Lưu key riêng
            global.scriptKeys[nameSlug] = scriptKey;

            console.log('Scripts in memory:', Object.keys(global.scripts));

            // URL truy cập đã được bảo vệ
            const rawUrl = `https://${req.headers.host}/api/raw?name=${nameSlug}&key=${scriptKey}`;
            
            return res.status(200).json({
                success: true,
                raw: rawUrl,
                name: nameSlug,
                accessKey: scriptKey, // Gửi key cho người dùng (chỉ hiển thị 1 lần)
                note: 'Hãy lưu key này! Nó sẽ không hiển thị lại.'
            });
        } catch (error) {
            return res.status(500).json({ success: false, error: error.message });
        }
    }

    // PUT - Cập nhật
    if (req.method === 'PUT') {
        try {
            const { name, code, accessKey } = req.body;
            
            if (!name || !global.scripts[name]) {
                return res.status(404).json({ success: false, error: 'Script not found' });
            }
            
            if (!code || !code.trim()) {
                return res.status(400).json({ success: false, error: 'Code is required' });
            }
            
            // Xác thực key
            if (!accessKey || accessKey !== global.scriptKeys[name]) {
                return res.status(403).json({ success: false, error: 'Invalid access key' });
            }
            
            // Mã hóa nội dung mới
            const encryptedCode = simpleEncrypt(code, global.scriptKeys[name]);
            
            global.scripts[name].encryptedCode = encryptedCode;
            global.scripts[name].updated = Date.now();
            global.scripts[name].lastAccessed = Date.now();
            
            const rawUrl = `https://${req.headers.host}/api/raw?name=${name}&key=${global.scriptKeys[name]}`;
            
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
        const { name, accessKey } = req.query;
        
        if (!name || !global.scripts[name]) {
            return res.status(404).json({ success: false, error: 'Script not found' });
        }
        
        // Xác thực key
        if (!accessKey || accessKey !== global.scriptKeys[name]) {
            return res.status(403).json({ success: false, error: 'Invalid access key' });
        }
        
        delete global.scripts[name];
        delete global.scriptKeys[name];
        return res.status(200).json({ success: true, message: 'Deleted' });
    }

    // GET
    if (req.method === 'GET') {
        const { name, key } = req.query;

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

        // Bot detection
        const botInfo = detectBot(req);
        
        // Chặn bot
        if (botInfo.isBot || botInfo.isDiscordBot) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.status(403).send(getBotBlockPage(botInfo.isDiscordBot ? 'Discord Bot' : 'Bot'));
        }

        global.scripts[name].lastAccessed = Date.now();
        global.scripts[name].accessCount = (global.scripts[name].accessCount || 0) + 1;

        // Kiểm tra key truy cập
        const accessKey = key || req.headers['x-script-key'] || req.headers['x-access-token'];
        
        // Nếu không có key hoặc key sai -> trang bảo vệ
        if (!accessKey || accessKey !== global.scriptKeys[name]) {
            const ua = (req.headers['user-agent'] || '').toLowerCase();
            const acceptHeader = (req.headers['accept'] || '').toLowerCase();
            
            const isBrowser = ua.includes('mozilla') || ua.includes('chrome') || ua.includes('safari') || ua.includes('firefox');
            const wantsHTML = acceptHeader.includes('text/html') || acceptHeader.includes('*/*');

            if (isBrowser || wantsHTML) {
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                return res.send(getProtectionPage());
            }
            
            // Nếu là request API (không phải browser) -> trả về lỗi
            return res.status(403).json({ 
                success: false, 
                error: 'Access denied. Valid key required.',
                hint: 'Use ?key=YOUR_ACCESS_KEY in URL or X-Script-Key header'
            });
        }

        // Key hợp lệ -> giải mã và trả về nội dung
        try {
            const decryptedCode = simpleDecrypt(global.scripts[name].encryptedCode, global.scriptKeys[name]);
            
            // Trả về code cho executor (không phải browser)
            const ua = (req.headers['user-agent'] || '').toLowerCase();
            const acceptHeader = (req.headers['accept'] || '').toLowerCase();
            
            // Nếu là browser với key hợp lệ -> hiển thị trang download
            if (ua.includes('mozilla') && acceptHeader.includes('text/html')) {
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                return res.send(getDownloadPage(name, decryptedCode));
            }
            
            // Trả về code thật cho executor
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            return res.send(decryptedCode);
        } catch (error) {
            return res.status(500).json({ success: false, error: 'Decryption failed' });
        }
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
    <meta name="robots" content="noindex, nofollow">
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

        .path {
            font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
            font-size: 0.82rem;
            color: #aab;
        }

        .security-badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            margin-top: 20px;
            padding: 8px 16px;
            background: rgba(0, 210, 91, 0.1);
            border: 1px solid rgba(0, 210, 91, 0.3);
            border-radius: 50px;
            font-size: 0.75rem;
            color: #00d25b;
        }

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

        .cta-button:hover {
            background: linear-gradient(135deg, rgba(102, 126, 234, 0.35), rgba(118, 75, 162, 0.35));
            border-color: var(--gradient-1);
            color: #fff;
            transform: translateY(-2px);
            box-shadow: 0 8px 24px rgba(102, 126, 234, 0.2);
        }

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
    <div class="bg-animation">
        <div class="orb orb-1"></div>
        <div class="orb orb-2"></div>
        <div class="orb orb-3"></div>
    </div>
    <div class="grid-overlay"></div>

    <div class="container">
        <div class="card">
            <div style="text-align: center;">
                <div class="logo-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2"></polygon>
                        <line x1="12" y1="22" x2="12" y2="15.5"></line>
                        <polyline points="22 8.5 12 15.5 2 8.5"></polyline>
                    </svg>
                </div>
                <div class="logo-text">APEX HUB</div>
                <div class="subtitle">Secure Raw API Service</div>
                <div class="security-badge">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                    Protected & Encrypted
                </div>
            </div>

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
                    <span class="path">/api/raw?name=...&key=...</span>
                    <span style="margin-left: auto; color: #555; font-size: 0.7rem;">Retrieve</span>
                </div>
                <div class="endpoint">
                    <span class="method delete">DEL</span>
                    <span class="path">/api/raw?name=...</span>
                    <span style="margin-left: auto; color: #555; font-size: 0.7rem;">Delete</span>
                </div>
            </div>

            <div style="text-align: center;">
                <a href="https://code-editor-apex-ccmf.vercel.app/" class="cta-button" target="_blank">
                    Open Editor
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                        <polyline points="12 5 19 12 12 19"></polyline>
                    </svg>
                </a>
            </div>

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
    <meta name="robots" content="noindex, nofollow">
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
            0%, 100% { transform: translate(0, 0) scale(1); }
            25% { transform: translate(80px, -40px) scale(1.1); }
            50% { transform: translate(30px, 80px) scale(0.9); }
            75% { transform: translate(-80px, 30px) scale(1.05); }
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
            from { opacity: 0; transform: translateY(20px) scale(0.96); }
            to { opacity: 1; transform: translateY(0) scale(1); }
        }

        .shield-container {
            position: relative;
            display: inline-block;
            margin-bottom: 20px;
            animation: shieldPulse 2.5s ease-in-out infinite;
        }

        @keyframes shieldPulse {
            0%, 100% { filter: drop-shadow(0 0 20px rgba(255, 71, 87, 0.4)); transform: scale(1); }
            50% { filter: drop-shadow(0 0 40px rgba(255, 71, 87, 0.8)); transform: scale(1.08); }
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

        .cta-button:hover {
            background: linear-gradient(135deg, rgba(255, 71, 87, 0.25), rgba(255, 107, 129, 0.25));
            border-color: #ff4757;
            color: #fff;
            transform: translateY(-2px);
            box-shadow: 0 8px 24px rgba(255, 71, 87, 0.2);
        }

        .status-container {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            margin-top: 24px;
        }

        .status-dot {
            width: 8px;
            height: 8px;
            background: #ff4757;
            border-radius: 50%;
            animation: statusPulse 2s ease-in-out infinite;
        }

        @keyframes statusPulse {
            0%, 100% { box-shadow: 0 0 0 0 rgba(255, 71, 87, 0.6); }
            50% { box-shadow: 0 0 0 12px rgba(255, 71, 87, 0); }
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
    <div class="bg-animation">
        <div class="orb orb-1"></div>
        <div class="orb orb-2"></div>
        <div class="orb orb-3"></div>
    </div>
    <div class="grid-overlay"></div>

    <div class="container">
        <div class="card">
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

            <div class="title">
                ACTIVATE<br>
                <span class="title-gradient">PROTECTION</span>
            </div>

            <div class="divider"></div>

            <div class="info-box">
                <div class="info-label">🔒 Protected Script</div>
                <div class="info-value">This script requires a valid access key to view.</div>
            </div>

            <a href="https://code-editor-apex-ccmf.vercel.app/" class="cta-button" target="_blank">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
                Open Editor
            </a>

            <div class="status-container">
                <div class="status-dot"></div>
                <span class="status-text">Protected Script</span>
            </div>

            <div class="footer-text">APEX HUB PROTECTION SYSTEM</div>
        </div>
    </div>
</body>
</html>`;
}

function getBotBlockPage(botType) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Access Denied | APEX HUB</title>
    <meta name="robots" content="noindex, nofollow">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', system-ui, sans-serif;
            background: #0a0a1a;
            color: #e0e0ff;
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
        }
        .container {
            text-align: center;
            padding: 40px;
        }
        .icon {
            font-size: 80px;
            margin-bottom: 20px;
        }
        h1 {
            font-size: 2rem;
            margin-bottom: 10px;
            color: #ff4757;
        }
        p {
            color: #888;
            margin-bottom: 20px;
        }
        .bot-type {
            display: inline-block;
            padding: 8px 16px;
            background: rgba(255, 71, 87, 0.1);
            border: 1px solid rgba(255, 71, 87, 0.3);
            border-radius: 50px;
            color: #ff4757;
            font-size: 0.8rem;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">🚫</div>
        <h1>Access Denied</h1>
        <p>Automated access is not allowed.</p>
        <div class="bot-type">Detected: ${botType}</div>
        <p style="margin-top: 20px; font-size: 0.8rem;">Please use the official editor to access scripts.</p>
    </div>
</body>
</html>`;
}

function getDownloadPage(scriptName, code) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Download Script | APEX HUB</title>
    <meta name="robots" content="noindex, nofollow">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', system-ui, sans-serif;
            background: linear-gradient(135deg, #0a0a1a, #1a1a2e);
            color: #e0e0ff;
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }
        .card {
            background: rgba(21, 21, 48, 0.8);
            backdrop-filter: blur(20px);
            border-radius: 20px;
            padding: 40px;
            max-width: 500px;
            width: 100%;
            text-align: center;
            border: 1px solid rgba(100, 100, 255, 0.15);
        }
        .icon {
            font-size: 60px;
            margin-bottom: 20px;
        }
        h2 {
            margin-bottom: 10px;
        }
        .script-name {
            color: #667eea;
            font-weight: 600;
            margin-bottom: 20px;
            font-size: 1.2rem;
        }
        .btn {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 12px 24px;
            border-radius: 50px;
            border: none;
            cursor: pointer;
            font-weight: 600;
            text-decoration: none;
            transition: all 0.3s;
            font-size: 0.95rem;
        }
        .btn-download {
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
        }
        .btn-download:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 24px rgba(102, 126, 234, 0.3);
        }
        .btn-copy {
            background: rgba(255,255,255,0.1);
            color: #aab;
            border: 1px solid rgba(255,255,255,0.1);
            margin-left: 10px;
        }
        .btn-copy:hover {
            background: rgba(255,255,255,0.2);
        }
        .actions {
            display: flex;
            justify-content: center;
            gap: 10px;
            flex-wrap: wrap;
            margin-top: 20px;
        }
        .code-preview {
            background: rgba(0,0,0,0.3);
            border-radius: 10px;
            padding: 15px;
            margin-top: 20px;
            text-align: left;
            font-family: 'Fira Code', monospace;
            font-size: 12px;
            max-height: 200px;
            overflow-y: auto;
            color: #888;
            white-space: pre-wrap;
            word-break: break-all;
        }
    </style>
</head>
<body>
    <div class="card">
        <div class="icon">📥</div>
        <h2>Script Ready</h2>
        <div class="script-name">${scriptName}</div>
        <p style="color: #888; margin-bottom: 20px;">Your script is ready to download or copy.</p>
        <div class="actions">
            <button class="btn btn-download" onclick="downloadScript()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Download .lua
            </button>
            <button class="btn btn-copy" onclick="copyCode()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                Copy Code
            </button>
        </div>
        <div class="code-preview" id="codePreview">${code.substring(0, 300)}${code.length > 300 ? '...' : ''}</div>
    </div>
    <script>
        const code = ${JSON.stringify(code)};
        function downloadScript() {
            const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = '${scriptName}.lua';
            link.click();
            URL.revokeObjectURL(url);
        }
        function copyCode() {
            navigator.clipboard.writeText(code).then(() => {
                const btn = event.target.closest('button');
                btn.innerHTML = '✅ Copied!';
                setTimeout(() => btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy Code', 2000);
            });
        }
    </script>
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
    <meta name="robots" content="noindex, nofollow">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', system-ui, sans-serif;
            background: #0a0a1a;
            color: #e0e0ff;
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
        }
        .container { text-align: center; padding: 40px; }
        h1 { font-size: 6rem; background: linear-gradient(135deg, #ff4757, #ff6b81); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        p { color: #888; margin: 20px 0; }
        .btn {
            display: inline-block;
            padding: 12px 24px;
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            text-decoration: none;
            border-radius: 50px;
            font-weight: 600;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>404</h1>
        <p>Script not found or has been removed.</p>
        <a href="https://code-editor-apex-ccmf.vercel.app/" class="btn">Back to Editor</a>
    </div>
</body>
</html>`;
}
