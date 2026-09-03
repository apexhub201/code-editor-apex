// ============================================================
// api/raw.js - APEX HUB V8 (Firebase Persistence + Professional UI)
// ============================================================

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Export trực tiếp handler từ IIFE
export default (function() {
    // Khởi tạo Firebase Admin (chỉ chạy 1 lần)
    if (!getApps().length) {
        try {
            initializeApp({
                credential: cert({
                    projectId: process.env.FIREBASE_PROJECT_ID,
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
                })
            });
        } catch (error) {
            console.error('Firebase init error:', error);
        }
    }

    const db = getFirestore();
    
    function getConstants() {
        return {
            SCRIPTS_COLLECTION: 'scripts',
            CHALLENGES_COLLECTION: 'challenges',
            RATE_LIMITS_COLLECTION: 'rate_limits',
            BANNED_COLLECTION: 'banned_ips'
        };
    }

    const memoryCache = new Map();
    const CACHE_TTL = 5 * 60 * 1000;

    // ============================================================
    // HELPERS
    // ============================================================

    function generateRandomKey(length = 32) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    function encryptPayload(code) {
        const key = generateRandomKey(16);
        const bytes = Buffer.from(code, 'utf8');
        const encrypted = Buffer.alloc(bytes.length);
        
        for (let i = 0; i < bytes.length; i++) {
            const keyChar = key.charCodeAt(i % key.length);
            encrypted[i] = bytes[i] ^ keyChar;
        }
        return { data: encrypted.toString('hex'), key: key };
    }

    function generateChallenge() {
        const ops = ['+', '-', '*'];
        const op = ops[Math.floor(Math.random() * ops.length)];
        let num1, num2, answer;
        
        switch(op) {
            case '+': 
                num1 = Math.floor(Math.random() * 50) + 1; 
                num2 = Math.floor(Math.random() * 50) + 1; 
                answer = num1 + num2; 
                break;
            case '-': 
                num1 = Math.floor(Math.random() * 50) + 25; 
                num2 = Math.floor(Math.random() * 25) + 1; 
                answer = num1 - num2; 
                break;
            case '*': 
                num1 = Math.floor(Math.random() * 12) + 1; 
                num2 = Math.floor(Math.random() * 12) + 1; 
                answer = num1 * num2; 
                break;
        }
        
        return {
            question: `${num1} ${op} ${num2} = ?`,
            answer: answer.toString(),
            token: Math.random().toString(36).substring(2, 15) + Date.now().toString(36)
        };
    }

    async function checkRateLimit(ip) {
        const now = Date.now();
        const { RATE_LIMITS_COLLECTION, BANNED_COLLECTION } = getConstants();
        
        try {
            const docRef = db.collection(RATE_LIMITS_COLLECTION).doc(ip);
            const doc = await docRef.get();
            
            if (!doc.exists) {
                await docRef.set({
                    count: 1,
                    resetTime: now + 60000,
                    createdAt: now
                });
                return true;
            }
            
            const data = doc.data();
            
            if (now > data.resetTime) {
                await docRef.update({
                    count: 1,
                    resetTime: now + 60000
                });
                return true;
            }
            
            if (data.count >= 30) {
                await db.collection(BANNED_COLLECTION).doc(ip).set({
                    bannedUntil: now + 300000,
                    reason: 'Rate limit exceeded',
                    createdAt: now
                });
                return false;
            }
            
            await docRef.update({
                count: data.count + 1
            });
            
            return true;
        } catch (error) {
            console.error('Rate limit check error:', error);
            return true;
        }
    }

    async function isIPBanned(ip) {
        const { BANNED_COLLECTION } = getConstants();
        
        try {
            const doc = await db.collection(BANNED_COLLECTION).doc(ip).get();
            
            if (!doc.exists) return false;
            
            const data = doc.data();
            if (Date.now() < data.bannedUntil) {
                return true;
            }
            
            await doc.ref.delete();
            return false;
        } catch (error) {
            console.error('IP ban check error:', error);
            return false;
        }
    }

    async function getScript(name) {
        const { SCRIPTS_COLLECTION } = getConstants();
        const cached = memoryCache.get(name);
        
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            return cached.data;
        }
        
        try {
            const doc = await db.collection(SCRIPTS_COLLECTION).doc(name).get();
            
            if (!doc.exists) return null;
            
            const data = doc.data();
            
            await doc.ref.update({ lastAccessed: Date.now() });
            
            memoryCache.set(name, {
                data: data,
                timestamp: Date.now()
            });
            
            return data;
        } catch (error) {
            console.error('Get script error:', error);
            return null;
        }
    }

    async function saveScript(name, data) {
        const { SCRIPTS_COLLECTION } = getConstants();
        
        try {
            await db.collection(SCRIPTS_COLLECTION).doc(name).set({
                ...data,
                updatedAt: Date.now()
            }, { merge: true });
            
            memoryCache.delete(name);
            
            return true;
        } catch (error) {
            console.error('Save script error:', error);
            return false;
        }
    }

    async function deleteScript(name) {
        const { SCRIPTS_COLLECTION } = getConstants();
        
        try {
            await db.collection(SCRIPTS_COLLECTION).doc(name).delete();
            memoryCache.delete(name);
            return true;
        } catch (error) {
            console.error('Delete script error:', error);
            return false;
        }
    }

    function normalizeName(name) {
        return name.trim().toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '') || 'script';
    }

    // ============================================================
    // LOADER HEX SIÊU TỐC
    // ============================================================

    function generateLoader(encryptedPayload, host) {
        const hexData = encryptedPayload.data;
        const key = encryptedPayload.key;
        const out = [];
        
        out.push(`-- APEX HUB Loader v8 (Professional Edition)`);
        out.push(`-- Protected by APEX Security System`);
        out.push(`local _key = "${key}"`);
        out.push(`local _hex = "${hexData}"\n`);
        
        out.push(`local _byte = string.byte`);
        out.push(`local _char = string.char`);
        out.push(`local _tonumber = tonumber`);
        out.push(`local _bxor = bit32 and bit32.bxor or bit and bit.bxor`);
        out.push(`local _keyLen = #_key`);
        out.push(`local _idx = 1\n`);
        
        out.push(`local _code = _hex:gsub("..", function(cc)`);
        out.push(`    local b = _tonumber(cc, 16)`);
        out.push(`    local kb = _byte(_key, (_idx - 1) % _keyLen + 1)`);
        out.push(`    _idx = _idx + 1`);
        out.push(`    return _char(_bxor(b, kb))`);
        out.push(`end)\n`);
        
        out.push(`_hex = nil`);
        out.push(`_key = nil\n`);
        
        out.push(`assert(type(_code) == "string", "APEX Error: Decoded data corrupted")`);
        out.push(`assert(#_code > 0, "APEX Error: Decoded script content is empty")\n`);
        
        out.push(`local _f, _e = loadstring(_code)`);
        out.push(`if not _f then`);
        out.push(`    warn("=== APEX HUB CLIENT DEBUG ===")`);
        out.push(`    warn("Received Payload Size: " .. #_code .. " bytes")`);
        out.push(`    error("APEX Hub Compile Error: " .. tostring(_e))`);
        out.push(`end`);
        out.push(`_code = nil`);
        out.push(`_f()`);
        out.push(`_f = nil`);
        out.push(`collectgarbage("collect")`);
        
        return out.join('\n');
    }

    // ============================================================
    // HANDLE GET
    // ============================================================

    async function handleGet(req, res) {
        const { name, key, raw, challenge, answer } = req.query;
        const ua = (req.headers['user-agent'] || '').toLowerCase();
        const clientIP = req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown';
        const authKey = req.headers['x-auth-key'] || '';
        const { CHALLENGES_COLLECTION, BANNED_COLLECTION } = getConstants();

        if (await isIPBanned(clientIP)) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.status(403).send(getBannedPage());
        }

        if (!await checkRateLimit(clientIP)) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.status(429).send(getRateLimitPage());
        }

        if (!name) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.send(getWelcomePage(req.headers.host));
        }

        const scriptData = await getScript(name);
        
        if (!scriptData) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.status(404).send(getErrorPage(name));
        }

        const VALID_KEYS = ['d0egkw6en9eusrjje5vn70p2tvkngkkn', 'apex-master-key-2024'];
        const hasValidKey = VALID_KEYS.includes(key) || VALID_KEYS.includes(authKey);
        const wantsRaw = raw === 'true';

        if (hasValidKey || wantsRaw) {
            const payload = encryptPayload(scriptData.code);
            return res.json({
                success: true,
                payload: payload.data,
                decryptKey: payload.key
            });
        }

        const executorPatterns = [
            'roblox', 'synapse', 'krnl', 'script-ware', 'sentinel',
            'fluxus', 'electron', 'comet', 'oxygen', 'valyse',
            'hydrogen', 'codex', 'vega', 'trigon', 'nexus',
            'solara', 'jjsploit', 'celestial', 'evon', 'aris'
        ];
        const isExecutor = executorPatterns.some(p => ua.includes(p));

        if (isExecutor) {
            const payload = encryptPayload(scriptData.code);
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
            return res.send(generateLoader(payload, req.headers.host));
        }

        if (challenge && answer) {
            try {
                const challengeDoc = await db.collection(CHALLENGES_COLLECTION).doc(challenge).get();
                
                if (challengeDoc.exists) {
                    const c = challengeDoc.data();
                    
                    if (!c.used && Date.now() - c.createdAt < 60000) {
                        if (answer === c.answer) {
                            await challengeDoc.ref.update({ used: true });
                            
                            const payload = encryptPayload(scriptData.code);
                            return res.json({ success: true, payload: payload.data, decryptKey: payload.key });
                        } else {
                            const attempts = (c.attempts || 0) + 1;
                            await challengeDoc.ref.update({ attempts });
                            
                            if (attempts >= 3) {
                                await db.collection(BANNED_COLLECTION).doc(clientIP).set({
                                    bannedUntil: Date.now() + 600000,
                                    reason: 'Too many failed challenges',
                                    createdAt: Date.now()
                                });
                            }
                        }
                    }
                }
            } catch (error) {
                console.error('Challenge check error:', error);
            }
        }

        const isBrowser = ua.includes('mozilla') || ua.includes('chrome') ||
                          ua.includes('safari') || ua.includes('firefox') ||
                          ua.includes('edge') || ua.includes('opera');

        if (isBrowser) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.send(getProtectionPage(req.headers.host));
        }

        const newChallenge = generateChallenge();
        
        try {
            await db.collection(CHALLENGES_COLLECTION).doc(newChallenge.token).set({
                answer: newChallenge.answer,
                createdAt: Date.now(),
                used: false,
                attempts: 0
            });
        } catch (error) {
            console.error('Save challenge error:', error);
        }

        return res.json({
            protected: true,
            message: 'Challenge required',
            challenge: { question: newChallenge.question, token: newChallenge.token }
        });
    }

    // ============================================================
    // HANDLE CREATE
    // ============================================================

    async function handleCreate(req, res) {
        try {
            const { code, name, uid } = req.body;
            
            if (!code || !code.trim()) {
                return res.status(400).json({ success: false, error: 'Code is required' });
            }
            if (!name || !name.trim()) {
                return res.status(400).json({ success: false, error: 'Name is required' });
            }

            const nameSlug = normalizeName(name);
            const userId = uid || 'public';
            const fullName = userId + '_' + nameSlug;

            const existingScript = await getScript(fullName);
            
            if (existingScript) {
                const newName = fullName + '_' + Date.now().toString(36);
                const scriptData = {
                    code: code,
                    name: name.trim(),
                    created: Date.now(),
                    lastAccessed: Date.now(),
                    owner: userId
                };
                
                await saveScript(newName, scriptData);
                
                const rawUrl = `https://${req.headers.host}/api/raw?name=${newName}`;
                return res.status(200).json({
                    success: true,
                    raw: rawUrl,
                    name: newName,
                    existed: true
                });
            }

            const scriptData = {
                code: code,
                name: name.trim(),
                created: Date.now(),
                lastAccessed: Date.now(),
                owner: userId
            };

            await saveScript(fullName, scriptData);

            const rawUrl = `https://${req.headers.host}/api/raw?name=${fullName}`;
            const rawUrlWithKey = `https://${req.headers.host}/api/raw?name=${fullName}&key=d0egkw6en9eusrjje5vn70p2tvkngkkn`;

            return res.status(200).json({
                success: true,
                raw: rawUrl,
                rawWithKey: rawUrlWithKey,
                name: fullName
            });
        } catch (error) {
            console.error('Create error:', error);
            return res.status(500).json({ success: false, error: error.message });
        }
    }

    // ============================================================
    // HANDLE UPDATE
    // ============================================================

    async function handleUpdate(req, res) {
        try {
            const { name, code, uid } = req.body;
            
            if (!name) {
                return res.status(400).json({ success: false, error: 'Name is required' });
            }
            
            const scriptData = await getScript(name);
            
            if (!scriptData) {
                return res.status(404).json({ success: false, error: 'Script not found' });
            }
            
            if (!code || !code.trim()) {
                return res.status(400).json({ success: false, error: 'Code is required' });
            }

            if (uid && scriptData.owner && scriptData.owner !== uid) {
                return res.status(403).json({ success: false, error: 'Not your script' });
            }

            scriptData.code = code;
            scriptData.updated = Date.now();
            scriptData.lastAccessed = Date.now();

            await saveScript(name, scriptData);

            const rawUrl = `https://${req.headers.host}/api/raw?name=${name}`;
            return res.status(200).json({
                success: true,
                message: 'Updated successfully',
                raw: rawUrl,
                name: name
            });
        } catch (error) {
            console.error('Update error:', error);
            return res.status(500).json({ success: false, error: error.message });
        }
    }

    // ============================================================
    // HANDLE DELETE
    // ============================================================

    async function handleDelete(req, res) {
        try {
            const { name, uid } = req.query;
            
            if (!name) {
                return res.status(400).json({ success: false, error: 'Name is required' });
            }
            
            const scriptData = await getScript(name);
            
            if (!scriptData) {
                return res.status(404).json({ success: false, error: 'Script not found' });
            }
            
            if (uid && scriptData.owner && scriptData.owner !== uid) {
                return res.status(403).json({ success: false, error: 'Not your script' });
            }
            
            await deleteScript(name);
            
            return res.status(200).json({ success: true, message: 'Deleted successfully' });
        } catch (error) {
            console.error('Delete error:', error);
            return res.status(500).json({ success: false, error: error.message });
        }
    }

    // ============================================================
    // PROFESSIONAL PROTECTION PAGE - LUXURY DARK THEME
    // ============================================================

    function getProtectionPage(host) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>APEX HUB | Advanced Protection System</title>
    <meta name="robots" content="noindex, nofollow">
    <meta name="theme-color" content="#0a0a0a">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@200;300;400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-primary: #080808;
            --bg-secondary: #0c0c0c;
            --bg-card: #111111;
            --border-subtle: rgba(255, 255, 255, 0.03);
            --border-medium: rgba(255, 255, 255, 0.06);
            --border-accent: rgba(200, 164, 92, 0.15);
            --text-primary: #f5f5f5;
            --text-secondary: #999999;
            --text-muted: #555555;
            --accent-gold: #c8a45c;
            --accent-gold-light: #d4b06a;
            --accent-gold-dark: #9a7b3a;
            --accent-silver: #b0b0b0;
            --glow-gold: rgba(200, 164, 92, 0.06);
            --glow-gold-strong: rgba(200, 164, 92, 0.12);
            --font-primary: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: var(--font-primary);
            background: var(--bg-primary);
            color: var(--text-primary);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            overflow-x: hidden;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
            position: relative;
        }

        .bg-layer {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 0;
        }

        .gradient-orb {
            position: absolute;
            border-radius: 50%;
            filter: blur(180px);
            opacity: 0.25;
        }

        .gradient-orb-1 {
            width: 800px;
            height: 800px;
            background: radial-gradient(circle at 40% 40%, rgba(200, 164, 92, 0.3), transparent 70%);
            top: -300px;
            right: -200px;
            animation: orbFloat1 25s ease-in-out infinite;
        }

        .gradient-orb-2 {
            width: 600px;
            height: 600px;
            background: radial-gradient(circle at 60% 60%, rgba(180, 180, 180, 0.2), transparent 70%);
            bottom: -200px;
            left: -150px;
            animation: orbFloat2 20s ease-in-out infinite;
            animation-delay: -10s;
        }

        .gradient-orb-3 {
            width: 500px;
            height: 500px;
            background: radial-gradient(circle at 50% 50%, rgba(200, 164, 92, 0.15), transparent 70%);
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            animation: orbFloat3 22s ease-in-out infinite;
            animation-delay: -5s;
        }

        @keyframes orbFloat1 {
            0%, 100% { transform: translate(0, 0) scale(1); }
            33% { transform: translate(-50px, 40px) scale(1.05); }
            66% { transform: translate(30px, -30px) scale(0.95); }
        }

        @keyframes orbFloat2 {
            0%, 100% { transform: translate(0, 0) scale(1); }
            33% { transform: translate(40px, -30px) scale(1.08); }
            66% { transform: translate(-20px, 50px) scale(0.92); }
        }

        @keyframes orbFloat3 {
            0%, 100% { transform: translate(-50%, -50%) scale(1); }
            33% { transform: translate(-40%, -60%) scale(1.1); }
            66% { transform: translate(-60%, -40%) scale(0.9); }
        }

        .grid-texture {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-image: 
                linear-gradient(rgba(255, 255, 255, 0.015) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255, 255, 255, 0.015) 1px, transparent 1px);
            background-size: 80px 80px;
            z-index: 0;
            pointer-events: none;
            mask-image: radial-gradient(ellipse at center, black 30%, transparent 70%);
            -webkit-mask-image: radial-gradient(ellipse at center, black 30%, transparent 70%);
        }

        .noise-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 0;
            opacity: 0.02;
            background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
        }

        .container {
            position: relative;
            z-index: 1;
            width: 90%;
            max-width: 520px;
            padding: 24px;
        }

        .card {
            background: var(--bg-card);
            backdrop-filter: blur(60px);
            -webkit-backdrop-filter: blur(60px);
            border-radius: 28px;
            padding: 64px 52px;
            border: 1px solid var(--border-medium);
            box-shadow: 
                0 4px 6px rgba(0, 0, 0, 0.4),
                0 20px 60px rgba(0, 0, 0, 0.6),
                0 0 120px rgba(200, 164, 92, 0.03),
                inset 0 1px 0 rgba(255, 255, 255, 0.02);
            animation: cardReveal 1s cubic-bezier(0.22, 1, 0.36, 1);
            position: relative;
            overflow: hidden;
        }

        .card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 20%;
            right: 20%;
            height: 1px;
            background: linear-gradient(90deg, 
                transparent 0%, 
                rgba(200, 164, 92, 0.3) 20%, 
                rgba(200, 164, 92, 0.6) 50%, 
                rgba(200, 164, 92, 0.3) 80%, 
                transparent 100%);
            animation: accentLine 6s ease-in-out infinite;
        }

        .card::after {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: radial-gradient(ellipse at 50% 0%, rgba(200, 164, 92, 0.02), transparent 60%);
            pointer-events: none;
        }

        @keyframes cardReveal {
            from {
                opacity: 0;
                transform: translateY(60px) scale(0.92);
                filter: blur(8px);
            }
            to {
                opacity: 1;
                transform: translateY(0) scale(1);
                filter: blur(0);
            }
        }

        @keyframes accentLine {
            0%, 100% { opacity: 0.5; }
            50% { opacity: 1; }
        }

        .logo-section {
            position: relative;
            display: flex;
            justify-content: center;
            align-items: center;
            margin-bottom: 40px;
        }

        .logo-ring {
            position: absolute;
            border-radius: 50%;
            border: 1px solid rgba(200, 164, 92, 0.1);
        }

        .logo-ring-1 {
            width: 140px;
            height: 140px;
            animation: ringRotate 20s linear infinite;
        }

        .logo-ring-2 {
            width: 120px;
            height: 120px;
            border-style: dashed;
            border-color: rgba(200, 164, 92, 0.08);
            animation: ringRotate 15s linear infinite reverse;
        }

        .logo-ring-3 {
            width: 100px;
            height: 100px;
            border-color: rgba(200, 164, 92, 0.06);
            animation: ringRotate 25s linear infinite;
        }

        @keyframes ringRotate {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }

        .logo-inner {
            width: 64px;
            height: 64px;
            position: relative;
            z-index: 1;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .logo-diamond {
            width: 24px;
            height: 24px;
            background: linear-gradient(135deg, var(--accent-gold-light), var(--accent-gold-dark));
            transform: rotate(45deg);
            border-radius: 3px;
            box-shadow: 
                0 0 40px rgba(200, 164, 92, 0.5),
                0 0 80px rgba(200, 164, 92, 0.2);
            animation: diamondPulse 3s ease-in-out infinite;
        }

        @keyframes diamondPulse {
            0%, 100% { 
                transform: rotate(45deg) scale(1);
                box-shadow: 0 0 40px rgba(200, 164, 92, 0.5), 0 0 80px rgba(200, 164, 92, 0.2);
            }
            50% { 
                transform: rotate(45deg) scale(1.15);
                box-shadow: 0 0 60px rgba(200, 164, 92, 0.7), 0 0 100px rgba(200, 164, 92, 0.3);
            }
        }

        .title {
            font-size: 3.2rem;
            font-weight: 200;
            letter-spacing: 0.15em;
            text-align: center;
            margin-bottom: 4px;
            color: var(--text-primary);
            text-transform: uppercase;
        }

        .title-accent {
            font-weight: 600;
            color: var(--accent-gold);
        }

        .subtitle {
            text-align: center;
            color: var(--text-secondary);
            font-size: 0.7rem;
            letter-spacing: 0.4em;
            text-transform: uppercase;
            font-weight: 400;
            margin-bottom: 48px;
        }

        .divider {
            display: flex;
            align-items: center;
            gap: 20px;
            margin: 36px 0;
        }

        .divider-line {
            flex: 1;
            height: 1px;
            background: linear-gradient(90deg, transparent, var(--border-medium), transparent);
        }

        .divider-dot {
            width: 4px;
            height: 4px;
            background: var(--accent-gold);
            border-radius: 50%;
            box-shadow: 0 0 12px var(--accent-gold);
            animation: dotGlow 2s ease-in-out infinite;
        }

        @keyframes dotGlow {
            0%, 100% { opacity: 0.4; transform: scale(1); }
            50% { opacity: 1; transform: scale(1.8); }
        }

        .message-box {
            background: rgba(255, 255, 255, 0.01);
            border: 1px solid var(--border-subtle);
            border-radius: 20px;
            padding: 32px 28px;
            text-align: center;
            position: relative;
        }

        .message-text {
            color: var(--text-secondary);
            font-size: 0.88rem;
            line-height: 1.9;
            font-weight: 300;
            letter-spacing: 0.02em;
        }

        .highlight {
            color: var(--accent-gold);
            font-weight: 500;
        }

        .loading-dots {
            display: flex;
            justify-content: center;
            gap: 12px;
            margin-top: 24px;
        }

        .loading-dot {
            width: 3px;
            height: 3px;
            border-radius: 50%;
            background: var(--accent-gold);
            animation: loadingDot 1.8s ease-in-out infinite;
        }

        .loading-dot:nth-child(2) { animation-delay: 0.2s; }
        .loading-dot:nth-child(3) { animation-delay: 0.4s; }

        @keyframes loadingDot {
            0%, 80%, 100% { 
                opacity: 0.2; 
                transform: scale(1); 
            }
            40% { 
                opacity: 1; 
                transform: scale(2.5); 
            }
        }

        .status-row {
            display: flex;
            justify-content: center;
            gap: 40px;
            margin-top: 36px;
        }

        .status-item {
            display: flex;
            align-items: center;
            gap: 10px;
            font-size: 0.6rem;
            text-transform: uppercase;
            letter-spacing: 0.25em;
            color: var(--text-muted);
            font-weight: 500;
        }

        .status-indicator {
            width: 5px;
            height: 5px;
            border-radius: 50%;
            animation: statusGlow 2.5s ease-in-out infinite;
        }

        .status-indicator.active {
            background: #c8a45c;
            box-shadow: 0 0 8px #c8a45c;
        }

        .status-indicator.warning {
            background: #b0b0b0;
            box-shadow: 0 0 8px #b0b0b0;
            animation-delay: 0.8s;
        }

        .status-indicator.info {
            background: #8b7355;
            box-shadow: 0 0 8px #8b7355;
            animation-delay: 1.6s;
        }

        @keyframes statusGlow {
            0%, 100% { opacity: 0.3; }
            50% { opacity: 1; }
        }

        .cta-button {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 14px;
            width: 100%;
            padding: 18px 24px;
            margin-top: 40px;
            background: transparent;
            border: 1px solid rgba(200, 164, 92, 0.2);
            border-radius: 14px;
            color: var(--text-primary);
            text-decoration: none;
            font-weight: 500;
            font-size: 0.85rem;
            letter-spacing: 0.05em;
            transition: all 0.5s cubic-bezier(0.22, 1, 0.36, 1);
            cursor: pointer;
            position: relative;
            overflow: hidden;
        }

        .cta-button::before {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(200, 164, 92, 0.05), transparent);
            transition: left 0.6s cubic-bezier(0.22, 1, 0.36, 1);
        }

        .cta-button:hover {
            background: rgba(200, 164, 92, 0.04);
            border-color: rgba(200, 164, 92, 0.4);
            transform: translateY(-3px);
            box-shadow: 
                0 15px 40px rgba(0, 0, 0, 0.5),
                0 0 80px rgba(200, 164, 92, 0.06);
        }

        .cta-button:hover::before {
            left: 100%;
        }

        .cta-button-arrow {
            transition: transform 0.4s cubic-bezier(0.22, 1, 0.36, 1);
            opacity: 0.5;
        }

        .cta-button:hover .cta-button-arrow {
            transform: translateX(5px);
            opacity: 1;
        }

        .footer {
            text-align: center;
            margin-top: 32px;
            font-size: 0.55rem;
            letter-spacing: 0.3em;
            text-transform: uppercase;
            color: var(--text-muted);
            font-weight: 400;
        }

        @media (max-width: 600px) {
            .card {
                padding: 48px 28px;
                border-radius: 24px;
            }
            
            .title {
                font-size: 2.4rem;
                letter-spacing: 0.1em;
            }
            
            .subtitle {
                font-size: 0.6rem;
                letter-spacing: 0.3em;
                margin-bottom: 36px;
            }
            
            .logo-ring-1 { width: 110px; height: 110px; }
            .logo-ring-2 { width: 92px; height: 92px; }
            .logo-ring-3 { width: 74px; height: 74px; }
            .logo-diamond { width: 20px; height: 20px; }
            
            .status-row { gap: 24px; }
            .status-item { font-size: 0.5rem; letter-spacing: 0.2em; }
            
            .message-box { padding: 24px 20px; }
            .message-text { font-size: 0.8rem; }
        }

        @media (max-width: 380px) {
            .card {
                padding: 36px 20px;
            }
            
            .title {
                font-size: 1.9rem;
            }
            
            .subtitle {
                font-size: 0.55rem;
                letter-spacing: 0.25em;
            }
            
            .status-row { gap: 16px; flex-wrap: wrap; }
        }
    </style>
