// Sử dụng global để lưu scripts (giữ được khi hot-reload)
global.scripts = global.scripts || {};

export default function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

    // Xử lý preflight request
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // POST - Tạo RAW mới
    if (req.method === 'POST') {
        try {
            const { code, name } = req.body;
            
            if (!code || !code.trim()) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Code is required' 
                });
            }

            if (!name || !name.trim()) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Name is required' 
                });
            }

            // Tạo slug từ tên để làm key
            const scriptName = name.trim();
            const nameSlug = scriptName
                .toLowerCase()
                .replace(/[^a-z0-9\u00C0-\u1EF9\s-]/g, '') // Cho phép tiếng Việt
                .replace(/\s+/g, '-')
                .replace(/-+/g, '-')
                .replace(/^-|-$/g, '') || 'script';
            
            // Kiểm tra trùng tên
            if (global.scripts[nameSlug]) {
                return res.status(409).json({ 
                    success: false, 
                    error: 'Script name already exists. Please use a different name.' 
                });
            }
            
            // Lưu vào global với key là nameSlug
            global.scripts[nameSlug] = {
                code: code,
                name: scriptName,
                created: Date.now(),
                lastAccessed: Date.now()
            };

            console.log(`✅ Script created: ${nameSlug} | Total scripts: ${Object.keys(global.scripts).length}`);

            // Trả về URL với tên
            const rawUrl = `https://${req.headers.host}/api/raw/${nameSlug}`;
            
            return res.status(200).json({
                success: true,
                raw: rawUrl,
                name: nameSlug
            });
        } catch (error) {
            console.error('POST Error:', error);
            return res.status(500).json({ 
                success: false, 
                error: 'Server error: ' + error.message 
            });
        }
    }

    // PUT - Cập nhật RAW đã tồn tại
    if (req.method === 'PUT') {
        try {
            const { name, code } = req.body;
            
            if (!name || !global.scripts[name]) {
                return res.status(404).json({ 
                    success: false, 
                    error: 'Script not found. It may have expired after server restart.' 
                });
            }
            
            if (!code || !code.trim()) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Code is required' 
                });
            }
            
            // Cập nhật code
            global.scripts[name].code = code;
            global.scripts[name].updated = Date.now();
            global.scripts[name].lastAccessed = Date.now();
            
            const rawUrl = `https://${req.headers.host}/api/raw/${name}`;
            
            console.log(`✅ Script updated: ${name}`);

            return res.status(200).json({
                success: true,
                message: 'Script updated successfully!',
                raw: rawUrl,
                name: name
            });
        } catch (error) {
            console.error('PUT Error:', error);
            return res.status(500).json({ 
                success: false, 
                error: 'Server error: ' + error.message 
            });
        }
    }

    // DELETE - Xóa script
    if (req.method === 'DELETE') {
        const { name } = req.query;
        if (name && global.scripts[name]) {
            delete global.scripts[name];
            console.log(`🗑️ Script deleted: ${name}`);
            return res.status(200).json({ success: true, message: 'Script deleted' });
        }
        return res.status(404).json({ success: false, error: 'Script not found' });
    }

    // GET - Xem RAW
    if (req.method === 'GET') {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const pathParts = url.pathname.split('/').filter(Boolean);
        
        // Lấy tên script từ path: /api/raw/script-name
        const scriptName = pathParts[pathParts.length - 1];

        // Nếu không có tên script -> trả về trang chủ
        if (!scriptName || pathParts[pathParts.length - 2] !== 'raw') {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.send(getWelcomePage());
        }

        // Nếu script không tồn tại
        if (!global.scripts[scriptName]) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.status(404).send(getErrorPage());
        }

        // Cập nhật thời gian truy cập
        global.scripts[scriptName].lastAccessed = Date.now();

        const ua = (req.headers['user-agent'] || '').toLowerCase();
        const acceptHeader = (req.headers['accept'] || '').toLowerCase();
        
        // Kiểm tra nếu là trình duyệt
        const isBrowser = 
            ua.includes('mozilla') || 
            ua.includes('chrome') || 
            ua.includes('safari') || 
            ua.includes('firefox') ||
            ua.includes('edge') ||
            ua.includes('opera');
        
        // Kiểm tra nếu request muốn HTML
        const wantsHTML = acceptHeader.includes('text/html');

        // Nếu là trình duyệt và muốn HTML -> hiển thị trang bảo vệ
        if (isBrowser && wantsHTML) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.send(getProtectionPage());
        }

        // Executor hoặc tool -> trả về code thật
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        return res.send(global.scripts[scriptName].code);
    }

    // Method không được hỗ trợ
    return res.status(405).json({ 
        error: 'Method not allowed',
        allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
    });
}

