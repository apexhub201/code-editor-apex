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

            const scriptTitle = name.trim();
            const nameSlug = scriptTitle
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
                name: scriptTitle,
                created: Date.now(),
                lastAccessed: Date.now()
            };

            const rawUrl = `https://${req.headers.host}/api/raw/${nameSlug}`;
            
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
            
            const rawUrl = `https://${req.headers.host}/api/raw/${name}`;
            
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

    // DELETE - Xóa
    if (req.method === 'DELETE') {
        const { name } = req.query;
        if (name && global.scripts[name]) {
            delete global.scripts[name];
            return res.status(200).json({ success: true, message: 'Deleted' });
        }
        return res.status(404).json({ success: false, error: 'Script not found' });
    }

    // GET không có name -> trang chủ
    if (req.method === 'GET') {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>APEX HUB - API</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: sans-serif; background: #050510; color: #fff; min-height: 100vh; display: flex; justify-content: center; align-items: center; }
        .card { background: rgba(15,15,30,0.9); border-radius: 24px; padding: 40px; max-width: 500px; text-align: center; border: 1px solid rgba(255,255,255,0.08); }
        .logo { font-size: 2rem; font-weight: 800; background: linear-gradient(135deg, #667eea, #764ba2); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 20px; }
        h1 { font-size: 1.5rem; margin-bottom: 10px; }
        p { color: rgba(255,255,255,0.5); margin-bottom: 20px; }
        .endpoints { text-align: left; background: rgba(0,0,0,0.2); border-radius: 12px; padding: 20px; margin: 20px 0; }
        .endpoint { padding: 10px; margin: 5px 0; border-radius: 8px; font-family: monospace; }
        .method { display: inline-block; padding: 4px 8px; border-radius: 4px; font-weight: bold; margin-right: 8px; font-size: 0.8rem; }
        .post { background: #00d25b; color: #fff; }
        .put { background: #ffa502; color: #fff; }
        .get { background: #667eea; color: #fff; }
        .delete { background: #ff4757; color: #fff; }
        .link { color: #667eea; text-decoration: none; font-weight: 600; }
        .link:hover { color: #764ba2; }
    </style>
</head>
<body>
    <div class="card">
        <div class="logo">APEX HUB</div>
        <h1>Raw API Service</h1>
        <p>Create, update, and serve protected Lua scripts</p>
        <div class="endpoints">
            <div class="endpoint"><span class="method post">POST</span> /api/raw - Create script</div>
            <div class="endpoint"><span class="method put">PUT</span> /api/raw - Update script</div>
            <div class="endpoint"><span class="method get">GET</span> /api/raw/script-name - View script</div>
            <div class="endpoint"><span class="method delete">DELETE</span> /api/raw?name=xxx - Delete script</div>
        </div>
        <a href="https://code-editor-apex-ccmf.vercel.app/" class="link">Open Editor</a>
    </div>
</body>
</html>`);
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
