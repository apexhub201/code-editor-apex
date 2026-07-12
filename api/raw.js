function getProtectionPage() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>APEX HUB - Protected</title>
    <style>
        :root {
            --primary: #667eea;
            --secondary: #764ba2;
            --bg: #0a0a14;
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: var(--bg);
            color: #fff;
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            overflow: hidden;
            position: relative;
        }

        /* Animated background */
        .bg-animation {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 0;
        }

        .orb {
            position: absolute;
            border-radius: 50%;
            filter: blur(80px);
            opacity: 0.3;
            animation: float 20s ease-in-out infinite;
        }

        .orb:nth-child(1) {
            width: 400px;
            height: 400px;
            background: var(--primary);
            top: -100px;
            left: -100px;
            animation-delay: 0s;
        }

        .orb:nth-child(2) {
            width: 350px;
            height: 350px;
            background: var(--secondary);
            bottom: -100px;
            right: -100px;
            animation-delay: -5s;
            animation-duration: 25s;
        }

        .orb:nth-child(3) {
            width: 200px;
            height: 200px;
            background: #ff4757;
            top: 50%;
            left: 50%;
            animation-delay: -10s;
            animation-duration: 15s;
        }

        @keyframes float {
            0%, 100% {
                transform: translate(0, 0) scale(1);
            }
            25% {
                transform: translate(100px, -50px) scale(1.2);
            }
            50% {
                transform: translate(-50px, 100px) scale(0.8);
            }
            75% {
                transform: translate(-100px, -100px) scale(1.1);
            }
        }

        /* Grid lines */
        .grid {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-image: 
                linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
            background-size: 60px 60px;
            z-index: 0;
            animation: gridMove 30s linear infinite;
        }

        @keyframes gridMove {
            0% {
                transform: translate(0, 0);
            }
            100% {
                transform: translate(60px, 60px);
            }
        }

        .container {
            position: relative;
            z-index: 1;
            width: 90%;
            max-width: 480px;
            animation: slideUp 1s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes slideUp {
            from {
                opacity: 0;
                transform: translateY(60px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .card {
            background: rgba(20, 20, 40, 0.8);
            backdrop-filter: blur(40px);
            -webkit-backdrop-filter: blur(40px);
            border-radius: 32px;
            padding: 50px 40px;
            border: 1px solid rgba(255, 255, 255, 0.08);
            box-shadow: 
                0 0 0 1px rgba(255, 255, 255, 0.03) inset,
                0 40px 80px rgba(0, 0, 0, 0.4),
                0 0 200px rgba(102, 126, 234, 0.05);
            position: relative;
            overflow: hidden;
        }

        .card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 2px;
            background: linear-gradient(90deg, 
                transparent, 
                rgba(102, 126, 234, 0.3), 
                rgba(118, 75, 162, 0.5), 
                rgba(102, 126, 234, 0.3), 
                transparent
            );
            animation: shimmer 3s ease-in-out infinite;
        }

        @keyframes shimmer {
            0%, 100% { opacity: 0.3; }
            50% { opacity: 1; }
        }

        .card::after {
            content: '';
            position: absolute;
            inset: 0;
            background: radial-gradient(
                circle at 50% 0%, 
                rgba(102, 126, 234, 0.08), 
                transparent 70%
            );
            pointer-events: none;
        }

        .content {
            position: relative;
            z-index: 1;
        }

        .icon-wrapper {
            display: flex;
            justify-content: center;
            margin-bottom: 30px;
            animation: iconPulse 2s ease-in-out infinite;
        }

        @keyframes iconPulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.05); }
        }

        .shield-icon {
            width: 80px;
            height: 80px;
            background: linear-gradient(135deg, var(--primary), var(--secondary));
            border-radius: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 2.5rem;
            box-shadow: 
                0 20px 40px rgba(102, 126, 234, 0.3),
                0 0 80px rgba(102, 126, 234, 0.1);
            position: relative;
        }

        .shield-icon::after {
            content: '';
            position: absolute;
            inset: -4px;
            border-radius: 28px;
            background: linear-gradient(135deg, var(--primary), var(--secondary));
            opacity: 0.5;
            filter: blur(10px);
            z-index: -1;
            animation: glowPulse 2s ease-in-out infinite;
        }

        @keyframes glowPulse {
            0%, 100% { opacity: 0.3; filter: blur(10px); }
            50% { opacity: 0.6; filter: blur(20px); }
        }

        .brand {
            text-align: center;
            margin-bottom: 35px;
        }

        .brand-subtitle {
            font-size: 0.75rem;
            text-transform: uppercase;
            letter-spacing: 0.4em;
            color: rgba(255, 255, 255, 0.3);
            margin-bottom: 15px;
            animation: fadeIn 0.8s ease 0.2s both;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .title {
            font-size: 2.5rem;
            font-weight: 900;
            line-height: 1.1;
            letter-spacing: -0.02em;
            animation: fadeIn 0.8s ease 0.4s both;
        }

        .title-line-1 {
            color: #fff;
        }

        .title-line-2 {
            background: linear-gradient(135deg, var(--primary), var(--secondary));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            font-size: 3.5rem;
        }

        .divider {
            height: 1px;
            background: linear-gradient(90deg, 
                transparent, 
                rgba(255, 255, 255, 0.1), 
                rgba(255, 255, 255, 0.2), 
                rgba(255, 255, 255, 0.1), 
                transparent
            );
            margin: 30px 0;
            animation: fadeIn 0.8s ease 0.6s both;
        }

        .info-section {
            background: rgba(255, 255, 255, 0.02);
            border-radius: 16px;
            padding: 20px;
            border: 1px solid rgba(255, 255, 255, 0.05);
            margin-bottom: 20px;
            animation: fadeIn 0.8s ease 0.8s both;
            transition: all 0.3s ease;
        }

        .info-section:hover {
            background: rgba(255, 255, 255, 0.04);
            border-color: rgba(102, 126, 234, 0.2);
        }

        .info-label {
            font-size: 0.65rem;
            text-transform: uppercase;
            letter-spacing: 0.3em;
            color: rgba(255, 255, 255, 0.25);
            margin-bottom: 10px;
            font-weight: 500;
        }

        .info-value {
            font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
            font-size: 0.8rem;
            color: rgba(255, 255, 255, 0.5);
            word-break: break-all;
            padding: 12px;
            background: rgba(0, 0, 0, 0.3);
            border-radius: 10px;
            border: 1px solid rgba(255, 255, 255, 0.03);
            transition: all 0.3s ease;
        }

        .info-value:hover {
            color: rgba(255, 255, 255, 0.8);
            border-color: rgba(102, 126, 234, 0.3);
        }

        .btn {
            display: block;
            width: 100%;
            padding: 16px;
            background: linear-gradient(135deg, rgba(102, 126, 234, 0.1), rgba(118, 75, 162, 0.1));
            border: 1px solid rgba(102, 126, 234, 0.25);
            border-radius: 16px;
            color: #8899ff;
            text-decoration: none;
            font-weight: 600;
            font-size: 0.9rem;
            text-align: center;
            transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
            animation: fadeIn 0.8s ease 1s both;
            position: relative;
            overflow: hidden;
            cursor: pointer;
        }

        .btn::before {
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

        .btn:hover::before {
            width: 400px;
            height: 400px;
        }

        .btn:hover {
            color: #fff;
            border-color: rgba(102, 126, 234, 0.5);
            transform: translateY(-3px);
            box-shadow: 
                0 15px 30px rgba(102, 126, 234, 0.2),
                0 0 60px rgba(102, 126, 234, 0.05);
        }

        .btn:active {
            transform: translateY(-1px);
        }

        .btn-content {
            position: relative;
            z-index: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
        }

        .status-bar {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            margin-top: 25px;
            animation: fadeIn 0.8s ease 1.2s both;
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
                box-shadow: 0 0 0 0 rgba(255, 71, 87, 0.6);
            }
            50% {
                box-shadow: 0 0 0 14px rgba(255, 71, 87, 0);
            }
        }

        .status-text {
            font-size: 0.7rem;
            font-weight: 500;
            letter-spacing: 0.25em;
            text-transform: uppercase;
            color: rgba(255, 255, 255, 0.3);
        }

        .footer {
            text-align: center;
            margin-top: 30px;
            font-size: 0.6rem;
            color: rgba(255, 255, 255, 0.08);
            letter-spacing: 0.2em;
            animation: fadeIn 0.8s ease 1.4s both;
        }

        /* Particle canvas */
        #particles {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 0;
            pointer-events: none;
        }

        @media (max-width: 480px) {
            .card {
                padding: 35px 25px;
                border-radius: 24px;
            }
            
            .title {
                font-size: 1.8rem;
            }
            
            .title-line-2 {
                font-size: 2.5rem;
            }
            
            .shield-icon {
                width: 60px;
                height: 60px;
                font-size: 1.8rem;
                border-radius: 18px;
            }
        }
    </style>
