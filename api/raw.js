global.scripts = global.scripts || {};
global.secureStorage = global.secureStorage || {};

function simpleEncrypt(data, key) {
    const keyStr = String(key);
    let encrypted = '';
    for (let i = 0; i < data.length; i++) {
        const charCode = data.charCodeAt(i) ^ keyStr.charCodeAt(i % keyStr.length);
        encrypted += String.fromCharCode(charCode);
    }
    return Buffer.from(encrypted).toString('base64');
}

function simpleDecrypt(encryptedData, key) {
    try {
        const keyStr = String(key);
        const decoded = Buffer.from(encryptedData, 'base64').toString();
        let decrypted = '';
        for (let i = 0; i < decoded.length; i++) {
            const charCode = decoded.charCodeAt(i) ^ keyStr.charCodeAt(i % keyStr.length);
            decrypted += String.fromCharCode(charCode);
        }
        return decrypted;
    } catch (e) {
        return null;
    }
}

function isBot(userAgent, headers) {
    const ua = (userAgent || '').toLowerCase();
    
    const botPatterns = [
        'discordbot', 'discord', 'telegrambot', 'slackbot',
        'facebookexternalhit', 'twitterbot', 'googlebot',
        'bingbot', 'yandexbot', 'baiduspider', 'duckduckbot',
        'ahrefsbot', 'semrushbot', 'mj12bot', 'dotbot',
        'python-requests', 'curl', 'wget', 'node-fetch',
        'axios', 'okhttp', 'go-http-client', 'java',
        'libwww-perl', 'httpclient', 'scrapy', 'bot',
        'crawler', 'spider', 'scraper', 'headless',
        'phantomjs', 'selenium', 'puppeteer', 'playwright'
    ];
    
    const isBotUA = botPatterns.some(pattern => ua.includes(pattern));
    
    const suspiciousHeaders = [
        !headers['accept-language'],
        !headers['accept-encoding']
    ].filter(Boolean).length;
    
    return isBotUA || suspiciousHeaders >= 2;
}

