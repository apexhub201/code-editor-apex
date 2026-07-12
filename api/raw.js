import crypto from 'crypto';

// Sử dụng global để lưu scripts.
// LƯU Ý QUAN TRỌNG: trên môi trường serverless (Vercel), bộ nhớ "global"
// KHÔNG đảm bảo tồn tại giữa các lần gọi hàm — mỗi cold start / mỗi
// instance có thể có bộ nhớ riêng, nên script có thể "biến mất" bất chợt.
// Nếu cần lưu trữ ổn định lâu dài, nên chuyển sang Vercel KV, Upstash
// Redis, hoặc một database thật (Postgres, MongoDB...).
global.scripts = global.scripts || {};

// Rate limit rất cơ bản theo IP (best-effort, cũng reset khi cold start,
// không thay thế được rate limit ở tầng edge/CDN nếu bạn cần chống spam mạnh hơn).
global.rateLimits = global.rateLimits || {};
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 20;

function checkRateLimit(ip) {
    const now = Date.now();
    const record = global.rateLimits[ip] || { count: 0, start: now };
    if (now - record.start > RATE_LIMIT_WINDOW_MS) {
        record.count = 0;
        record.start = now;
    }
    record.count += 1;
    global.rateLimits[ip] = record;
    return record.count <= RATE_LIMIT_MAX;
}

function hashKey(key) {
    return crypto.createHash('sha256').update(String(key)).digest('hex');
}

