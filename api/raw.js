global.scripts = global.scripts || {};
global.scriptKeys = global.scriptKeys || {};

// ==================== ENCRYPTION ====================
function simpleEncrypt(text, key) {
    let result = '';
    for (let i = 0; i < text.length; i++) {
        const charCode = text.charCodeAt(i) ^ key.charCodeAt(i % key.length);
        result += String.fromCharCode(charCode);
    }
    return Buffer.from(result).toString('base64');
}

function simpleDecrypt(encryptedBase64, key) {
    try {
        const encrypted = Buffer.from(encryptedBase64, 'base64').toString();
        let result = '';
        for (let i = 0; i < encrypted.length; i++) {
            const charCode = encrypted.charCodeAt(i) ^ key.charCodeAt(i % key.length);
            result += String.fromCharCode(charCode);
        }
        return result;
    } catch (e) {
        return null;
    }
}

function generateStorageId() {
    return 's_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

function hashKey(key) {
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
        const char = key.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return 'k_' + Math.abs(hash).toString(36);
}

// ==================== BOT DETECTION ====================
const BOT_PATTERNS = [
    'discordbot', 'discord', 'telegrambot', 'slackbot', 'whatsapp',
    'facebookexternalhit', 'twitterbot', 'linkedinbot', 'googlebot',
    'bingbot', 'yandexbot', 'baiduspider', 'duckduckbot', 'ahrefsbot',
    'semrushbot', 'mj12bot', 'dotbot', 'rogerbot', 'exabot',
    'facebot', 'python-requests', 'curl/', 'wget/', 'node-fetch',
    'axios/', 'okhttp/', 'go-http-client', 'java/', 'libwww-perl',
    'httpclient', 'scrapy', 'mechanize', 'bot', 'crawler',
    'spider', 'scraper', 'headless', 'phantomjs', 'selenium',
    'puppeteer', 'playwright', 'postman', 'insomnia'
];

function isBot(userAgent) {
    if (!userAgent) return true;
    const ua = userAgent.toLowerCase();
    return BOT_PATTERNS.some(pattern => ua.includes(pattern));
}

// ==================== RATE LIMIT ====================
const rateLimit = new Map();

function checkRateLimit(ip) {
    const now = Date.now();
    const key = ip || 'unknown';
    
    if (!rateLimit.has(key)) {
        rateLimit.set(key, { count: 1, resetTime: now + 60000 });
        return true;
    }
    
    const data = rateLimit.get(key);
    if (now > data.resetTime) {
        data.count = 1;
        data.resetTime = now + 60000;
        return true;
    }
    
    data.count++;
    return data.count <= 60;
}

// ==================== API HANDLER ====================
export default function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, X-Access-Key');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const clientIP = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    if (!checkRateLimit(clientIP)) {
        return res.status(429).json({ success: false, error: 'Quá nhiều request. Thử lại sau.' });
    }

    // ==================== POST - Tạo Script ====================
    if (req.method === 'POST') {
        try {
            const { code, name, key } = req.body;
            
            if (!code || !code.trim()) {
                return res.status(400).json({ success: false, error: 'Code không được để trống' });
            }
            if (!name || !name.trim()) {
                return res.status(400).json({ success: false, error: 'Tên script không được để trống' });
            }
            if (!key || !key.trim()) {
                return res.status(400).json({ success: false, error: 'Key bảo vệ không được để trống' });
            }

            const nameSlug = name.trim().toLowerCase()
                .replace(/[^a-z0-9\s-]/g, '')
                .replace(/\s+/g, '-')
                .replace(/-+/g, '-')
                .replace(/^-|-$/g, '') || 'script';

            if (global.scripts[nameSlug]) {
                return res.status(409).json({ success: false, error: 'Tên script đã tồn tại' });
            }

            const storageId = generateStorageId();
            const keyHash = hashKey(key);
            
            // Mã hóa code bằng key của người dùng
            const encryptedCode = simpleEncrypt(code, key);
            
            global.scripts[nameSlug] = {
                storageId: storageId,
                encryptedCode: encryptedCode,
                name: name.trim(),
                keyHash: keyHash,
                created: Date.now(),
                updated: Date.now()
            };
            
            global.scriptKeys[storageId] = {
                keyHash: keyHash,
                nameSlug: nameSlug
            };

            // Tạo link truy cập (storageId đã được mã hóa)
            const encodedStorage = Buffer.from(storageId).toString('base64');
            const rawUrl = `https://${req.headers.host}/api/raw?q=${encodedStorage}`;

            return res.status(200).json({
                success: true,
                raw: rawUrl,
                name: nameSlug,
                storageId: storageId
            });
        } catch (error) {
            return res.status(500).json({ success: false, error: error.message });
        }
    }

    // ==================== PUT - Cập nhật Script ====================
    if (req.method === 'PUT') {
        try {
            const { name, code, key } = req.body;
            
            if (!name || !global.scripts[name]) {
                return res.status(404).json({ success: false, error: 'Script không tồn tại' });
            }
            if (!code || !code.trim()) {
                return res.status(400).json({ success: false, error: 'Code không được để trống' });
            }
            if (!key || !key.trim()) {
                return res.status(400).json({ success: false, error: 'Key không được để trống' });
            }

            const script = global.scripts[name];
            const providedKeyHash = hashKey(key);
            
            // Kiểm tra key có khớp không
            if (providedKeyHash !== script.keyHash) {
                return res.status(403).json({ success: false, error: 'Sai key bảo vệ! Không thể cập nhật.' });
            }

            // Mã hóa code mới bằng key
            script.encryptedCode = simpleEncrypt(code, key);
            script.updated = Date.now();

            const encodedStorage = Buffer.from(script.storageId).toString('base64');
            const rawUrl = `https://${req.headers.host}/api/raw?q=${encodedStorage}`;

            return res.status(200).json({
                success: true,
                message: 'Đã cập nhật script!',
                raw: rawUrl,
                name: name
            });
        } catch (error) {
            return res.status(500).json({ success: false, error: error.message });
        }
    }

    // ==================== DELETE - Xóa Script ====================
    if (req.method === 'DELETE') {
        const { name, key } = req.query;
        
        if (!name || !global.scripts[name]) {
            return res.status(404).json({ success: false, error: 'Script không tồn tại' });
        }

        const script = global.scripts[name];
        
        if (key) {
            const providedKeyHash = hashKey(key);
            if (providedKeyHash !== script.keyHash) {
                return res.status(403).json({ success: false, error: 'Sai key bảo vệ!' });
            }
        }

        delete global.scriptKeys[script.storageId];
        delete global.scripts[name];
        
        return res.status(200).json({ success: true, message: 'Đã xóa script' });
    }

    // ==================== GET - Truy cập Script ====================
    if (req.method === 'GET') {
        const { name, q, key } = req.query;

        // Không có tham số -> Trang chủ
        if (!name && !q) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.send(getWelcomePage());
        }

        // Kiểm tra bot
        const userAgent = req.headers['user-agent'] || '';
        if (isBot(userAgent)) {
            console.log('Bot blocked:', userAgent.substring(0, 100));
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.status(403).send(getBotBlockPage());
        }

        let scriptData = null;
        let scriptName = null;

        // Truy cập bằng storageId (q)
        if (q) {
            try {
                const storageId = Buffer.from(q, 'base64').toString();
                
                for (const [name, data] of Object.entries(global.scripts)) {
                    if (data.storageId === storageId) {
                        scriptData = data;
                        scriptName = name;
                        break;
                    }
                }
            } catch (e) {
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                return res.status(400).send(getErrorPage('Link không hợp lệ'));
            }
        }
        
        // Truy cập bằng tên script
        if (name && global.scripts[name]) {
            scriptData = global.scripts[name];
            scriptName = name;
        }

        if (!scriptData) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.status(404).send(getErrorPage('Script không tồn tại'));
        }

        // Kiểm tra browser
        const acceptHeader = (req.headers['accept'] || '').toLowerCase();
        const wantsHTML = acceptHeader.includes('text/html') || acceptHeader.includes('*/*');
        const isBrowser = /mozilla|chrome|safari|firefox|edge/i.test(userAgent);

        // Nếu là browser -> Hiện trang yêu cầu key
        if (isBrowser && wantsHTML) {
            // Nếu có key -> Thử giải mã và hiển thị
            if (key) {
                const decrypted = simpleDecrypt(scriptData.encryptedCode, key);
                if (decrypted !== null) {
                    const providedHash = hashKey(key);
                    if (providedHash === scriptData.keyHash) {
                        // Key đúng -> Trả về code
                        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
                        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
                        return res.send(decrypted);
                    }
                }
                // Key sai
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                return res.send(getKeyPage(scriptName, true));
            }
            
            // Không có key -> Hiện form nhập key
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.send(getKeyPage(scriptName, false));
        }

        // Không phải browser -> Cần key trong header
        const accessKey = req.headers['x-access-key'];
        if (accessKey) {
            const decrypted = simpleDecrypt(scriptData.encryptedCode, accessKey);
            if (decrypted !== null) {
                const providedHash = hashKey(accessKey);
                if (providedHash === scriptData.keyHash) {
                    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
                    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
                    return res.send(decrypted);
                }
            }
            return res.status(403).json({ success: false, error: 'Sai key' });
        }

        // Không có key -> Yêu cầu key
        return res.status(401).json({ 
            success: false, 
            error: 'Cần key để truy cập',
            needKey: true 
        });
    }

    return res.status(405).json({ error: 'Method not allowed' });
}