</head>
<body>
    <div class="bg-layer">
        <div class="gradient-orb gradient-orb-1"></div>
        <div class="gradient-orb gradient-orb-2"></div>
        <div class="gradient-orb gradient-orb-3"></div>
    </div>
    <div class="grid-texture"></div>
    <div class="noise-overlay"></div>

    <div class="container">
        <div class="card">
            <div class="logo-section">
                <div class="logo-ring logo-ring-1"></div>
                <div class="logo-ring logo-ring-2"></div>
                <div class="logo-ring logo-ring-3"></div>
                <div class="logo-inner">
                    <div class="logo-diamond"></div>
                </div>
            </div>

            <h1 class="title">
                <span class="title-accent">Apex</span> Hub
            </h1>
            <p class="subtitle">Advanced Protection System</p>

            <div class="divider">
                <div class="divider-line"></div>
                <div class="divider-dot"></div>
                <div class="divider-line"></div>
            </div>

            <div class="message-box">
                <p class="message-text">
                    This endpoint is secured by<br>
                    <span class="highlight">APEX HUB</span> protection layer.<br>
                    Access restricted to authorized<br>
                    executors only.
                </p>
                <div class="loading-dots">
                    <div class="loading-dot"></div>
                    <div class="loading-dot"></div>
                    <div class="loading-dot"></div>
                </div>
            </div>

            <div class="status-row">
                <div class="status-item">
                    <div class="status-indicator active"></div>
                    <span>Encrypted</span>
                </div>
                <div class="status-item">
                    <div class="status-indicator warning"></div>
                    <span>Protected</span>
                </div>
                <div class="status-item">
                    <div class="status-indicator info"></div>
                    <span>Secure</span>
                </div>
            </div>

            <a href="https://apexhubeditor.vercel.app/" class="cta-button" target="_blank" rel="noopener noreferrer">
                <span>Open APEX HUB Editor</span>
                <span class="cta-button-arrow">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                        <polyline points="12 5 19 12 12 19"></polyline>
                    </svg>
                </span>
            </a>

            <div class="footer">APEX HUB · Protection System v8</div>
        </div>
    </div>
