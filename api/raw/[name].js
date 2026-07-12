global.scripts = global.scripts || {};

export default function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { name } = req.query;

    // Nếu script không tồn tại
    if (!name || !global.scripts[name]) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(404).send(getErrorPage());
    }

    // Cập nhật thời gian truy cập
    global.scripts[name].lastAccessed = Date.now();

    const ua = (req.headers['user-agent'] || '').toLowerCase();
    const acceptHeader = (req.headers['accept'] || '').toLowerCase();
    
    const isBrowser = ua.includes('mozilla') || ua.includes('chrome') || ua.includes('safari') || ua.includes('firefox') || ua.includes('edge') || ua.includes('opera');
    const wantsHTML = acceptHeader.includes('text/html');

    // Trình duyệt -> trang bảo vệ
    if (isBrowser && wantsHTML) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(getProtectionPage());
    }

    // Executor -> code thật
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.send(global.scripts[name].code);
}

function getProtectionPage() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>APEX HUB - Protected</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #050510; color: #fff; min-height: 100vh; display: flex; justify-content: center; align-items: center; padding: 20px; }
        .container { max-width: 500px; width: 100%; animation: fadeIn 1.2s ease; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(40px); } to { opacity: 1; transform: translateY(0); } }
        .card { background: linear-gradient(135deg, rgba(15,15,30,0.95), rgba(20,20,40,0.9)); backdrop-filter: blur(30px); border-radius: 28px; padding: 45px 35px; border: 1px solid rgba(255,255,255,0.06); box-shadow: 0 30px 60px rgba(0,0,0,0.6); }
        .brand { text-align: center; margin-bottom: 35px; }
        .title-line { display: flex; flex-direction: column; align-items: center; gap: 2px; }
        .title-word { font-size: 2.2rem; font-weight: 900; letter-spacing: -0.03em; line-height: 1; animation: titleReveal 0.8s ease forwards; opacity: 0; transform: translateY(20px); }
        .title-word:nth-child(1) { animation-delay: 0.3s; color: rgba(255,255,255,0.9); }
        .title-word:nth-child(2) { animation-delay: 0.5s; background: linear-gradient(135deg, #667eea, #764ba2); -webkit-background-clip: text; -webkit-text-fill-color: transparent; font-size: 3rem; }
        @keyframes titleReveal { to { opacity: 1; transform: translateY(0); } }
        .divider { height: 1px; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent); margin: 30px 0; }
        .info-section { background: rgba(255,255,255,0.02); border-radius: 16px; padding: 22px; border: 1px solid rgba(255,255,255,0.04); margin-bottom: 20px; }
        .info-label { font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.35em; color: rgba(255,255,255,0.25); margin-bottom: 10px; font-weight: 500; }
        .info-value { font-family: 'Fira Code', monospace; font-size: 0.8rem; color: rgba(255,255,255,0.55); word-break: break-all; line-height: 1.8; padding: 14px; background: rgba(0,0,0,0.35); border-radius: 10px; border: 1px solid rgba(255,255,255,0.04); }
        .access-link { display: block; text-align: center; padding: 15px; background: linear-gradient(135deg, rgba(102,126,234,0.1), rgba(118,75,162,0.1)); border: 1px solid rgba(102,126,234,0.2); border-radius: 14px; color: #667eea; text-decoration: none; font-size: 0.85rem; font-weight: 600; transition: all 0.3s ease; }
        .access-link:hover { color: #fff; border-color: rgba(102,126,234,0.5); transform: translateY(-2px); box-shadow: 0 10px 30px rgba(102,126,234,0.2); }
        .status-row { display: flex; align-items: center; justify-content: center; gap: 10px; margin-top: 25px; }
        .status-dot { width: 5px; height: 5px; background: #ff4757; border-radius: 50%; animation: dotPulse 2s infinite; }
        @keyframes dotPulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(255,71,87,0.6); } 50% { box-shadow: 0 0 0 12px rgba(255,71,87,0); } }
        .status-text { font-size: 0.7rem; font-weight: 500; letter-spacing: 0.2em; text-transform: uppercase; color: rgba(255,255,255,0.35); }
        .footer-text { text-align: center; margin-top: 25px; font-size: 0.65rem; color: rgba(255,255,255,0.1); }
    </style>
</head>
<body>
    <div class="container">
        <div class="card">
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
            <a href="https://code-editor-apex-ccmf.vercel.app/" class="access-link" target="_blank">
                Open Editor
            </a>
            <div class="status-row">
                <div class="status-dot"></div>
                <span class="status-text">Protected Script</span>
            </div>
        </div>
        <div class="footer-text">APEX HUB PROTECTION SYSTEM</div>
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
    <title>APEX HUB - Not Found</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: sans-serif; background: #050510; color: #fff; min-height: 100vh; display: flex; justify-content: center; align-items: center; }
        .card { background: rgba(15,15,30,0.9); border-radius: 20px; padding: 40px; text-align: center; max-width: 400px; border: 1px solid rgba(255,71,87,0.15); }
        .error-code { font-size: 4rem; font-weight: 900; background: linear-gradient(135deg, #ff4757, #ff6b81); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        h1 { font-size: 1.3rem; color: #ff4757; margin: 12px 0; }
        p { color: rgba(255,255,255,0.5); margin-bottom: 20px; }
        .link { color: #667eea; text-decoration: none; }
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