// ==================== PAGES ====================
function getWelcomePage() {
    return `<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>APEX HUB - Raw API</title>
    <style>
        :root {
            --bg: #0a0a1a;
            --card: rgba(21, 21, 48, 0.85);
            --border: rgba(102, 126, 234, 0.2);
            --text: #e0e0ff;
            --muted: #8888aa;
            --purple: #667eea;
            --pink: #764ba2;
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', system-ui, sans-serif;
            background: var(--bg);
            color: var(--text);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            overflow: hidden;
            position: relative;
        }
        .bg-orb {
            position: fixed;
            border-radius: 50%;
            filter: blur(100px);
            opacity: 0.25;
            pointer-events: none;
            animation: float 20s infinite ease-in-out;
        }
        .bg-orb:nth-child(1) { width: 500px; height: 500px; background: #667eea; top: -150px; left: -150px; }
        .bg-orb:nth-child(2) { width: 400px; height: 400px; background: #764ba2; bottom: -150px; right: -150px; animation-delay: -10s; }
        .bg-orb:nth-child(3) { width: 300px; height: 300px; background: #ff4757; top: 50%; left: 50%; transform: translate(-50%, -50%); animation-delay: -5s; }
        @keyframes float {
            0%, 100% { transform: translate(0, 0) scale(1); }
            33% { transform: translate(50px, -50px) scale(1.1); }
            66% { transform: translate(-50px, 50px) scale(0.9); }
        }
        .grid-bg {
            position: fixed;
            inset: 0;
            background-image: linear-gradient(rgba(102,126,234,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(102,126,234,0.04) 1px, transparent 1px);
            background-size: 60px 60px;
            pointer-events: none;
        }
        .card {
            position: relative;
            z-index: 1;
            background: var(--card);
            backdrop-filter: blur(30px);
            border-radius: 24px;
            padding: 48px 36px;
            border: 1px solid var(--border);
            box-shadow: 0 20px 60px rgba(0,0,0,0.5), 0 0 120px rgba(102,126,234,0.08);
            max-width: 480px;
            width: 90%;
            text-align: center;
            animation: slideUp 0.8s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes slideUp {
            from { opacity: 0; transform: translateY(40px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .logo {
            font-size: 2.4rem;
            font-weight: 900;
            background: linear-gradient(135deg, var(--purple), var(--pink), #ff6b81);
            background-size: 200% 200%;
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            animation: gradientShift 4s ease-in-out infinite;
            margin-bottom: 6px;
        }
        @keyframes gradientShift {
            0%, 100% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
        }
        .subtitle { color: var(--muted); font-size: 0.9rem; margin-bottom: 28px; letter-spacing: 0.05em; }
        .endpoints {
            background: rgba(15,15,40,0.6);
            border-radius: 16px;
            padding: 20px;
            text-align: left;
            border: 1px solid rgba(255,255,255,0.04);
        }
        .endpoint {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px 14px;
            border-radius: 10px;
            transition: all 0.3s;
            margin-bottom: 4px;
        }
        .endpoint:last-child { margin-bottom: 0; }
        .endpoint:hover { background: rgba(255,255,255,0.04); transform: translateX(4px); }
        .method {
            padding: 3px 10px;
            border-radius: 6px;
            font-weight: 700;
            font-size: 0.7rem;
            letter-spacing: 0.05em;
            min-width: 52px;
            text-align: center;
            color: #fff;
        }
        .post { background: #00d25b; }
        .put { background: #ffa502; }
        .get { background: #667eea; }
        .delete { background: #ff4757; }
        .path { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 0.8rem; color: #aab; flex: 1; }
        .desc { font-size: 0.7rem; color: #555; }
        .btn {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            margin-top: 24px;
            padding: 14px 28px;
            background: linear-gradient(135deg, rgba(102,126,234,0.2), rgba(118,75,162,0.2));
            border: 1px solid rgba(102,126,234,0.3);
            border-radius: 14px;
            color: #aab;
            text-decoration: none;
            font-weight: 600;
            font-size: 0.9rem;
            transition: all 0.3s;
        }
        .btn:hover {
            background: linear-gradient(135deg, rgba(102,126,234,0.35), rgba(118,75,162,0.35));
            border-color: #667eea;
            color: #fff;
            transform: translateY(-2px);
            box-shadow: 0 8px 30px rgba(102,126,234,0.2);
        }
        .status {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            margin-top: 20px;
            font-size: 0.7rem;
            color: #555;
            letter-spacing: 0.15em;
        }
        .dot {
            width: 7px;
            height: 7px;
            background: #00d25b;
            border-radius: 50%;
            animation: pulse 2s infinite;
        }
        @keyframes pulse {
            0%, 100% { box-shadow: 0 0 0 0 rgba(0,210,91,0.6); }
            50% { box-shadow: 0 0 0 12px rgba(0,210,91,0); }
        }
    </style>
</head>
<body>
    <div class="bg-orb"></div>
    <div class="bg-orb"></div>
    <div class="bg-orb"></div>
    <div class="grid-bg"></div>
    <div class="card">
        <div class="logo">APEX HUB</div>
        <div class="subtitle">🔒 Protected Raw API Service</div>
        <div class="endpoints">
            <div class="endpoint"><span class="method post">POST</span><span class="path">/api/raw</span><span class="desc">Tạo script</span></div>
            <div class="endpoint"><span class="method put">PUT</span><span class="path">/api/raw</span><span class="desc">Cập nhật</span></div>
            <div class="endpoint"><span class="method get">GET</span><span class="path">/api/raw?q=...</span><span class="desc">Truy cập</span></div>
            <div class="endpoint"><span class="method delete">DELETE</span><span class="path">/api/raw?name=...</span><span class="desc">Xóa</span></div>
        </div>
        <a href="https://code-editor-apex-ccmf.vercel.app/" class="btn" target="_blank">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/></svg>
            Mở Editor
        </a>
        <div class="status"><span class="dot"></span>System Online</div>
    </div>
</body>
</html>`;
}

