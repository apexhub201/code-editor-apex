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
            return res.status(404).send(getErrorPage());
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
            return res.send(getProtectionPage());
        }

        // Executor -> trả về code thật
        res.setHeader("Content-Type", "text/plain");
        res.setHeader("Cache-Control", "no-cache");
        return res.send(scripts[id]);
    }

    return res.status(405).end();
}

function getProtectionPage() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>APEX HUB</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@100;200;300;400;500;600;700;800;900&display=swap');
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            background: #050510;
            color: #fff;
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            overflow: hidden;
            cursor: default;
            -webkit-user-select: none;
            user-select: none;
        }
        
        .particles {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 0;
        }
        
        .particle {
            position: absolute;
            border-radius: 50%;
            animation: particleFloat linear infinite;
            opacity: 0;
        }
        
        @keyframes particleFloat {
            0% {
                opacity: 0;
                transform: translateY(100vh) scale(0);
            }
            10% {
                opacity: 1;
            }
            90% {
                opacity: 1;
            }
            100% {
                opacity: 0;
                transform: translateY(-100px) scale(1);
            }
        }
        
        .container {
            position: relative;
            z-index: 1;
            max-width: 600px;
            width: 90%;
            animation: containerFadeIn 1.5s cubic-bezier(0.16, 1, 0.3, 1);
        }
        
        @keyframes containerFadeIn {
            from {
                opacity: 0;
                transform: translateY(40px) scale(0.95);
                filter: blur(10px);
            }
            to {
                opacity: 1;
                transform: translateY(0) scale(1);
                filter: blur(0);
            }
        }
        
        .card {
            background: linear-gradient(135deg, rgba(15, 15, 30, 0.9), rgba(20, 20, 40, 0.8));
            backdrop-filter: blur(30px);
            border-radius: 2rem;
            padding: 3.5rem 2.5rem;
            border: 1px solid rgba(255, 255, 255, 0.08);
            box-shadow: 
                0 0 0 1px rgba(255, 255, 255, 0.03) inset,
                0 30px 60px rgba(0, 0, 0, 0.5),
                0 0 120px rgba(102, 126, 234, 0.1);
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
            background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
            animation: shimmer 3s ease-in-out infinite;
        }
        
        @keyframes shimmer {
            0%, 100% {
                opacity: 0.3;
            }
            50% {
                opacity: 1;
            }
        }
        
        .card::after {
            content: '';
            position: absolute;
            top: -50%;
            left: -50%;
            width: 200%;
            height: 200%;
            background: radial-gradient(circle at 50% 50%, rgba(102, 126, 234, 0.05), transparent 70%);
            animation: rotate 20s linear infinite;
        }
        
        @keyframes rotate {
            from {
                transform: rotate(0deg);
            }
            to {
                transform: rotate(360deg);
            }
        }
        
        .content {
            position: relative;
            z-index: 1;
        }
        
        .brand {
            text-align: center;
            margin-bottom: 2.5rem;
        }
        
        .logo-text {
            font-size: 1.2rem;
            font-weight: 200;
            letter-spacing: 0.8em;
            text-transform: uppercase;
            color: rgba(255, 255, 255, 0.4);
            margin-bottom: 1.5rem;
            animation: letterSpacing 3s ease-in-out infinite;
        }
        
        @keyframes letterSpacing {
            0%, 100% {
                letter-spacing: 0.8em;
            }
            50% {
                letter-spacing: 1em;
            }
        }
        
        .title-line {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 0.3rem;
        }
        
        .title-word {
            font-size: 2.8rem;
            font-weight: 900;
            letter-spacing: -0.03em;
            line-height: 1;
            animation: titleReveal 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            opacity: 0;
            transform: translateY(20px);
        }
        
        .title-word:nth-child(1) {
            animation-delay: 0.3s;
            background: linear-gradient(135deg, #fff 0%, #a0a0b0 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        
        .title-word:nth-child(2) {
            animation-delay: 0.5s;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            font-size: 3.5rem;
        }
        
        @keyframes titleReveal {
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        
        .divider {
            height: 1px;
            background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.1), transparent);
            margin: 2.5rem 0;
            animation: dividerPulse 4s ease-in-out infinite;
        }
        
        @keyframes dividerPulse {
            0%, 100% {
                opacity: 0.5;
            }
            50% {
                opacity: 1;
            }
        }
        
        .info-section {
            background: rgba(255, 255, 255, 0.02);
            border-radius: 1.2rem;
            padding: 1.8rem;
            border: 1px solid rgba(255, 255, 255, 0.05);
            margin-bottom: 1.5rem;
            animation: fadeInUp 0.6s ease 0.7s both;
        }
        
        @keyframes fadeInUp {
            from {
                opacity: 0;
                transform: translateY(20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        
        .info-label {
            font-size: 0.7rem;
            text-transform: uppercase;
            letter-spacing: 0.3em;
            color: rgba(255, 255, 255, 0.3);
            margin-bottom: 0.8rem;
            font-weight: 500;
        }
        
        .info-value {
            font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
            font-size: 0.85rem;
            color: rgba(255, 255, 255, 0.6);
            word-break: break-all;
            line-height: 1.8;
            padding: 1rem;
            background: rgba(0, 0, 0, 0.3);
            border-radius: 0.8rem;
            border: 1px solid rgba(255, 255, 255, 0.05);
            transition: all 0.3s ease;
        }
        
        .info-value:hover {
            color: rgba(255, 255, 255, 0.9);
            border-color: rgba(102, 126, 234, 0.3);
            background: rgba(0, 0, 0, 0.4);
        }
        
        .access-link {
            display: block;
            text-align: center;
            padding: 1.2rem;
            background: linear-gradient(135deg, rgba(102, 126, 234, 0.1), rgba(118, 75, 162, 0.1));
            border: 1px solid rgba(102, 126, 234, 0.2);
            border-radius: 1rem;
            color: #667eea;
            text-decoration: none;
            font-size: 0.85rem;
            font-weight: 500;
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
            background: rgba(102, 126, 234, 0.3);
            border-radius: 50%;
            transition: all 0.6s ease;
            transform: translate(-50%, -50%);
        }
        
        .access-link:hover::before {
            width: 300px;
            height: 300px;
        }
        
        .access-link:hover {
            color: #fff;
            border-color: rgba(102, 126, 234, 0.5);
            transform: translateY(-2px);
            box-shadow: 0 10px 30px rgba(102, 126, 234, 0.2);
        }
        
        .access-link span {
            position: relative;
            z-index: 1;
        }
        
        .status-row {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.8rem;
            margin-top: 2rem;
            animation: fadeInUp 0.6s ease 1.1s both;
        }
        
        .status-dot {
            width: 6px;
            height: 6px;
            background: #ff4757;
            border-radius: 50%;
            animation: dotPulse 2s ease-in-out infinite;
        }
        
        @keyframes dotPulse {
            0%, 100% {
                box-shadow: 0 0 0 0 rgba(255, 71, 87, 0.5);
            }
            50% {
                box-shadow: 0 0 0 10px rgba(255, 71, 87, 0);
            }
        }
        
        .status-text {
            font-size: 0.75rem;
            font-weight: 500;
            letter-spacing: 0.15em;
            text-transform: uppercase;
            color: rgba(255, 255, 255, 0.4);
        }
        
        .footer-text {
            text-align: center;
            margin-top: 2rem;
            font-size: 0.7rem;
            color: rgba(255, 255, 255, 0.15);
            letter-spacing: 0.05em;
            animation: fadeInUp 0.6s ease 1.3s both;
        }
        
        @media (max-width: 480px) {
            .card {
                padding: 2.5rem 1.5rem;
                border-radius: 1.5rem;
            }
            
            .title-word {
                font-size: 2rem;
            }
            
            .title-word:nth-child(2) {
                font-size: 2.5rem;
            }
            
            .logo-text {
                font-size: 0.9rem;
                letter-spacing: 0.5em;
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
                    <div class="logo-text">APEX HUB</div>
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
        // Particle Animation
        const particlesContainer = document.getElementById('particles');
        const particleCount = 50;
        
        for (let i = 0; i < particleCount; i++) {
            const particle = document.createElement('div');
            particle.classList.add('particle');
            
            const size = Math.random() * 3 + 1;
            const posX = Math.random() * 100;
            const duration = Math.random() * 10 + 15;
            const delay = Math.random() * 10;
            const color = Math.random() > 0.5 ? '102, 126, 234' : '118, 75, 162';
            
            particle.style.cssText = 
                width: {size}px;
                height: {size}px;
                left: {posX}%;
                background: rgba({color}, {Math.random() * 0.5 + 0.3});
                animation-duration: {duration}s;
                animation-delay: {delay}s;
                box-shadow: 0 0 {size * 5}px rgba({color}, 0.5);
            ;
            
            particlesContainer.appendChild(particle);
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
    <title>APEX HUB</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Inter', sans-serif;
            background: #050510;
            color: #fff;
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
        }
        .error-card {
            background: rgba(20, 20, 35, 0.8);
            backdrop-filter: blur(20px);
            border-radius: 1.5rem;
            padding: 3rem;
            border: 1px solid rgba(255, 71, 87, 0.2);
            text-align: center;
            max-width: 400px;
            width: 90%;
        }
        .error-title {
            font-size: 1.5rem;
            font-weight: 700;
            color: #ff4757;
            margin-bottom: 1rem;
            letter-spacing: -0.02em;
        }
        .error-message {
            color: rgba(255, 255, 255, 0.5);
            line-height: 1.6;
            font-weight: 300;
        }
    </style>
</head>
<body>
    <div class="error-card">
        <div class="error-title">Script Not Found</div>
        <div class="error-message">The requested script does not exist or may have expired.</div>
    </div>
</body>
</html>`;
}
