let scripts = {};

export default function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // TẠO RAW MỚI
    if (req.method === "POST") {
        const { code } = req.body;

        if (!code || !code.trim()) {
            return res.status(400).json({ 
                success: false, 
                error: 'Code is required' 
            });
        }

        const id = Math.random()
            .toString(36)
            .substring(2, 10) + 
            Date.now().toString(36);

        scripts[id] = code;

        return res.status(200).json({
            success: true,
            raw: `${req.headers.origin}/api/raw?id=${id}`,
            id: id
        });
    }

    // XEM RAW (GET request)
    if (req.method === "GET") {
        const { id } = req.query;

        if (!id || !scripts[id]) {
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            return res.status(404).send(getErrorPage('Script Not Found', 'The requested script does not exist or has expired.'));
        }

        const userAgent = req.headers["user-agent"] || "";
        const acceptHeader = req.headers["accept"] || "";
        
        // Kiểm tra nếu là trình duyệt
        const isBrowser = 
            userAgent.includes("Mozilla") || 
            userAgent.includes("Chrome") || 
            userAgent.includes("Safari") || 
            userAgent.includes("Firefox") || 
            userAgent.includes("Edge") ||
            userAgent.includes("Opera");

        // Nếu là trình duyệt muốn HTML -> hiển thị trang bảo vệ
        if (isBrowser && acceptHeader.includes("text/html")) {
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            return res.send(getProtectionPage(id));
        }

        // Executor -> trả về code thật
        res.setHeader("Content-Type", "text/plain");
        res.setHeader("Cache-Control", "no-cache");
        return res.send(scripts[id]);
    }

    return res.status(405).end();
}

