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
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>APEX HUB</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: sans-serif; background: #0a0a1a; color: #fff; min-height: 100vh; display: flex; justify-content: center; align-items: center; }
        .card { background: #151530; border-radius: 20px; padding: 40px; max-width: 480px; width: 90%; text-align: center; border: 1px solid #252545; }
        .logo { font-size: 2rem; font-weight: 800; background: linear-gradient(135deg, #667eea, #764ba2); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        h1 { font-size: 1.3rem; margin: 20px 0 10px; color: #ccc; }
        p { color: #666; margin-bottom: 20px; }
        .endpoints { text-align: left; background: #1a1a2e; border-radius: 12px; padding: 20px; margin: 20px 0; }
        .endpoint { padding: 8px 10px; font-family: monospace; font-size: 0.85rem; color: #aaa; }
        .method { display: inline-block; padding: 2px 8px; border-radius: 4px; font-weight: bold; margin-right: 8px; font-size: 0.75rem; color: #fff; }
        .post { background: #00d25b; } .put { background: #ffa502; } .get { background: #667eea; } .delete { background: #ff4757; }
        .link { display: inline-block; margin-top: 20px; color: #667eea; text-decoration: none; font-weight: 600; }
        .link:hover { color: #764ba2; }
    </style>
</head>
<body>
    <div class="card">
        <div class="logo">APEX HUB</div>
        <h1>Raw API Service</h1>
        <p>Protected Lua Script Server</p>
        <div class="endpoints">
            <div class="endpoint"><span class="method post">POST</span> /api/raw - Create</div>
            <div class="endpoint"><span class="method put">PUT</span> /api/raw - Update</div>
            <div class="endpoint"><span class="method get">GET</span> /api/raw?name=xxx - Get</div>
            <div class="endpoint"><span class="method delete">DELETE</span> /api/raw?name=xxx - Delete</div>
        </div>
        <a href="https://code-editor-apex-ccmf.vercel.app/" class="link">Open Editor</a>
    </div>
</body>
</html>`;
}

function getProtectionPage() {
    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>APEX HUB</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: sans-serif; background: #0a0a1a; color: #fff; min-height: 100vh; display: flex; justify-content: center; align-items: center; }
        .card { background: #151530; border-radius: 20px; padding: 50px 40px; max-width: 440px; width: 90%; text-align: center; border: 1px solid #252545; }
        h1 { font-size: 2rem; font-weight: 900; margin-bottom: 10px; }
        h1 span { background: linear-gradient(135deg, #667eea, #764ba2); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .divider { height: 1px; background: #252545; margin: 25px 0; }
        .info { background: #1a1a2e; border-radius: 10px; padding: 15px; margin: 15px 0; }
        .label { font-size: 0.7rem; color: #555; text-transform: uppercase; letter-spacing: 0.2em; margin-bottom: 8px; }
        .value { font-family: monospace; font-size: 0.8rem; color: #888; word-break: break-all; }
        .btn { display: block; width: 100%; padding: 14px; background: #667eea20; border: 1px solid #667eea40; border-radius: 12px; color: #667eea; text-decoration: none; font-weight: 600; margin-top: 20px; transition: 0.3s; }
        .btn:hover { background: #667eea30; border-color: #667eea; color: #fff; }
        .status { display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 20px; }
        .dot { width: 6px; height: 6px; background: #ff4757; border-radius: 50%; animation: pulse 2s infinite; }
        @keyframes pulse { 0%,100% { box-shadow: 0 0 0 0 #ff475760; } 50% { box-shadow: 0 0 0 10px #ff475700; } }
        .status-text { font-size: 0.7rem; color: #555; text-transform: uppercase; letter-spacing: 0.2em; }
        .footer { margin-top: 30px; font-size: 0.6rem; color: #333; }
    </style>
</head>
<body>
    <div class="card">
        <h1>ACTIVATE<br><span>PROTECTION</span></h1>
        <div class="divider"></div>
        <div class="info">
            <div class="label">Access URL</div>
            <div class="value">code-editor-apex-ccmf.vercel.app</div>
        </div>
        <a href="https://code-editor-apex-ccmf.vercel.app/" class="btn" target="_blank">Open Editor</a>
        <div class="status">
            <div class="dot"></div>
            <span class="status-text">Protected Script</span>
        </div>
        <div class="footer">APEX HUB PROTECTION SYSTEM</div>
    </div>
</body>
</html>`;
}

function getErrorPage() {
    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>404 - APEX HUB</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: sans-serif; background: #0a0a1a; color: #fff; min-height: 100vh; display: flex; justify-content: center; align-items: center; }
        .card { background: #151530; border-radius: 20px; padding: 40px; max-width: 400px; width: 90%; text-align: center; border: 1px solid #252545; }
        .code { font-size: 4rem; font-weight: 900; background: linear-gradient(135deg, #ff4757, #ff6b81); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        h1 { color: #ff4757; margin: 10px 0; }
        p { color: #666; margin-bottom: 20px; }
        .link { color: #667eea; text-decoration: none; }
    </style>
</head>
<body>
    <div class="card">
        <div class="code">404</div>
        <h1>Script Not Found</h1>
        <p>The script doesn't exist or has expired.</p>
        <a href="https://code-editor-apex-ccmf.vercel.app/" class="link">Back to Editor</a>
    </div>
</body>
</html>`;
}