function keyMatches(inputKey, storedHash) {
    if (!inputKey || !storedHash) return false;
    const inputHash = hashKey(inputKey);
    const a = Buffer.from(inputHash, 'hex');
    const b = Buffer.from(storedHash, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

export default function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown')
        .split(',')[0].trim();

    // POST - Tạo RAW mới
    if (req.method === 'POST') {
        try {
            if (!checkRateLimit(ip)) {
                return res.status(429).json({ success: false, error: 'Quá nhiều yêu cầu, thử lại sau' });
            }

            const { code, name, key } = req.body;

            if (!code || !code.trim()) {
                return res.status(400).json({ success: false, error: 'Code is required' });
            }
            if (!name || !name.trim()) {
                return res.status(400).json({ success: false, error: 'Name is required' });
            }
            if (!key || String(key).trim().length < 4) {
                return res.status(400).json({ success: false, error: 'Key phải có ít nhất 4 ký tự' });
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

            const cleanKey = String(key).trim();

            global.scripts[nameSlug] = {
                code: code,
                name: name.trim(),
                keyHash: hashKey(cleanKey),
                created: Date.now(),
                lastAccessed: Date.now()
            };

            const rawUrl = `https://${req.headers.host}/api/raw?name=${nameSlug}&key=${encodeURIComponent(cleanKey)}`;

            return res.status(200).json({
                success: true,
                raw: rawUrl,
                name: nameSlug
            });
        } catch (error) {
            return res.status(500).json({ success: false, error: error.message });
        }
    }

    // PUT - Cập nhật (yêu cầu đúng key mới cho sửa)
    if (req.method === 'PUT') {
        try {
            if (!checkRateLimit(ip)) {
                return res.status(429).json({ success: false, error: 'Quá nhiều yêu cầu, thử lại sau' });
            }

            const { name, code, key } = req.body;

            if (!name || !global.scripts[name]) {
                return res.status(404).json({ success: false, error: 'Script not found' });
            }

            if (!keyMatches(key, global.scripts[name].keyHash)) {
                return res.status(401).json({ success: false, error: 'Sai key' });
            }

            if (!code || !code.trim()) {
                return res.status(400).json({ success: false, error: 'Code is required' });
            }

            global.scripts[name].code = code;
            global.scripts[name].updated = Date.now();
            global.scripts[name].lastAccessed = Date.now();

            const rawUrl = `https://${req.headers.host}/api/raw?name=${name}&key=${encodeURIComponent(key)}`;

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

    // DELETE - cũng yêu cầu đúng key (trước đây không cần, ai biết tên cũng xoá được)
    if (req.method === 'DELETE') {
        const { name, key } = req.query;
        if (!name || !global.scripts[name]) {
            return res.status(404).json({ success: false, error: 'Script not found' });
        }
        if (!keyMatches(key, global.scripts[name].keyHash)) {
            return res.status(401).json({ success: false, error: 'Sai key' });
        }
        delete global.scripts[name];
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

        // Script không tồn tại
        if (!global.scripts[name]) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.status(404).send(getErrorPage());
        }

        const record = global.scripts[name];
        const ua = (req.headers['user-agent'] || '').toLowerCase();
        const acceptHeader = (req.headers['accept'] || '').toLowerCase();
        const isBrowser = ua.includes('mozilla') || ua.includes('chrome') || ua.includes('safari') || ua.includes('firefox') || ua.includes('edge');
        const wantsHTML = acceptHeader.includes('text/html');

        // Không đúng key -> không ai lấy được code thật, bất kể là trình
        // duyệt, bot, hay executor. Đây là điểm bảo vệ thật sự, thay cho
        // việc đoán "client này có phải bot hay không".
        if (!keyMatches(key, record.keyHash)) {
            if (isBrowser && wantsHTML) {
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                return res.status(401).send(getProtectionPage());
            }
            return res.status(401).json({ success: false, error: 'Thiếu hoặc sai key' });
        }

        record.lastAccessed = Date.now();

        // Có key đúng -> trả code thật (dùng cho executor qua HttpGet)
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        return res.send(record.code);
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
        * { margin: 0; padding: 0; box-sizing: border-box; }
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
        .bg-animation { position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 0; pointer-events: none; }
        .orb { position: absolute; border-radius: 50%; filter: blur(80px); opacity: 0.3; animation: float 20s infinite ease-in-out; }
        .orb-1 { width: 400px; height: 400px; background: radial-gradient(circle, #667eea, transparent); top: -100px; left: -100px; animation-delay: 0s; }
        .orb-2 { width: 350px; height: 350px; background: radial-gradient(circle, #764ba2, transparent); bottom: -100px; right: -100px; animation-delay: -7s; }
        .orb-3 { width: 300px; height: 300px; background: radial-gradient(circle, #ff4757, transparent); top: 50%; left: 50%; transform: translate(-50%, -50%); animation-delay: -14s; }
        @keyframes float {
            0%, 100% { transform: translate(0, 0) scale(1); }
            25% { transform: translate(100px, -50px) scale(1.1); }
            50% { transform: translate(50px, 100px) scale(0.9); }
            75% { transform: translate(-100px, 50px) scale(1.05); }
        }
        .grid-overlay {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background-image: linear-gradient(rgba(100, 100, 255, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(100, 100, 255, 0.03) 1px, transparent 1px);
            background-size: 60px 60px; z-index: 0; pointer-events: none;
        }
        .container { position: relative; z-index: 1; width: 90%; max-width: 500px; }
        .card {
            background: var(--bg-card); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
            border-radius: 24px; padding: 48px 40px; border: 1px solid var(--border);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(100, 100, 255, 0.05) inset, 0 0 120px rgba(102, 126, 234, 0.1);
            animation: cardAppear 0.8s cubic-bezier(0.16, 1, 0.3, 1); position: relative; overflow: hidden;
        }
        .card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent); }
        .card::after {
            content: ''; position: absolute; top: -50%; left: -50%; width: 200%; height: 200%;
            background: conic-gradient(from 0deg, transparent, rgba(102, 126, 234, 0.05), transparent, rgba(118, 75, 162, 0.05), transparent);
            animation: rotate 10s linear infinite; pointer-events: none;
        }
        @keyframes cardAppear { from { opacity: 0; transform: translateY(30px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .logo-icon {
            width: 64px; height: 64px; background: linear-gradient(135deg, var(--gradient-1), var(--gradient-2));
            border-radius: 16px; display: flex; align-items: center; justify-content: center; margin: 0 auto;
            position: relative; animation: logoPulse 3s ease-in-out infinite; box-shadow: 0 8px 32px rgba(102, 126, 234, 0.3);
        }
        .logo-icon svg { width: 32px; height: 32px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3)); }
        @keyframes logoPulse {
            0%, 100% { box-shadow: 0 8px 32px rgba(102, 126, 234, 0.3); transform: scale(1); }
            50% { box-shadow: 0 8px 48px rgba(118, 75, 162, 0.5); transform: scale(1.05); }
        }
        .logo-text {
            font-size: 2rem; font-weight: 800; background: linear-gradient(135deg, var(--gradient-1) 0%, var(--gradient-2) 50%, #ff6b81 100%);
            background-size: 200% 200%; -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
            animation: gradientShift 4s ease-in-out infinite; letter-spacing: -0.5px;
        }
        @keyframes gradientShift { 0%, 100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }
        .subtitle { color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 32px; letter-spacing: 0.05em; }
        .endpoints { background: rgba(15, 15, 35, 0.6); border-radius: 16px; padding: 24px; border: 1px solid rgba(255,255,255,0.05); position: relative; z-index: 1; }
        .endpoint { display: flex; align-items: center; padding: 12px 16px; margin-bottom: 8px; border-radius: 10px; background: rgba(255,255,255,0.02); transition: all 0.3s ease; cursor: default; position: relative; }
        .endpoint:last-child { margin-bottom: 0; }
        .endpoint:hover { background: rgba(255,255,255,0.05); transform: translateX(4px); }
        .method { display: inline-flex; align-items: center; justify-content: center; padding: 4px 10px; border-radius: 6px; font-weight: 700; font-size: 0.7rem; letter-spacing: 0.05em; min-width: 56px; margin-right: 12px; text-transform: uppercase; box-shadow: 0 2px 8px rgba(0,0,0,0.3); animation: methodGlow 2s ease-in-out infinite; }
        .method.post { background: linear-gradient(135deg, #00d25b, #00a844); color: #fff; }
        .method.put { background: linear-gradient(135deg, #ffa502, #e68a00); color: #fff; }
        .method.get { background: linear-gradient(135deg, #667eea, #4c63d2); color: #fff; }
        .method.delete { background: linear-gradient(135deg, #ff4757, #e03444); color: #fff; }
        @keyframes methodGlow { 0%, 100% { filter: brightness(1); } 50% { filter: brightness(1.15); } }
        .path { font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace; font-size: 0.82rem; color: #aab; }
        .cta-button {
            display: inline-flex; align-items: center; gap: 8px; margin-top: 28px; padding: 14px 32px;
            background: linear-gradient(135deg, rgba(102, 126, 234, 0.2), rgba(118, 75, 162, 0.2));
            border: 1px solid rgba(102, 126, 234, 0.3); border-radius: 14px; color: #aab; text-decoration: none;
            font-weight: 600; font-size: 0.9rem; transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); position: relative; z-index: 1; overflow: hidden;
        }
        .cta-button::before { content: ''; position: absolute; top: 0; left: -100%; width: 100%; height: 100%; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent); transition: left 0.5s ease; }
        .cta-button:hover { background: linear-gradient(135deg, rgba(102, 126, 234, 0.35), rgba(118, 75, 162, 0.35)); border-color: var(--gradient-1); color: #fff; transform: translateY(-2px); box-shadow: 0 8px 24px rgba(102, 126, 234, 0.2); }
        .cta-button:hover::before { left: 100%; }
        .cta-button svg { width: 16px; height: 16px; transition: transform 0.3s ease; }
        .cta-button:hover svg { transform: translateX(3px); }
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
            <div class="endpoints">
                <div class="endpoint"><span class="method post">POST</span><span class="path">/api/raw</span><span style="margin-left: auto; color: #555; font-size: 0.7rem;">Create</span></div>
                <div class="endpoint"><span class="method put">PUT</span><span class="path">/api/raw</span><span style="margin-left: auto; color: #555; font-size: 0.7rem;">Update</span></div>
                <div class="endpoint"><span class="method get">GET</span><span class="path">/api/raw?name=...&amp;key=...</span><span style="margin-left: auto; color: #555; font-size: 0.7rem;">Retrieve</span></div>
                <div class="endpoint"><span class="method delete">DEL</span><span class="path">/api/raw?name=...&amp;key=...</span><span style="margin-left: auto; color: #555; font-size: 0.7rem;">Delete</span></div>
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
    <title>APEX HUB | Unauthorized</title>
    <style>
        :root {
            --bg-primary: #0a0a1a;
            --bg-card: rgba(21, 21, 48, 0.8);
            --border: rgba(100, 100, 255, 0.15);
            --text-primary: #e0e0ff;
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
            background: var(--bg-primary); color: var(--text-primary); min-height: 100vh;
            display: flex; justify-content: center; align-items: center; position: relative;
        }
        .container { position: relative; z-index: 1; width: 90%; max-width: 460px; }
        .card {
            background: var(--bg-card); backdrop-filter: blur(20px); border-radius: 24px; padding: 48px 40px;
            border: 1px solid var(--border);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 120px rgba(255, 71, 87, 0.08);
            text-align: center;
        }
        .shield-svg { width: 80px; height: 80px; margin-bottom: 20px; }
        .title { font-size: 1.6rem; font-weight: 900; margin-bottom: 12px; color: #ff6b81; }
        .info-box { background: rgba(15, 15, 35, 0.6); border-radius: 14px; padding: 20px; margin-top: 20px; border: 1px solid rgba(255,255,255,0.05); }
        .info-label { font-size: 0.65rem; color: #555; text-transform: uppercase; letter-spacing: 0.2em; margin-bottom: 10px; font-weight: 600; }
        .info-value { font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace; font-size: 0.8rem; color: #888; }
    </style>
</head>
<body>
    <div class="container">
        <div class="card">
            <svg class="shield-svg" viewBox="0 0 24 24" fill="none" stroke="#ff4757" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                <line x1="12" y1="8" x2="12" y2="13"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <div class="title">KHÔNG CÓ QUYỀN TRUY CẬP</div>
            <div class="info-box">
                <div class="info-label">🔒 Yêu cầu key hợp lệ</div>
                <div class="info-value">Thêm ?key=... đúng với key đã tạo script để truy cập.</div>
            </div>
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
        :root { --bg-primary: #0a0a1a; --bg-card: rgba(21, 21, 48, 0.8); --border: rgba(100, 100, 255, 0.15); }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; background: var(--bg-primary); color: #e0e0ff; min-height: 100vh; display: flex; justify-content: center; align-items: center; }
        .container { width: 90%; max-width: 420px; }
        .card { background: var(--bg-card); backdrop-filter: blur(20px); border-radius: 24px; padding: 48px 40px; border: 1px solid var(--border); text-align: center; }
        .error-code { font-size: 6rem; font-weight: 900; background: linear-gradient(135deg, #ff4757, #ff6b81); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; line-height: 1; }
        .error-title { font-size: 1.4rem; font-weight: 700; margin: 16px 0 8px; color: #ff4757; }
        .error-message { color: #888; font-size: 0.9rem; }
    </style>
</head>
<body>
    <div class="container">
        <div class="card">
            <div class="error-code">404</div>
            <div class="error-title">Script Not Found</div>
            <div class="error-message">The script doesn't exist or has expired.</div>
        </div>
    </div>
</body>
</html>`;
}