function getKeyPage(scriptName, isError) {
    const errorMsg = isError ? '<div style="color:#ff4757;margin-bottom:16px;font-size:0.9rem;">❌ Key không đúng! Vui lòng thử lại.</div>' : '';
    
    return `<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>APEX HUB - Nhập Key</title>
    <style>
        :root {
            --bg: #0a0a1a;
            --card: rgba(21, 21, 48, 0.85);
            --border: rgba(102, 126, 234, 0.2);
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', system-ui, sans-serif;
            background: var(--bg);
            color: #e0e0ff;
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            overflow: hidden;
        }
        .bg-orb {
            position: fixed;
            border-radius: 50%;
            filter: blur(100px);
            opacity: 0.2;
            pointer-events: none;
            animation: float 20s infinite ease-in-out;
        }
        .bg-orb:nth-child(1) { width: 400px; height: 400px; background: #667eea; top: -100px; left: -100px; }
        .bg-orb:nth-child(2) { width: 350px; height: 350px; background: #764ba2; bottom: -100px; right: -100px; animation-delay: -10s; }
        @keyframes float {
            0%, 100% { transform: translate(0, 0) scale(1); }
            50% { transform: translate(60px, -60px) scale(1.1); }
        }
        .card {
            position: relative;
            z-index: 1;
            background: var(--card);
            backdrop-filter: blur(30px);
            border-radius: 24px;
            padding: 40px 32px;
            border: 1px solid var(--border);
            box-shadow: 0 20px 60px rgba(0,0,0,0.5);
            max-width: 420px;
            width: 90%;
            text-align: center;
            animation: slideUp 0.6s ease;
        }
        @keyframes slideUp {
            from { opacity: 0; transform: translateY(30px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .shield-icon {
            width: 64px;
            height: 64px;
            margin: 0 auto 16px;
            animation: pulse 2s infinite;
        }
        @keyframes pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.08); }
        }
        h2 {
            font-size: 1.3rem;
            margin-bottom: 6px;
            background: linear-gradient(135deg, #667eea, #764ba2);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .script-name {
            color: #888;
            font-size: 0.85rem;
            margin-bottom: 20px;
            font-family: monospace;
        }
        .input-group {
            margin-bottom: 16px;
        }
        input {
            width: 100%;
            padding: 14px 16px;
            background: rgba(15,15,40,0.8);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 12px;
            color: #fff;
            font-size: 1rem;
            text-align: center;
            letter-spacing: 0.1em;
            transition: all 0.3s;
        }
        input:focus {
            outline: none;
            border-color: #667eea;
            box-shadow: 0 0 20px rgba(102,126,234,0.2);
        }
        input::placeholder { color: #555; letter-spacing: 0; }
        button {
            width: 100%;
            padding: 14px;
            background: linear-gradient(135deg, #667eea, #764ba2);
            border: none;
            border-radius: 12px;
            color: #fff;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s;
        }
        button:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 30px rgba(102,126,234,0.3);
        }
        .hint {
            margin-top: 16px;
            font-size: 0.7rem;
            color: #555;
        }
    </style>
</head>
<body>
    <div class="bg-orb"></div>
    <div class="bg-orb"></div>
    <div class="card">
        <svg class="shield-icon" viewBox="0 0 24 24" fill="none" stroke="#667eea" stroke-width="1.5">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            <circle cx="12" cy="12" r="3" stroke="#764ba2" stroke-width="2"/>
        </svg>
        <h2>🔒 Script được bảo vệ</h2>
        <div class="script-name">${scriptName}</div>
        ${errorMsg}
        <form method="GET">
            <div class="input-group">
                <input type="password" name="key" placeholder="Nhập key để truy cập..." autofocus>
            </div>
            <button type="submit">🔓 Mở khóa Script</button>
        </form>
        <div class="hint">Script này được mã hóa. Cần key chính xác để xem nội dung.</div>
    </div>
</body>
</html>`;
}