</body>
</html>`;
    }

    // ============================================================
    // WELCOME PAGE - LUXURY DARK THEME
    // ============================================================

    function getWelcomePage(host) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>APEX HUB | Raw API Service</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@200;300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-primary: #080808;
            --bg-card: #111111;
            --border-subtle: rgba(255, 255, 255, 0.04);
            --border-medium: rgba(255, 255, 255, 0.08);
            --text-primary: #f5f5f5;
            --text-secondary: #999999;
            --text-muted: #555555;
            --accent-gold: #c8a45c;
            --accent-gold-light: #d4b06a;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
            background: var(--bg-primary);
            color: var(--text-primary);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            -webkit-font-smoothing: antialiased;
        }

        .card {
            background: var(--bg-card);
            border-radius: 24px;
            padding: 56px 48px;
            border: 1px solid var(--border-medium);
            text-align: center;
            max-width: 540px;
            width: 90%;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        }

        h1 {
            font-size: 2.4rem;
            font-weight: 200;
            letter-spacing: 0.12em;
            margin-bottom: 12px;
            text-transform: uppercase;
        }

        .accent {
            font-weight: 600;
            color: var(--accent-gold);
        }

        .subtitle {
            color: var(--text-secondary);
            margin-bottom: 44px;
            font-size: 0.82rem;
            letter-spacing: 0.08em;
            font-weight: 300;
        }

        .endpoints {
            text-align: left;
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .endpoint {
            display: flex;
            align-items: center;
            gap: 16px;
            padding: 14px 18px;
            font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
            font-size: 0.78rem;
            background: rgba(255, 255, 255, 0.01);
            border-radius: 12px;
            border: 1px solid transparent;
            transition: all 0.3s ease;
        }

        .endpoint:hover {
            background: rgba(255, 255, 255, 0.02);
            border-color: var(--border-subtle);
        }

        .method {
            font-weight: 600;
            min-width: 52px;
            font-size: 0.65rem;
            padding: 5px 10px;
            border-radius: 8px;
            text-align: center;
            letter-spacing: 0.06em;
            text-transform: uppercase;
        }

        .post { background: rgba(200, 164, 92, 0.08); color: #c8a45c; }
        .put { background: rgba(180, 180, 180, 0.08); color: #b0b0b0; }
        .get { background: rgba(180, 180, 180, 0.05); color: #d4b06a; }
        .del { background: rgba(180, 180, 180, 0.04); color: #999999; }

        .path { color: #cccccc; font-weight: 400; letter-spacing: 0.02em; }

        .footer {
            margin-top: 40px;
            font-size: 0.58rem;
            letter-spacing: 0.3em;
            text-transform: uppercase;
            color: var(--text-muted);
            font-weight: 400;
        }

        .divider {
            width: 40px;
            height: 1px;
            background: rgba(200, 164, 92, 0.3);
            margin: 0 auto 36px;
        }

        @media (max-width: 480px) {
            .card { padding: 40px 24px; }
            h1 { font-size: 1.8rem; }
            .endpoint { padding: 12px 14px; font-size: 0.7rem; gap: 12px; }
            .method { min-width: 44px; font-size: 0.58rem; padding: 4px 8px; }
        }
    </style>
</head>
<body>
    <div class="card">
        <h1><span class="accent">Apex</span> Hub</h1>
        <p class="subtitle">Professional Raw API Service for Script Execution</p>
        
        <div class="divider"></div>
        
        <div class="endpoints">
            <div class="endpoint">
                <span class="method post">POST</span>
                <span class="path">/api/raw</span>
            </div>
            <div class="endpoint">
                <span class="method put">PUT</span>
                <span class="path">/api/raw</span>
            </div>
            <div class="endpoint">
                <span class="method get">GET</span>
                <span class="path">/api/raw?name=script</span>
            </div>
            <div class="endpoint">
                <span class="method del">DEL</span>
                <span class="path">/api/raw?name=script</span>
            </div>
        </div>
        
        <div class="footer">APEX HUB · Production Ready</div>
    </div>
</body>
</html>`;
    }

    // ============================================================
    // ERROR PAGE - LUXURY DARK THEME
    // ============================================================

    function getErrorPage(name) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>404 | APEX HUB</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@200;300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-primary: #080808;
            --bg-card: #111111;
            --border-subtle: rgba(255, 255, 255, 0.04);
            --border-medium: rgba(255, 255, 255, 0.08);
            --text-primary: #f5f5f5;
            --text-secondary: #999999;
            --text-muted: #555555;
            --accent-gold: #c8a45c;
            --error-color: #a0a0a0;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
            background: var(--bg-primary);
            color: var(--text-primary);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            -webkit-font-smoothing: antialiased;
        }

        .card {
            background: var(--bg-card);
            border-radius: 24px;
            padding: 56px 48px;
            border: 1px solid var(--border-medium);
            text-align: center;
            max-width: 480px;
            width: 90%;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        }

        .error-code {
            font-size: 8rem;
            font-weight: 100;
            letter-spacing: -0.02em;
            color: var(--text-secondary);
            line-height: 1;
            margin-bottom: 8px;
            opacity: 0.6;
        }

        .error-title {
            font-size: 1.2rem;
            font-weight: 500;
            letter-spacing: 0.08em;
            color: var(--text-primary);
            margin-bottom: 16px;
            text-transform: uppercase;
        }

        .error-message {
            color: var(--text-secondary);
            font-size: 0.85rem;
            line-height: 1.8;
            font-weight: 300;
            letter-spacing: 0.03em;
        }

        .script-name {
            display: inline-block;
            margin-top: 16px;
            padding: 8px 20px;
            background: rgba(255, 255, 255, 0.02);
            border: 1px solid rgba(255, 255, 255, 0.06);
            border-radius: 8px;
            color: var(--accent-gold);
            font-family: 'SF Mono', 'Fira Code', monospace;
            font-size: 0.75rem;
            letter-spacing: 0.04em;
        }

        .divider {
            width: 30px;
            height: 1px;
            background: rgba(200, 164, 92, 0.2);
            margin: 24px auto;
        }

        @media (max-width: 480px) {
            .card { padding: 40px 24px; }
            .error-code { font-size: 6rem; }
            .error-title { font-size: 1rem; }
            .error-message { font-size: 0.78rem; }
        }
    </style>
