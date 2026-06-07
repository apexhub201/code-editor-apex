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
            return res.status(404).send("Not Found");
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

        // Kiểm tra nếu request chấp nhận HTML (trình duyệt)
        const wantsHTML = acceptHeader.includes("text/html");

        // Nếu là trình duyệt -> hiển thị trang HTML đẹp
        if (isBrowser && wantsHTML) {
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            return res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>APEX HUB - Protection</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            overflow: hidden;
        }
        
        .container {
            text-align: center;
            padding: 3rem;
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(20px);
            border-radius: 30px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            border: 1px solid rgba(255, 255, 255, 0.2);
            animation: fadeInUp 1s ease;
            max-width: 600px;
            width: 90%;
        }
        
        @keyframes fadeInUp {
            from {
                opacity: 0;
                transform: translateY(30px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        
        .shield-icon {
            font-size: 5rem;
            margin-bottom: 1.5rem;
            animation: pulse 2s infinite;
            display: inline-block;
        }
        
        @keyframes pulse {
            0%, 100% {
                transform: scale(1);
            }
            50% {
                transform: scale(1.1);
            }
        }
        
        h1 {
            font-size: 2.5rem;
            color: #ff4757;
            margin-bottom: 1rem;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 2px;
            text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
        }
        
        .subtitle {
            font-size: 1.5rem;
            color: #fff;
            margin-bottom: 2rem;
            font-weight: 600;
        }
        
        .access-link {
            background: rgba(255, 255, 255, 0.2);
            padding: 1.5rem;
            border-radius: 15px;
            margin: 2rem 0;
            border: 2px solid rgba(255, 255, 255, 0.3);
        }
        
        .access-link p {
            color: #fff;
            font-size: 1.2rem;
            margin-bottom: 0.5rem;
        }
        
        .access-link a {
            color: #00d2ff;
            font-size: 1.1rem;
            text-decoration: none;
            font-weight: 600;
            word-break: break-all;
            transition: color 0.3s;
        }
        
        .access-link a:hover {
            color: #fff;
            text-decoration: underline;
        }
        
        .info-text {
            color: rgba(255, 255, 255, 0.8);
            font-size: 0.9rem;
            margin-top: 2rem;
            line-height: 1.6;
        }
        
        .glow-circle {
            position: absolute;
            border-radius: 50%;
            background: radial-gradient(circle, rgba(102, 126, 234, 0.4), transparent 70%);
            animation: float 6s infinite;
        }
        
        .glow-circle:nth-child(1) {
            width: 300px;
            height: 300px;
            top: -100px;
            left: -100px;
        }
        
        .glow-circle:nth-child(2) {
            width: 200px;
            height: 200px;
            bottom: -50px;
            right: -50px;
            animation-delay: 3s;
        }
        
        @keyframes float {
            0%, 100% {
                transform: translate(0, 0) scale(1);
            }
            50% {
                transform: translate(20px, -20px) scale(1.1);
            }
        }
        
        .lock-icon {
            font-size: 3rem;
            color: #ff4757;
            margin-top: 1rem;
            animation: shake 2s infinite;
        }
        
        @keyframes shake {
            0%, 100% {
                transform: rotate(0deg);
            }
            25% {
                transform: rotate(-10deg);
            }
            75% {
                transform: rotate(10deg);
            }
        }
    </style>
</head>
<body>
    <div class="glow-circle"></div>
    <div class="glow-circle"></div>
    
    <div class="container">
        <div class="shield-icon">🛡️</div>
        <h1>ACTIVATE PROTECTION</h1>
        <div class="subtitle">⚠️ Script Protected by APEX HUB</div>
        
        <div class="access-link">
            <p>🔗 Access:</p>
            <a href="https://code-editor-apex-ccmf.vercel.app/" target="_blank">
                https://code-editor-apex-ccmf.vercel.app/
            </a>
        </div>
        
        <div class="lock-icon">🔒</div>
        
        <div class="info-text">
            This script is protected and can only be executed through a script executor.<br>
            Vui lòng sử dụng trình thực thi script để chạy code này.
        </div>
    </div>
</body>
</html>`);
        }

        // Nếu là executor (không muốn HTML) -> trả về code thật
        res.setHeader("Content-Type", "text/plain");
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        
        return res.send(scripts[id]);
    }

    return res.status(405).end();
}