function getBotBlockPage(reason) {
    return `<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>APEX HUB - Blocked</title>
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
        .card {
            background: rgba(21, 21, 48, 0.9);
            border-radius: 20px;
            padding: 40px;
            text-align: center;
            border: 1px solid rgba(255,71,87,0.3);
            max-width: 400px;
            width: 90%;
        }
        .icon { font-size: 4rem; margin-bottom: 16px; }
        h1 { color: #ff4757; margin-bottom: 8px; font-size: 1.5rem; }
        p { color: #888; font-size: 0.9rem; line-height: 1.5; }
    </style>
</head>
<body>
    <div class="card">
        <div class="icon">🚫</div>
        <h1>Truy cập bị từ chối</h1>
        <p>Bot/crawler không được phép truy cập.</p>
        <p style="margin-top:8px;font-size:0.75rem;color:#555;">APEX HUB Protection System</p>
    </div>
</body>
</html>`;
}

function getErrorPage(msg) {
    return `<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>APEX HUB - Error</title>
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
        .card {
            background: rgba(21, 21, 48, 0.9);
            border-radius: 20px;
            padding: 40px;
            text-align: center;
            border: 1px solid rgba(255,71,87,0.3);
            max-width: 400px;
            width: 90%;
        }
        .code { font-size: 5rem; font-weight: 900; background: linear-gradient(135deg, #ff4757, #ff6b81); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        h1 { color: #ff4757; margin: 8px 0; }
        p { color: #888; }
        a { color: #667eea; text-decoration: none; margin-top: 16px; display: inline-block; }
    </style>
</head>
<body>
    <div class="card">
        <div class="code">404</div>
        <h1>${msg || 'Không tìm thấy'}</h1>
        <p>Script không tồn tại hoặc đã bị xóa.</p>
        <a href="https://code-editor-apex-ccmf.vercel.app/">← Quay lại Editor</a>
    </div>
</body>
</html>`;
}