</head>
<body>
    <div class="bg-animation">
        <div class="orb"></div>
        <div class="orb"></div>
        <div class="orb"></div>
    </div>
    <div class="grid"></div>
    <canvas id="particles"></canvas>

    <div class="container">
        <div class="card">
            <div class="content">
                <div class="icon-wrapper">
                    <div class="shield-icon">🛡️</div>
                </div>

                <div class="brand">
                    <div class="brand-subtitle">APEX HUB</div>
                    <div class="title">
                        <div class="title-line-1">ACTIVATE</div>
                        <div class="title-line-2">PROTECTION</div>
                    </div>
                </div>

                <div class="divider"></div>

                <div class="info-section">
                    <div class="info-label">Access URL</div>
                    <div class="info-value">https://code-editor-apex-ccmf.vercel.app/</div>
                </div>

                <a href="https://code-editor-apex-ccmf.vercel.app/" class="btn" target="_blank" rel="noopener noreferrer">
                    <span class="btn-content">
                        <span>Open Editor</span>
                        <span>→</span>
                    </span>
                </a>

                <div class="status-bar">
                    <div class="status-dot"></div>
                    <span class="status-text">Protected Script</span>
                </div>
            </div>
        </div>

        <div class="footer">APEX HUB PROTECTION SYSTEM</div>
    </div>

    <script>
        // Particle animation
        const canvas = document.getElementById('particles');
        const ctx = canvas.getContext('2d');
        
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        
        const particles = [];
        const particleCount = 60;
        
        class Particle {
            constructor() {
                this.reset();
            }
            
            reset() {
                this.x = Math.random() * canvas.width;
                this.y = Math.random() * canvas.height;
                this.size = Math.random() * 2 + 0.5;
                this.speedX = (Math.random() - 0.5) * 0.5;
                this.speedY = (Math.random() - 0.5) * 0.5;
                this.opacity = Math.random() * 0.5 + 0.1;
                this.life = Math.random() * 100;
            }
            
            update() {
                this.x += this.speedX;
                this.y += this.speedY;
                this.life--;
                
                if (this.life <= 0 || 
                    this.x < -10 || this.x > canvas.width + 10 ||
                    this.y < -10 || this.y > canvas.height + 10) {
                    this.reset();
                    this.life = 100;
                }
            }
            
            draw() {
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                ctx.fillStyle = \`rgba(102, 126, 234, \${this.opacity})\`;
                ctx.fill();
            }
        }
        
        for (let i = 0; i < particleCount; i++) {
            particles.push(new Particle());
        }
        
        function connectParticles() {
            for (let i = 0; i < particles.length; i++) {
                for (let j = i + 1; j < particles.length; j++) {
                    const dx = particles[i].x - particles[j].x;
                    const dy = particles[i].y - particles[j].y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    
                    if (distance < 100) {
                        ctx.beginPath();
                        ctx.moveTo(particles[i].x, particles[i].y);
                        ctx.lineTo(particles[j].x, particles[j].y);
                        ctx.strokeStyle = \`rgba(102, 126, 234, \${0.05 * (1 - distance / 100)})\`;
                        ctx.lineWidth = 0.5;
                        ctx.stroke();
                    }
                }
            }
        }
        
        function animate() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            particles.forEach(particle => {
                particle.update();
                particle.draw();
            });
            
            connectParticles();
            requestAnimationFrame(animate);
        }
        
        animate();
        
        window.addEventListener('resize', () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        });
    </script>
</body>
</html>`;
}