function getProtectionPage(scriptId) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>APEX HUB - Script Protection</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Inter', sans-serif;
            background: #0a0a0f;
            color: #fff;
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
        }
        
        .background {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: 
                radial-gradient(ellipse at top, #1a1a2e 0%, #0a0a0f 50%),
                radial-gradient(ellipse at bottom, #16213e 0%, #0a0a0f 50%);
            z-index: -1;
        }
        
        .grid {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-image: 
                linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
            background-size: 50px 50px;
            z-index: -1;
        }
        
        .container {
            max-width: 500px;
            width: 90%;
            animation: fadeIn 0.6s ease;
        }
        
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }
        
        .card {
            background: rgba(20, 20, 35, 0.8);
            backdrop-filter: blur(20px);
            border-radius: 20px;
            padding: 2.5rem;
            border: 1px solid rgba(255, 255, 255, 0.1);
            box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
        }
        
        .header {
            text-align: center;
            margin-bottom: 2rem;
        }
        
        .logo {
            font-size: 2.5rem;
            font-weight: 800;
            background: linear-gradient(135deg, #667eea, #764ba2);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 1rem;
        }
        
        .shield-icon {
            font-size: 4rem;
            margin-bottom: 1rem;
            display: block;
            animation: float 3s ease-in-out infinite;
        }
        
        @keyframes float {
            0%, 100% { transform: translateY(0px); }
            50% { transform: translateY(-10px); }
        }
        
        .status-badge {
            display: inline-block;
            background: rgba(255, 71, 87, 0.2);
            color: #ff4757;
            padding: 0.5rem 1.5rem;
            border-radius: 50px;
            font-weight: 600;
            font-size: 0.9rem;
            border: 1px solid rgba(255, 71, 87, 0.3);
            margin-bottom: 1.5rem;
        }
        
        .title {
            font-size: 1.8rem;
            font-weight: 700;
            margin-bottom: 0.5rem;
            color: #fff;
        }
        
        .subtitle {
            color: rgba(255, 255, 255, 0.6);
            font-size: 0.95rem;
            line-height: 1.6;
        }
        
        .info-box {
            background: rgba(102, 126, 234, 0.1);
            border: 1px solid rgba(102, 126, 234, 0.3);
            border-radius: 12px;
            padding: 1.5rem;
            margin: 1.5rem 0;
        }
        
        .info-item {
            display: flex;
            align-items: center;
            gap: 0.8rem;
            margin-bottom: 0.8rem;
            color: rgba(255, 255, 255, 0.8);
            font-size: 0.9rem;
        }
        
        .info-item:last-child {
            margin-bottom: 0;
        }
        
        .info-item .icon {
            font-size: 1.2rem;
        }
        
        .script-id {
            background: rgba(0, 0, 0, 0.3);
            padding: 0.8rem;
            border-radius: 8px;
            font-family: 'Courier New', monospace;
            font-size: 0.85rem;
            color: #667eea;
            text-align: center;
            word-break: break-all;
            margin-top: 0.5rem;
        }
        
        .access-section {
            background: rgba(255, 255, 255, 0.05);
            border-radius: 12px;
            padding: 1.5rem;
            margin-top: 1.5rem;
            text-align: center;
        }
        
        .access-label {
            color: rgba(255, 255, 255, 0.5);
            font-size: 0.85rem;
            text-transform: uppercase;
            letter-spacing: 2px;
            margin-bottom: 0.8rem;
        }
        
        .access-link {
            color: #667eea;
            text-decoration: none;
            font-weight: 600;
            font-size: 0.9rem;
            word-break: break-all;
            transition: color 0.3s;
        }
        
        .access-link:hover {
            color: #764ba2;
        }
        
        .divider {
            height: 1px;
            background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
            margin: 1.5rem 0;
        }
        
        .features {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 1rem;
            margin-top: 1.5rem;
        }
        
        .feature {
            text-align: center;
            padding: 1rem;
            background: rgba(255, 255, 255, 0.03);
            border-radius: 10px;
        }
        
        .feature-icon {
            font-size: 1.5rem;
            margin-bottom: 0.5rem;
        }
        
        .feature-text {
            font-size: 0.75rem;
            color: rgba(255, 255, 255, 0.6);
        }
        
        .footer {
            text-align: center;
            margin-top: 2rem;
            color: rgba(255, 255, 255, 0.3);
            font-size: 0.8rem;
        }
        
        @media (max-width: 480px) {
            .card {
                padding: 1.5rem;
            }
            
            .title {
                font-size: 1.4rem;
            }
            
            .features {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="background"></div>
    <div class="grid"></div>
    
    <div class="container">
        <div class="card">
            <div class="header">
                <span class="shield-icon">🛡️</span>
                <div class="logo">APEX HUB</div>
                <div class="status-badge">🔒 PROTECTED</div>
                <h1 class="title">ACTIVATE PROTECTION</h1>
                <p class="subtitle">This script is protected and can only be executed through a Lua executor</p>
            </div>
            
            <div class="info-box">
                <div class="info-item">
                    <span class="icon">📝</span>
                    <span>Script ID:</span>
                </div>
                <div class="script-id">${scriptId}</div>
            </div>
            
            <div class="access-section">
                <div class="access-label">Access URL</div>
                <a href="https://code-editor-apex-ccmf.vercel.app/" class="access-link" target="_blank">
                    https://code-editor-apex-ccmf.vercel.app/
                </a>
            </div>
            
            <div class="divider"></div>
            
            <div class="features">
                <div class="feature">
                    <div class="feature-icon">🔐</div>
                    <div class="feature-text">Encrypted</div>
                </div>
                <div class="feature">
                    <div class="feature-icon">⚡</div>
                    <div class="feature-text">Optimized</div>
                </div>
                <div class="feature">
                    <div class="feature-icon">🛡️</div>
                    <div class="feature-text">Protected</div>
                </div>
            </div>
        </div>
        
        <div class="footer">
            © 2024 APEX HUB. All rights reserved.
        </div>
    </div>
</body>
</html>`;
}

function getErrorPage(title, message) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>APEX HUB - Error</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Inter', sans-serif;
            background: #0a0a0f;
            color: #fff;
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
        }
        .error-card {
            background: rgba(20, 20, 35, 0.8);
            backdrop-filter: blur(20px);
            border-radius: 20px;
            padding: 3rem;
            border: 1px solid rgba(255, 71, 87, 0.3);
            text-align: center;
            max-width: 400px;
            width: 90%;
        }
        .error-icon { font-size: 4rem; margin-bottom: 1rem; }
        h1 { color: #ff4757; margin-bottom: 1rem; font-size: 1.5rem; }
        p { color: rgba(255, 255, 255, 0.7); line-height: 1.6; }
    </style>
</head>
<body>
    <div class="error-card">
        <div class="error-icon">⚠️</div>
        <h1>${title}</h1>
        <p>${message}</p>
    </div>
</body>
</html>`;
}