</head>
<body>
    <div class="card">
        <div class="error-code">404</div>
        <div class="error-title">Script Not Found</div>
        <div class="divider"></div>
        <p class="error-message">The requested script does not exist or has been removed from the system.</p>
        <div class="script-name">${name}</div>
    </div>
</body>
</html>`;
    }

    // ============================================================
    // BANNED PAGE - LUXURY DARK THEME
    // ============================================================

    function getBannedPage() {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Access Denied | APEX HUB</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@200;300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-primary: #080808;
            --bg-card: #111111;
            --border-subtle: rgba(255, 255, 255, 0.04);
            --border-medium: rgba(255, 255, 255, 0.08);
            --text-primary: #f5f5f5;
            --text-secondary: #999999;
            --text-muted: #555555;
            --accent-gold: #c8a45c;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
            background: var(--bg-primary);
            color: var(--text-primary);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            -webkit-font-smoothing: antialiased;
        }

        .card {
            background: var(--bg-card);
            border-radius: 24px;
            padding: 56px 48px;
            border: 1px solid var(--border-medium);
            text-align: center;
            max-width: 480px;
            width: 90%;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        }

        .status-icon {
            width: 64px;
            height: 64px;
            margin: 0 auto 28px;
            border-radius: 50%;
            border: 1px solid rgba(255, 255, 255, 0.1);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.6rem;
            color: var(--text-secondary);
        }

        .title {
            font-size: 1.1rem;
            font-weight: 500;
            letter-spacing: 0.1em;
            text-transform: uppercase;
            color: var(--text-primary);
            margin-bottom: 16px;
        }

        .message {
            color: var(--text-secondary);
            font-size: 0.82rem;
            line-height: 1.8;
            font-weight: 300;
            letter-spacing: 0.04em;
        }

        .divider {
            width: 30px;
            height: 1px;
            background: rgba(200, 164, 92, 0.2);
            margin: 24px auto;
        }

        .footer-text {
            font-size: 0.58rem;
            letter-spacing: 0.3em;
            text-transform: uppercase;
            color: var(--text-muted);
            font-weight: 400;
        }
    </style>
</head>
<body>
    <div class="card">
        <div class="status-icon">—</div>
        <div class="title">Access Denied</div>
        <div class="divider"></div>
        <p class="message">Suspicious activity has been detected from your connection. Access has been temporarily restricted.</p>
        <div style="margin-top: 28px;" class="footer-text">APEX HUB Security</div>
    </div>
</body>
</html>`;
    }

    // ============================================================
    // RATE LIMIT PAGE - LUXURY DARK THEME
    // ============================================================

    function getRateLimitPage() {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Rate Limited | APEX HUB</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@200;300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-primary: #080808;
            --bg-card: #111111;
            --border-subtle: rgba(255, 255, 255, 0.04);
            --border-medium: rgba(255, 255, 255, 0.08);
            --text-primary: #f5f5f5;
            --text-secondary: #999999;
            --text-muted: #555555;
            --accent-gold: #c8a45c;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
            background: var(--bg-primary);
            color: var(--text-primary);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            -webkit-font-smoothing: antialiased;
        }

        .card {
            background: var(--bg-card);
            border-radius: 24px;
            padding: 56px 48px;
            border: 1px solid var(--border-medium);
            text-align: center;
            max-width: 480px;
            width: 90%;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        }

        .status-icon {
            width: 64px;
            height: 64px;
            margin: 0 auto 28px;
            border-radius: 50%;
            border: 1px solid rgba(255, 255, 255, 0.1);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.6rem;
            color: var(--text-secondary);
            animation: pulse 2s ease-in-out infinite;
        }

        @keyframes pulse {
            0%, 100% { border-color: rgba(255, 255, 255, 0.1); }
            50% { border-color: rgba(200, 164, 92, 0.2); }
        }

        .title {
            font-size: 1.1rem;
            font-weight: 500;
            letter-spacing: 0.1em;
            text-transform: uppercase;
            color: var(--text-primary);
            margin-bottom: 16px;
        }

        .message {
            color: var(--text-secondary);
            font-size: 0.82rem;
            line-height: 1.8;
            font-weight: 300;
            letter-spacing: 0.04em;
        }

        .divider {
            width: 30px;
            height: 1px;
            background: rgba(200, 164, 92, 0.2);
            margin: 24px auto;
        }

        .footer-text {
            font-size: 0.58rem;
            letter-spacing: 0.3em;
            text-transform: uppercase;
            color: var(--text-muted);
            font-weight: 400;
        }
    </style>
</head>
<body>
    <div class="card">
        <div class="status-icon">—</div>
        <div class="title">Rate Limited</div>
        <div class="divider"></div>
        <p class="message">Too many requests have been made. Please wait a moment before trying again.</p>
        <div style="margin-top: 28px;" class="footer-text">APEX HUB Security</div>
    </div>
</body>
</html>`;
    }

    // Return handler function trực tiếp từ IIFE
    return async function handler(req, res) {
        // CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Challenge-Token, X-Challenge-Answer, X-Auth-Key');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');

        if (req.method === 'OPTIONS') {
            return res.status(200).end();
        }

        try {
            if (req.method === 'GET') return await handleGet(req, res);
            if (req.method === 'POST') return await handleCreate(req, res);
            if (req.method === 'PUT') return await handleUpdate(req, res);
            if (req.method === 'DELETE') return await handleDelete(req, res);
            
            return res.status(405).json({ error: 'Method not allowed' });
        } catch (error) {
            console.error('Handler error:', error);
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }
    };
})();