export default function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, X-Script-Key');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method === 'POST') {
        try {
            const { code, name, key } = req.body;
            
            if (!code || !code.trim()) {
                return res.status(400).json({ success: false, error: 'Code is required' });
            }

            if (!name || !name.trim()) {
                return res.status(400).json({ success: false, error: 'Name is required' });
            }

            if (!key || !key.trim()) {
                return res.status(400).json({ success: false, error: 'Key is required' });
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
            
            const storageId = Math.random().toString(36).substring(2, 15) + 
                            Math.random().toString(36).substring(2, 15);
            
            const encryptedCode = simpleEncrypt(code, key);
            
            global.secureStorage[storageId] = {
                encryptedCode: encryptedCode,
                keyHash: simpleEncrypt(key, 'apex_hub_salt'),
                created: Date.now()
            };
            
            global.scripts[nameSlug] = {
                storageId: storageId,
                name: name.trim(),
                created: Date.now(),
                lastAccessed: Date.now()
            };

            console.log('Scripts in memory:', Object.keys(global.scripts));

            const rawUrl = `https://${req.headers.host}/api/raw?script=${storageId}`;
            
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

    if (req.method === 'PUT') {
        try {
            const { name, code, key } = req.body;
            
            if (!name || !global.scripts[name]) {
                return res.status(404).json({ success: false, error: 'Script not found' });
            }
            
            if (!code || !code.trim()) {
                return res.status(400).json({ success: false, error: 'Code is required' });
            }
            
            if (!key || !key.trim()) {
                return res.status(400).json({ success: false, error: 'Key is required' });
            }
            
            const script = global.scripts[name];
            const storageData = global.secureStorage[script.storageId];
            
            if (!storageData) {
                return res.status(404).json({ success: false, error: 'Storage not found' });
            }
            
            const providedKeyHash = simpleEncrypt(key, 'apex_hub_salt');
            if (providedKeyHash !== storageData.keyHash) {
                return res.status(403).json({ success: false, error: 'Invalid key' });
            }
            
            storageData.encryptedCode = simpleEncrypt(code, key);
            script.updated = Date.now();
            script.lastAccessed = Date.now();
            
            return res.status(200).json({
                success: true,
                message: 'Updated successfully'
            });
        } catch (error) {
            return res.status(500).json({ success: false, error: error.message });
        }
    }

    if (req.method === 'DELETE') {
        const { name } = req.query;
        if (name && global.scripts[name]) {
            const storageId = global.scripts[name].storageId;
            delete global.scripts[name];
            delete global.secureStorage[storageId];
            return res.status(200).json({ success: true, message: 'Deleted' });
        }
        return res.status(404).json({ success: false, error: 'Script not found' });
    }

    if (req.method === 'GET') {
        const { name, script, key } = req.query;

        if (!name && !script) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.send(getWelcomePage());
        }

        if (script) {
            const storageData = global.secureStorage[script];
            
            if (!storageData) {
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                return res.status(404).send(getErrorPage());
            }

            const ua = (req.headers['user-agent'] || '').toLowerCase();
            if (isBot(req.headers['user-agent'], req.headers)) {
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                return res.status(403).send(getBotBlockPage());
            }

            const isBrowser = ua.includes('mozilla') || ua.includes('chrome') || 
                            ua.includes('safari') || ua.includes('firefox') || 
                            ua.includes('edge');
            const acceptHeader = (req.headers['accept'] || '').toLowerCase();
            const wantsHTML = acceptHeader.includes('text/html');

            if (isBrowser && wantsHTML && !key) {
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                return res.send(getProtectionPage(script));
            }

            if (key) {
                const decrypted = simpleDecrypt(storageData.encryptedCode, key);
                if (decrypted) {
                    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
                    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
                    return res.send(decrypted);
                } else {
                    return res.status(403).json({ success: false, error: 'Invalid key' });
                }
            }

            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.send(getProtectionPage(script));
        }

        if (name && global.scripts[name]) {
            global.scripts[name].lastAccessed = Date.now();

            const ua = (req.headers['user-agent'] || '').toLowerCase();
            const acceptHeader = (req.headers['accept'] || '').toLowerCase();
            
            const isBrowser = ua.includes('mozilla') || ua.includes('chrome') || 
                            ua.includes('safari') || ua.includes('firefox') || 
                            ua.includes('edge');
            const wantsHTML = acceptHeader.includes('text/html');

            if (isBrowser && wantsHTML) {
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                return res.send(getProtectionPage(global.scripts[name].storageId));
            }

            if (key) {
                const storageData = global.secureStorage[global.scripts[name].storageId];
                const decrypted = simpleDecrypt(storageData.encryptedCode, key);
                if (decrypted) {
                    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
                    return res.send(decrypted);
                }
            }
        }

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(404).send(getErrorPage());
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
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; 
            background: #0a0a1a; 
            color: #e0e0ff; 
            min-height: 100vh; 
            display: flex; 
            justify-content: center; 
            align-items: center; 
            overflow: hidden;
            position: relative;
        }
        .bg-animation { position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 0; pointer-events: none; }
        .orb { position: absolute; border-radius: 50%; filter: blur(80px); opacity: 0.3; animation: float 20s infinite ease-in-out; }
        .orb-1 { width: 400px; height: 400px; background: radial-gradient(circle, #667eea, transparent); top: -100px; left: -100px; }
        .orb-2 { width: 350px; height: 350px; background: radial-gradient(circle, #764ba2, transparent); bottom: -100px; right: -100px; animation-delay: -7s; }
        .orb-3 { width: 300px; height: 300px; background: radial-gradient(circle, #ff4757, transparent); top: 50%; left: 50%; transform: translate(-50%, -50%); animation-delay: -14s; }
        @keyframes float {
            0%, 100% { transform: translate(0, 0) scale(1); }
            25% { transform: translate(100px, -50px) scale(1.1); }
            50% { transform: translate(50px, 100px) scale(0.9); }
            75% { transform: translate(-100px, 50px) scale(1.05); }
        }
        .grid-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-image: linear-gradient(rgba(100, 100, 255, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(100, 100, 255, 0.03) 1px, transparent 1px); background-size: 60px 60px; z-index: 0; pointer-events: none; }
        .container { position: relative; z-index: 1; width: 90%; max-width: 500px; }
        .card { 
            background: rgba(21, 21, 48, 0.8); 
            backdrop-filter: blur(20px); 
            -webkit-backdrop-filter: blur(20px); 
            border-radius: 24px; 
            padding: 48px 40px; 
            border: 1px solid rgba(100, 100, 255, 0.15); 
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(100, 100, 255, 0.05) inset, 0 0 120px rgba(102, 126, 234, 0.1); 
            animation: cardAppear 0.8s cubic-bezier(0.16, 1, 0.3, 1); 
            position: relative; 
            overflow: hidden;
        }
        .card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent); }
        @keyframes cardAppear { from { opacity: 0; transform: translateY(30px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .logo-text { font-size: 2rem; font-weight: 800; background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #ff6b81 100%); background-size: 200% 200%; -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; animation: gradientShift 4s ease-in-out infinite; letter-spacing: -0.5px; }
        @keyframes gradientShift { 0%, 100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }
        .subtitle { color: #8888aa; font-size: 0.9rem; margin-bottom: 32px; letter-spacing: 0.05em; }
        .endpoints { background: rgba(15, 15, 35, 0.6); border-radius: 16px; padding: 24px; border: 1px solid rgba(255,255,255,0.05); }
        .endpoint { display: flex; align-items: center; padding: 12px 16px; margin-bottom: 8px; border-radius: 10px; background: rgba(255,255,255,0.02); transition: all 0.3s ease; }
        .endpoint:last-child { margin-bottom: 0; }
        .endpoint:hover { background: rgba(255,255,255,0.05); transform: translateX(4px); }
        .method { display: inline-flex; align-items: center; justify-content: center; padding: 4px 10px; border-radius: 6px; font-weight: 700; font-size: 0.7rem; letter-spacing: 0.05em; min-width: 56px; margin-right: 12px; text-transform: uppercase; color: #fff; }
        .method.post { background: linear-gradient(135deg, #00d25b, #00a844); }
        .method.put { background: linear-gradient(135deg, #ffa502, #e68a00); }
        .method.get { background: linear-gradient(135deg, #667eea, #4c63d2); }
        .method.delete { background: linear-gradient(135deg, #ff4757, #e03444); }
        .path { font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace; font-size: 0.82rem; color: #aab; }
        .cta-button { display: inline-flex; align-items: center; gap: 8px; margin-top: 28px; padding: 14px 32px; background: linear-gradient(135deg, rgba(102, 126, 234, 0.2), rgba(118, 75, 162, 0.2)); border: 1px solid rgba(102, 126, 234, 0.3); border-radius: 14px; color: #aab; text-decoration: none; font-weight: 600; font-size: 0.9rem; transition: all 0.3s ease; }
        .cta-button:hover { background: linear-gradient(135deg, rgba(102, 126, 234, 0.35), rgba(118, 75, 162, 0.35)); border-color: #667eea; color: #fff; transform: translateY(-2px); box-shadow: 0 8px 24px rgba(102, 126, 234, 0.2); }
        .status-bar { display: flex; align-items: center; justify-content: center; gap: 10px; margin-top: 20px; font-size: 0.7rem; color: #555; letter-spacing: 0.15em; text-transform: uppercase; }
        .status-dot { width: 6px; height: 6px; background: #00d25b; border-radius: 50%; animation: statusPulse 2s ease-in-out infinite; }
        @keyframes statusPulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(0, 210, 91, 0.6); } 50% { box-shadow: 0 0 0 12px rgba(0, 210, 91, 0); } }
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
                <div class="logo-text">APEX HUB</div>
                <div class="subtitle">Raw API Service</div>
            </div>
            <div class="endpoints">
                <div class="endpoint"><span class="method post">POST</span><span class="path">/api/raw</span><span style="margin-left: auto; color: #555; font-size: 0.7rem;">Create</span></div>
                <div class="endpoint"><span class="method put">PUT</span><span class="path">/api/raw</span><span style="margin-left: auto; color: #555; font-size: 0.7rem;">Update</span></div>
                <div class="endpoint"><span class="method get">GET</span><span class="path">/api/raw?script=...</span><span style="margin-left: auto; color: #555; font-size: 0.7rem;">Retrieve</span></div>
                <div class="endpoint"><span class="method delete">DEL</span><span class="path">/api/raw?name=...</span><span style="margin-left: auto; color: #555; font-size: 0.7rem;">Delete</span></div>
            </div>
            <div style="text-align: center;">
                <a href="https://code-editor-apex-ccmf.vercel.app/" class="cta-button" target="_blank">Open Editor <span style="font-size: 1.2rem;">&rarr;</span></a>
            </div>
            <div class="status-bar"><span class="status-dot"></span><span>System Online</span></div>
        </div>
    </div>
</body>
</html>`;
}

function getProtectionPage(storageId) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>APEX HUB | Protected</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; background: #0a0a1a; color: #e0e0ff; min-height: 100vh; display: flex; justify-content: center; align-items: center; overflow: hidden; position: relative; }
        .bg-animation { position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 0; pointer-events: none; }
        .orb { position: absolute; border-radius: 50%; filter: blur(80px); opacity: 0.3; animation: float 20s infinite ease-in-out; }
        .orb-1 { width: 400px; height: 400px; background: radial-gradient(circle, #ff4757, transparent); top: -100px; left: -100px; }
        .orb-2 { width: 350px; height: 350px; background: radial-gradient(circle, #667eea, transparent); bottom: -100px; right: -100px; animation-delay: -7s; }
        .orb-3 { width: 300px; height: 300px; background: radial-gradient(circle, #764ba2, transparent); top: 50%; left: 50%; transform: translate(-50%, -50%); animation-delay: -14s; }
        @keyframes float { 0%, 100% { transform: translate(0, 0) scale(1); } 25% { transform: translate(80px, -40px) scale(1.1); } 50% { transform: translate(30px, 80px) scale(0.9); } 75% { transform: translate(-80px, 30px) scale(1.05); } }
        .grid-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-image: linear-gradient(rgba(255, 71, 87, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 71, 87, 0.03) 1px, transparent 1px); background-size: 60px 60px; z-index: 0; pointer-events: none; }
        .container { position: relative; z-index: 1; width: 90%; max-width: 460px; }
        .card { background: rgba(21, 21, 48, 0.8); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border-radius: 24px; padding: 48px 40px; border: 1px solid rgba(100, 100, 255, 0.15); box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 71, 87, 0.05) inset, 0 0 120px rgba(255, 71, 87, 0.08); animation: cardAppear 0.6s cubic-bezier(0.16, 1, 0.3, 1); position: relative; overflow: hidden; }
        .card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px; background: linear-gradient(90deg, transparent, rgba(255,71,87,0.3), transparent); }
        @keyframes cardAppear { from { opacity: 0; transform: translateY(20px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .title { font-size: 1.8rem; font-weight: 900; text-align: center; line-height: 1.2; margin-bottom: 8px; }
        .title-gradient { background: linear-gradient(135deg, #ff6b81, #ff4757, #ff6b81); background-size: 200% 200%; -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; animation: gradientShift 3s ease-in-out infinite; }
        @keyframes gradientShift { 0%, 100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }
        .divider { height: 1px; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent); margin: 28px 0; }
        .info-box { background: rgba(15, 15, 35, 0.6); border-radius: 14px; padding: 20px; border: 1px solid rgba(255,255,255,0.05); }
        .info-label { font-size: 0.65rem; color: #555; text-transform: uppercase; letter-spacing: 0.2em; margin-bottom: 10px; font-weight: 600; }
        .info-value { font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace; font-size: 0.8rem; color: #888; word-break: break-all; padding: 12px; background: rgba(0,0,0,0.3); border-radius: 8px; border: 1px solid rgba(255,255,255,0.05); }
        .cta-button { display: flex; align-items: center; justify-content: center; gap: 10px; width: 100%; padding: 15px; margin-top: 24px; background: linear-gradient(135deg, rgba(255, 71, 87, 0.15), rgba(255, 107, 129, 0.15)); border: 1px solid rgba(255, 71, 87, 0.25); border-radius: 14px; color: #ff6b81; text-decoration: none; font-weight: 600; font-size: 0.9rem; transition: all 0.3s ease; }
        .cta-button:hover { background: linear-gradient(135deg, rgba(255, 71, 87, 0.25), rgba(255, 107, 129, 0.25)); border-color: #ff4757; color: #fff; transform: translateY(-2px); box-shadow: 0 8px 24px rgba(255, 71, 87, 0.2); }
        .status-container { display: flex; align-items: center; justify-content: center; gap: 10px; margin-top: 24px; }
        .status-dot { width: 8px; height: 8px; background: #ff4757; border-radius: 50%; animation: ripple 2s ease-out infinite; }
        @keyframes ripple { 0% { box-shadow: 0 0 0 0 rgba(255, 71, 87, 0.6); } 100% { box-shadow: 0 0 0 12px rgba(255, 71, 87, 0); } }
        .status-text { font-size: 0.7rem; color: #555; text-transform: uppercase; letter-spacing: 0.2em; font-weight: 600; }
        .footer-text { text-align: center; margin-top: 20px; font-size: 0.6rem; color: #333; letter-spacing: 0.15em; text-transform: uppercase; }
        .key-input { width: 100%; padding: 12px; margin-top: 16px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; color: #fff; font-family: 'SF Mono', 'Fira Code', monospace; font-size: 0.9rem; text-align: center; }
        .key-input:focus { outline: none; border-color: #ff4757; }
        .access-button { display: flex; align-items: center; justify-content: center; gap: 10px; width: 100%; padding: 12px; margin-top: 8px; background: linear-gradient(135deg, #ff4757, #ff6b81); border: none; border-radius: 10px; color: #fff; font-weight: 600; cursor: pointer; font-size: 0.85rem; transition: all 0.3s ease; }
        .access-button:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(255, 71, 87, 0.3); }
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
            <div class="title">ACTIVATE<br><span class="title-gradient">PROTECTION</span></div>
            <div class="divider"></div>
            <div class="info-box">
                <div class="info-label">Access URL</div>
                <div class="info-value">code-editor-apex-ccmf.vercel.app</div>
            </div>
            <input type="password" class="key-input" id="accessKey" placeholder="Enter access key..." autocomplete="off">
            <button class="access-button" onclick="accessScript()">Access Script</button>
            <a href="https://code-editor-apex-ccmf.vercel.app/" class="cta-button" target="_blank">Open Editor</a>
            <div class="status-container">
                <div class="status-dot"></div>
                <span class="status-text">Protected Script</span>
            </div>
            <div class="footer-text">APEX HUB PROTECTION SYSTEM</div>
        </div>
    </div>
    <script>
        function accessScript() {
            const key = document.getElementById('accessKey').value.trim();
            if (!key) {
                alert('Please enter the access key');
                return;
            }
            const currentUrl = new URL(window.location.href);
            currentUrl.searchParams.set('key', key);
            window.location.href = currentUrl.toString();
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
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; background: #0a0a1a; color: #e0e0ff; min-height: 100vh; display: flex; justify-content: center; align-items: center; overflow: hidden; position: relative; }
        .container { position: relative; z-index: 1; width: 90%; max-width: 420px; }
        .card { background: rgba(21, 21, 48, 0.8); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border-radius: 24px; padding: 48px 40px; border: 1px solid rgba(100, 100, 255, 0.15); box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4); text-align: center; }
        .error-code { font-size: 6rem; font-weight: 900; background: linear-gradient(135deg, #ff4757, #ff6b81); -webkit-background-clip: text; -webkit-text-fill-color: transparent; line-height: 1; }
        .error-title { font-size: 1.4rem; font-weight: 700; margin: 16px 0 8px; color: #ff4757; }
        .error-message { color: #888; font-size: 0.9rem; margin-bottom: 32px; }
        .back-button { display: inline-flex; align-items: center; gap: 8px; padding: 14px 28px; background: linear-gradient(135deg, rgba(102, 126, 234, 0.15), rgba(118, 75, 162, 0.15)); border: 1px solid rgba(102, 126, 234, 0.25); border-radius: 14px; color: #667eea; text-decoration: none; font-weight: 600; font-size: 0.9rem; transition: all 0.3s ease; }
        .back-button:hover { background: linear-gradient(135deg, rgba(102, 126, 234, 0.25), rgba(118, 75, 162, 0.25)); border-color: #667eea; color: #fff; transform: translateY(-2px); }
    </style>
</head>
<body>
    <div class="container">
        <div class="card">
            <div class="error-code">404</div>
            <div class="error-title">Script Not Found</div>
            <div class="error-message">The script doesn't exist or has expired.</div>
            <a href="https://code-editor-apex-ccmf.vercel.app/" class="back-button"><span>&larr;</span> Back to Editor</a>
        </div>
    </div>
</body>
</html>`;
}

function getBotBlockPage() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Access Denied | APEX HUB</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', system-ui, sans-serif; background: #0a0a1a; color: #fff; min-height: 100vh; display: flex; justify-content: center; align-items: center; }
        .card { background: rgba(21, 21, 48, 0.8); backdrop-filter: blur(20px); border-radius: 24px; padding: 48px 40px; max-width: 450px; width: 90%; text-align: center; border: 1px solid rgba(255, 71, 87, 0.2); box-shadow: 0 8px 32px rgba(0,0,0,0.4); }
        h1 { font-size: 1.8rem; font-weight: 900; margin-bottom: 16px; background: linear-gradient(135deg, #ff4757, #ff6b81); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        p { color: #888; margin-bottom: 24px; line-height: 1.6; }
        .code { background: rgba(0,0,0,0.3); padding: 12px 16px; border-radius: 8px; font-family: monospace; color: #ff6b81; font-size: 0.8rem; }
    </style>
</head>
<body>
    <div class="card">
        <h1>ACCESS DENIED</h1>
        <p>Automated access (bots/crawlers) is not allowed. Please use a regular browser to access this content.</p>
        <div class="code">BOT_ACCESS_BLOCKED</div>
    </div>
</body>
</html>`;
}