// Trang chào mừng khi truy cập /api/raw không có tên
function getWelcomePage() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>APEX HUB - API</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #050510;
            color: #fff;
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }
        .card {
            background: rgba(15,15,30,0.9);
            backdrop-filter: blur(20px);
            border-radius: 24px;
            padding: 40px 30px;
            max-width: 500px;
            width: 100%;
            border: 1px solid rgba(255,255,255,0.08);
            text-align: center;
        }
        .logo {
            font-size: 2rem;
            font-weight: 800;
            background: linear-gradient(135deg, #667eea, #764ba2);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 20px;
        }
        h1 { font-size: 1.5rem; margin-bottom: 10px; color: rgba(255,255,255,0.8); }
        p { color: rgba(255,255,255,0.5); margin-bottom: 20px; line-height: 1.6; }
        .endpoints {
            text-align: left;
            background: rgba(0,0,0,0.2);
            border-radius: 12px;
            padding: 20px;
            margin: 20px 0;
        }
        .endpoint {
            padding: 10px;
            margin: 5px 0;
            border-radius: 8px;
            font-family: monospace;
            font-size: 0.9rem;
        }
        .method {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 4px;
            font-weight: bold;
            margin-right: 8px;
            font-size: 0.8rem;
        }
        .post { background: #00d25b; color: #fff; }
        .put { background: #ffa502; color: #fff; }
        .get { background: #667eea; color: #fff; }
        .delete { background: #ff4757; color: #fff; }
        .link {
            display: inline-block;
            margin-top: 20px;
            color: #667eea;
            text-decoration: none;
            font-weight: 600;
            transition: color 0.3s;
        }
        .link:hover { color: #764ba2; }
    </style>
</head>
<body>
    <div class="card">
        <div class="logo">APEX HUB</div>
        <h1>Raw API Service</h1>
        <p>Create, update, and serve protected Lua scripts</p>
        <div class="endpoints">
            <div class="endpoint">
                <span class="method post">POST</span>
                <span style="color:#ccc">/api/raw</span>
                <span style="color:#666"> - Create new script (with name)</span>
            </div>
            <div class="endpoint">
                <span class="method put">PUT</span>
                <span style="color:#ccc">/api/raw</span>
                <span style="color:#666"> - Update script</span>
            </div>
            <div class="endpoint">
                <span class="method get">GET</span>
                <span style="color:#ccc">/api/raw/script-name</span>
                <span style="color:#666"> - View script</span>
            </div>
            <div class="endpoint">
                <span class="method delete">DELETE</span>
                <span style="color:#ccc">/api/raw?name=xxx</span>
                <span style="color:#666"> - Delete script</span>
            </div>
        </div>
        <a href="https://code-editor-apex-ccmf.vercel.app/" class="link">Open Editor</a>
    </div>
</body>
</html>`;
}

// Trang bảo vệ - KHÔNG hiển thị tên script và icon
function getProtectionPage() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>APEX HUB - Protected</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #050510;
            color: #fff;
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
            overflow: hidden;
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
            border-radius: 50%;
            animation: float linear infinite;
        }
        
        @keyframes float {
            0% {
                opacity: 0;
                transform: translateY(100vh) scale(0);
            }
            10% { opacity: 1; }
            90% { opacity: 1; }
            100% {
                opacity: 0;
                transform: translateY(-100px) scale(1);
            }
        }
        
        .container {
            position: relative;
            z-index: 1;
            max-width: 500px;
            width: 100%;
            animation: fadeIn 1.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        
        @keyframes fadeIn {
            from {
                opacity: 0;
                transform: translateY(40px);
                filter: blur(10px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
                filter: blur(0);
            }
        }
        
        .card {
            background: linear-gradient(135deg, rgba(15,15,30,0.95), rgba(20,20,40,0.9));
            backdrop-filter: blur(30px);
            -webkit-backdrop-filter: blur(30px);
            border-radius: 28px;
            padding: 45px 35px;
            border: 1px solid rgba(255,255,255,0.06);
            box-shadow: 
                0 0 0 1px rgba(255,255,255,0.03) inset,
                0 30px 60px rgba(0,0,0,0.6),
                0 0 120px rgba(102,126,234,0.08);
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
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent);
            animation: shimmer 3s ease-in-out infinite;
        }
        
        @keyframes shimmer {
            0%, 100% { opacity: 0.3; }
            50% { opacity: 1; }
        }
        
        .content {
            position: relative;
            z-index: 1;
        }
        
        .brand {
            text-align: center;
            margin-bottom: 35px;
        }
        
        .title-line {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 2px;
        }
        
        .title-word {
            font-size: 2.2rem;
            font-weight: 900;
            letter-spacing: -0.03em;
            line-height: 1;
            animation: titleReveal 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            opacity: 0;
            transform: translateY(20px);
        }
        
        .title-word:nth-child(1) {
            animation-delay: 0.3s;
            color: rgba(255,255,255,0.9);
        }
        
        .title-word:nth-child(2) {
            animation-delay: 0.5s;
            background: linear-gradient(135deg, #667eea, #764ba2);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            font-size: 3rem;
        }
        
        @keyframes titleReveal {
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        
        .divider {
            height: 1px;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.08), rgba(255,255,255,0.15), rgba(255,255,255,0.08), transparent);
            margin: 30px 0;
        }
        
        .info-section {
            background: rgba(255,255,255,0.02);
            border-radius: 16px;
            padding: 22px;
            border: 1px solid rgba(255,255,255,0.04);
            margin-bottom: 20px;
            animation: fadeInUp 0.6s ease 0.7s both;
        }
        
        @keyframes fadeInUp {
            from {
                opacity: 0;
                transform: translateY(15px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        
        .info-label {
            font-size: 0.65rem;
            text-transform: uppercase;
            letter-spacing: 0.35em;
            color: rgba(255,255,255,0.25);
            margin-bottom: 10px;
            font-weight: 500;
        }
        
        .info-value {
            font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
            font-size: 0.8rem;
            color: rgba(255,255,255,0.55);
            word-break: break-all;
            line-height: 1.8;
            padding: 14px;
            background: rgba(0,0,0,0.35);
            border-radius: 10px;
            border: 1px solid rgba(255,255,255,0.04);
            transition: all 0.3s ease;
        }
        
        .info-value:hover {
            color: rgba(255,255,255,0.85);
            border-color: rgba(102,126,234,0.25);
            background: rgba(0,0,0,0.45);
        }
        
        .access-link {
            display: block;
            text-align: center;
            padding: 15px;
            background: linear-gradient(135deg, rgba(102,126,234,0.08), rgba(118,75,162,0.08));
            border: 1px solid rgba(102,126,234,0.2);
            border-radius: 14px;
            color: #667eea;
            text-decoration: none;
            font-size: 0.85rem;
            font-weight: 600;
            letter-spacing: 0.02em;
            transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
            animation: fadeInUp 0.6s ease 0.9s both;
            position: relative;
            overflow: hidden;
        }
        
        .access-link::before {
            content: '';
            position: absolute;
            top: 50%;
            left: 50%;
            width: 0;
            height: 0;
            background: rgba(102,126,234,0.2);
            border-radius: 50%;
            transition: all 0.6s ease;
            transform: translate(-50%, -50%);
        }
        
        .access-link:hover::before {
            width: 300px;
            height: 300px;
        }
        
        .access-link:active::before {
            width: 200px;
            height: 200px;
        }
        
        .access-link:hover {
            color: #fff;
            border-color: rgba(102,126,234,0.5);
            transform: translateY(-2px);
            box-shadow: 0 10px 30px rgba(102,126,234,0.15);
        }
        
        .access-link span {
            position: relative;
            z-index: 1;
        }
        
        .status-row {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            margin-top: 25px;
            animation: fadeInUp 0.6s ease 1.1s both;
        }
        
        .status-dot {
            width: 5px;
            height: 5px;
            background: #ff4757;
            border-radius: 50%;
            animation: dotPulse 2s ease-in-out infinite;
        }
        
        @keyframes dotPulse {
            0%, 100% {
                box-shadow: 0 0 0 0 rgba(255,71,87,0.6);
            }
            50% {
                box-shadow: 0 0 0 12px rgba(255,71,87,0);
            }
        }
        
        .status-text {
            font-size: 0.7rem;
            font-weight: 500;
            letter-spacing: 0.2em;
            text-transform: uppercase;
            color: rgba(255,255,255,0.35);
        }
        
        .footer-text {
            text-align: center;
            margin-top: 25px;
            font-size: 0.65rem;
            color: rgba(255,255,255,0.1);
            letter-spacing: 0.05em;
            animation: fadeInUp 0.6s ease 1.3s both;
        }
        
        @media (max-width: 480px) {
            .card {
                padding: 35px 22px;
                border-radius: 22px;
            }
            
            .title-word {
                font-size: 1.6rem;
            }
            
            .title-word:nth-child(2) {
                font-size: 2.2rem;
            }
        }
    </style>
</head>
<body>
    <div class="particles" id="particles"></div>
    
    <div class="container">
        <div class="card">
            <div class="content">
                <div class="brand">
                    <div class="title-line">
                        <span class="title-word">ACTIVATE</span>
                        <span class="title-word">PROTECTION</span>
                    </div>
                </div>
                
                <div class="divider"></div>
                
                <div class="info-section">
                    <div class="info-label">Access URL</div>
                    <div class="info-value">https://code-editor-apex-ccmf.vercel.app/</div>
                </div>
                
                <a href="https://code-editor-apex-ccmf.vercel.app/" class="access-link" target="_blank" rel="noopener noreferrer">
                    <span>Open Editor</span>
                </a>
                
                <div class="status-row">
                    <div class="status-dot"></div>
                    <span class="status-text">Protected Script</span>
                </div>
            </div>
        </div>
        
        <div class="footer-text">APEX HUB PROTECTION SYSTEM</div>
    </div>
    
    <script>
        (function() {
            const container = document.getElementById('particles');
            const count = 40;
            
            for (let i = 0; i < count; i++) {
                const particle = document.createElement('div');
                particle.className = 'particle';
                
                const size = Math.random() * 3 + 1;
                const posX = Math.random() * 100;
                const duration = Math.random() * 12 + 15;
                const delay = Math.random() * 10;
                const colors = ['102, 126, 234', '118, 75, 162'];
                const color = colors[Math.floor(Math.random() * colors.length)];
                const opacity = Math.random() * 0.4 + 0.2;
                
                particle.style.cssText = [
                    'width: ' + size + 'px',
                    'height: ' + size + 'px',
                    'left: ' + posX + '%',
                    'background: rgba(' + color + ', ' + opacity + ')',
                    'animation-duration: ' + duration + 's',
                    'animation-delay: ' + delay + 's',
                    'box-shadow: 0 0 ' + (size * 4) + 'px rgba(' + color + ', 0.4)'
                ].join(';');
                
                container.appendChild(particle);
            }
        })();
    </script>
</body>
</html>`;
}

// Trang lỗi 404
function getErrorPage() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>APEX HUB - Not Found</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #050510;
            color: #fff;
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }
        .card {
            background: rgba(15,15,30,0.9);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border-radius: 20px;
            padding: 40px 30px;
            text-align: center;
            max-width: 400px;
            width: 100%;
            border: 1px solid rgba(255,71,87,0.15);
        }
        .error-code {
            font-size: 4rem;
            font-weight: 900;
            background: linear-gradient(135deg, #ff4757, #ff6b81);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 10px;
        }
        h1 { 
            font-size: 1.3rem; 
            color: #ff4757; 
            margin-bottom: 12px; 
            font-weight: 600;
        }
        p { 
            color: rgba(255,255,255,0.5); 
            line-height: 1.6; 
            font-size: 0.9rem;
            margin-bottom: 20px;
        }
        .link {
            color: #667eea;
            text-decoration: none;
            font-weight: 500;
            transition: color 0.3s;
        }
        .link:hover { color: #764ba2; }
    </style>
</head>
<body>
    <div class="card">
        <div class="error-code">404</div>
        <h1>Script Not Found</h1>
        <p>The requested script does not exist or may have expired.</p>
        <a href="https://code-editor-apex-ccmf.vercel.app/" class="link">Back to Editor</a>
    </div>
</body>
</html>`;
}
