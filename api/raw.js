// api/raw.js — APEX HUB V10
// ============================================================
// API chính: GET, POST, PUT, DELETE scripts
// Yêu cầu access token cho mọi request GET
// ============================================================

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import Crypto from '../lib/crypto.js';
import Security from '../lib/security.js';

// ============================================================
// FIREBASE INITIALIZATION
// ============================================================

export default (function() {
    // Khởi tạo Firebase nếu chưa có
    if (!getApps().length) {
        try {
            const projectId = process.env.FIREBASE_PROJECT_ID;
            const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
            const privateKey = process.env.FIREBASE_PRIVATE_KEY;

            if (projectId && clientEmail && privateKey) {
                initializeApp({
                    credential: cert({
                        projectId: projectId,
                        clientEmail: clientEmail,
                        privateKey: privateKey ? privateKey.replace(/\\n/g, '\n') : ''
                    })
                });
                console.log('[APEX] Firebase initialized successfully');
            } else {
                console.warn('[APEX] No Firebase credentials found - running in memory-only mode');
            }
        } catch (error) {
            console.error('[APEX] Firebase init error:', error.message);
        }
    }

    // ============================================================
    // DATABASE REFERENCE
    // ============================================================
    
    let db = null;
    try {
        if (getApps().length > 0) {
            db = getFirestore();
        }
    } catch (error) {
        console.warn('[APEX] Firestore not available - using memory cache');
    }

    // ============================================================
    // CONSTANTS
    // ============================================================
    
    function getConstants() {
        return {
            SCRIPTS_COLLECTION: 'scripts',
            CHALLENGES_COLLECTION: 'challenges',
            RATE_LIMITS_COLLECTION: 'rate_limits',
            BANNED_COLLECTION: 'banned_ips',
            SESSIONS_COLLECTION: 'sessions'
        };
    }

    // ============================================================
    // MEMORY CACHE (fallback khi không có Firebase)
    // ============================================================
    
    const memoryCache = new Map();
    const CACHE_TTL = 5 * 60 * 1000; // 5 phút

    // ============================================================
    // PHANTOM OBFUSCATOR - APEX CUSTOM LAYER
    // ============================================================

    /**
     * Obfuscate code với nhiều lớp bảo vệ
     * @param {string} code - Code gốc
     * @returns {string} Code đã obfuscate
     */
    function phantomObfuscate(code) {
        // Kỹ thuật 1: Tách string thành các fragment ngẫu nhiên
        code = fragmentStrings(code);
        
        // Kỹ thuật 2: Chèn phantom functions (hàm ma - không bao giờ chạy)
        code = injectPhantomFunctions(code);
        
        // Kỹ thuật 3: Mã hóa số bằng biểu thức toán học ngẫu nhiên
        code = encryptNumbers(code);
        
        // Kỹ thuật 4: Wrap code trong time-bomb checker
        code = wrapWithTimeBomb(code);
        
        // Kỹ thuật 5: Thêm anti-debug traps
        code = injectAntiDebug(code);
        
        return code;
    }

    /**
     * Tách string dài thành các fragment và ghép lại runtime
     * "Hello World" → {"He", "llo", " Wo", "rld"} → ghép runtime
     */
    function fragmentStrings(code) {
        return code.replace(/"([^"]+)"/g, (match, str) => {
            if (str.length < 6) return match;
            
            const fragments = [];
            let remaining = str;
            while (remaining.length > 0) {
                const len = Math.floor(Math.random() * 5) + 2;
                fragments.push(remaining.substring(0, len));
                remaining = remaining.substring(len);
            }
            
            const varName = '_s' + Math.random().toString(36).substring(2, 8);
            const parts = fragments.map(f => `"${f}"`).join(',');
            
            return `(function() local ${varName}="" local _p={${parts}} for _i=1,#_p do ${varName}=${varName}.._p[_i] end return ${varName} end)()`;
        });
    }

    /**
     * Chèn các hàm phantom (không bao giờ được gọi) để gây nhiễu
     */
    function injectPhantomFunctions(code) {
        const phantomTemplates = [
            `local _p${randomId()}=function(...) local _a=table.pack(...) local _r=0 for _i=1,_a.n do _r=_r+(_a[_i]or 0)*_i end return _r end`,
            `local _q${randomId()}=function(_x) local _t={} for _i=1,math.abs(_x%20)+1 do _t[_i]=_i*_x%7 end return _t end`,
            `local _v${randomId()}=function(_s) local _h=0 for _i=1,#_s do _h=_h+string.byte(_s,_i)*_i%256 end return _h end`,
            `local _m${randomId()}=function(_a,_b) local _r={} for _i=1,math.max(#_a,#_b) do _r[_i]=(_a[_i]or 0)^(_b[_i]or 1)%100 end return _r end`,
        ];
        
        const lines = code.split('\n');
        const result = [];
        
        for (const line of lines) {
            result.push(line);
            if (line.trim() && Math.random() < 0.15) {
                const phantom = phantomTemplates[Math.floor(Math.random() * phantomTemplates.length)];
                result.push(phantom);
            }
        }
        
        return result.join('\n');
    }

    /**
     * Mã hóa số bằng biểu thức toán học
     * 42 → (7*6) hoặc (50-8) ...
     */
    function encryptNumbers(code) {
        return code.replace(/\b(\d+)\b/g, (match, num) => {
            const n = parseInt(num);
            if (n < 2 || n > 9999) return match;
            if (Math.random() > 0.5) return match;
            
            const templates = [
                () => {
                    const a = Math.floor(Math.random() * n);
                    const b = n - a;
                    const op = Math.random() > 0.5 ? '+' : '-';
                    return op === '+' ? `(${a}+${b})` : `(${a + n}-${a})`;
                },
                () => {
                    const factors = [];
                    for (let i = 2; i <= Math.sqrt(n); i++) {
                        if (n % i === 0) factors.push({ a: i, b: n / i });
                    }
                    if (factors.length > 0) {
                        const f = factors[Math.floor(Math.random() * factors.length)];
                        return `(${f.a}*${f.b})`;
                    }
                    return `(${n - 1}+1)`;
                },
                () => {
                    const x = Math.floor(Math.random() * 20) + 2;
                    return `(${n + x}-${x})`;
                },
                () => {
                    return `math.floor(${n + Math.random() * 0.5})`;
                },
            ];
            
            return templates[Math.floor(Math.random() * templates.length)]();
        });
    }

    /**
     * Wrap code với time-bomb checker
     */
    function wrapWithTimeBomb(code) {
        const seed = Date.now() % 100000;
        const checkVar = '_t' + randomId();
        
        return `
local ${checkVar} = ${seed}
local function _validate()
    local _seed = ${seed}
    local _now = os and os.time and os.time() or 0
    local _check = (_now % 100000) - _seed
    if math.abs(_check) > 86400 then
        return false
    end
    return true
end
if not _validate() then return end
do
${code}
end
${checkVar} = nil _validate = nil`;
    }

    /**
     * Chèn anti-debug traps
     */
    function injectAntiDebug(code) {
        const traps = [
            `if debug and debug.getinfo and debug.getinfo(1) and debug.getinfo(1).short_src:match("hook") then return end`,
            `if rawget and rawget(_G, "hooked") then return end`,
            `local _dbg = nil if debug then _dbg = debug.getregistry and debug.getregistry() end if _dbg and _dbg._HOOKED then return end`,
        ];
        
        const trap = traps[Math.floor(Math.random() * traps.length)];
        return trap + '\n' + code;
    }

    /**
     * Tạo ID ngẫu nhiên ngắn
     */
    function randomId() {
        return Math.random().toString(36).substring(2, 8);
    }

    // ============================================================
    // ENCRYPTED LOADER GENERATOR
    // ============================================================

    /**
     * Tạo loader mã hóa cho executor
     */
    function generateLoader(code) {
        const timestamp = Date.now().toString(36);
        const seed = generateSeed(code);
        const key = deriveKey(seed, timestamp);
        const nonce = generateNonce(12);
        
        const encrypted = encryptWithKey(code, key, nonce);
        const hexData = encrypted.toString('hex');
        
        const loader = buildObfuscatedLoader(hexData, seed, timestamp, nonce);
        
        return loader;
    }

    /**
     * Tạo seed từ code
     */
    function generateSeed(code) {
        let hash = 0;
        for (let i = 0; i < Math.min(code.length, 100); i++) {
            hash = ((hash << 5) - hash) + code.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash).toString(36);
    }

    /**
     * Derive key từ seed và salt
     */
    function deriveKey(seed, salt) {
        let key = '';
        const combined = seed + salt;
        for (let i = 0; i < 16; i++) {
            let charCode = 0;
            for (let j = 0; j < combined.length; j++) {
                charCode = (charCode * 31 + combined.charCodeAt(j) * (i + 1)) % 256;
            }
            key += String.fromCharCode(charCode);
        }
        return key;
    }

    /**
     * Mã hóa code với key và nonce
     */
    function encryptWithKey(code, key, nonce) {
        const bytes = Buffer.from(code, 'utf8');
        const encrypted = Buffer.alloc(bytes.length);
        
        for (let i = 0; i < bytes.length; i++) {
            const k = key.charCodeAt(i % key.length);
            const n = nonce.charCodeAt(i % nonce.length);
            encrypted[i] = (bytes[i] + k + n) % 256;
        }
        
        return encrypted;
    }

    /**
     * Tạo nonce ngẫu nhiên
     */
    function generateNonce(length) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    /**
     * Build loader script với key derivation và giải mã
     */
    function buildObfuscatedLoader(hexData, seed, timestamp, nonce) {
        const out = [];
        
        out.push(`-- APEX HUB Loader v10 (Phantom Edition)`);
        out.push(`-- Multi-layer protection active`);
        out.push(``);
        out.push(`local _seed = "${seed}"`);
        out.push(`local _ts = "${timestamp}"`);
        out.push(`local _nc = "${nonce}"`);
        out.push(`local _hex = "${hexData}"`);
        out.push(``);
        out.push(`local function _dk(s,t)`);
        out.push(`    local k=""`);
        out.push(`    local c=s..t`);
        out.push(`    for i=1,16 do`);
        out.push(`        local v=0`);
        out.push(`        for j=1,#c do`);
        out.push(`            v=(v*31+string.byte(c,j)*i)%256`);
        out.push(`        end`);
        out.push(`        k=k..string.char(v)`);
        out.push(`    end`);
        out.push(`    return k`);
        out.push(`end`);
        out.push(``);
        out.push(`local _key = _dk(_seed, _ts)`);
        out.push(`local _bytes = {}`);
        out.push(`local _idx = 1`);
        out.push(`for _c in _hex:gmatch("..") do`);
        out.push(`    local _b = tonumber(_c, 16)`);
        out.push(`    local _kb = string.byte(_key, (_idx - 1) % #_key + 1)`);
        out.push(`    local _nb = string.byte(_nc, (_idx - 1) % #_nc + 1)`);
        out.push(`    _bytes[_idx] = string.char((_b - _kb - _nb) % 256)`);
        out.push(`    _idx = _idx + 1`);
        out.push(`end`);
        out.push(``);
        out.push(`local _code = table.concat(_bytes)`);
        out.push(`_hex = nil _key = nil _nc = nil _bytes = nil _seed = nil _ts = nil _dk = nil`);
        out.push(``);
        out.push(`local _f, _e = loadstring(_code)`);
        out.push(`if not _f then error("APEX Error: " .. tostring(_e)) end`);
        out.push(`_code = nil`);
        out.push(`_f()`);
        out.push(`_f = nil`);
        out.push(`collectgarbage("collect")`);
        
        return out.join('\n');
    }

    // ============================================================
    // DATABASE HELPERS
    // ============================================================

    /**
     * Lấy script từ cache hoặc database
     */
    async function getScript(name) {
        // Kiểm tra memory cache trước
        const cached = memoryCache.get(name);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            return cached.data;
        }
        
        // Nếu có Firebase, lấy từ Firestore
        if (db) {
            try {
                const { SCRIPTS_COLLECTION } = getConstants();
                const doc = await db.collection(SCRIPTS_COLLECTION).doc(name).get();
                if (!doc.exists) return null;
                
                const data = doc.data();
                
                // Cập nhật lastAccessed trong background
                doc.ref.update({ lastAccessed: Date.now() }).catch(() => {});
                
                // Lưu vào cache
                memoryCache.set(name, { data: data, timestamp: Date.now() });
                
                return data;
            } catch (error) {
                console.error(`[APEX] Error fetching script ${name}:`, error.message);
                // Fallback: trả cached data nếu có
                if (cached) return cached.data;
                return null;
            }
        }
        
        // Không có Firebase, dùng memory cache
        if (cached) return cached.data;
        return null;
    }

    /**
     * Lưu script vào database hoặc cache
     */
    async function saveScript(name, data) {
        if (db) {
            try {
                const { SCRIPTS_COLLECTION } = getConstants();
                await db.collection(SCRIPTS_COLLECTION).doc(name).set({
                    ...data,
                    updatedAt: Date.now()
                }, { merge: true });
                
                // Cập nhật cache
                memoryCache.delete(name);
                return true;
            } catch (error) {
                console.error(`[APEX] Error saving script ${name}:`, error.message);
                // Fallback: lưu vào memory
                memoryCache.set(name, { data: data, timestamp: Date.now() });
                return false;
            }
        }
        
        // Lưu vào memory cache
        memoryCache.set(name, { data: data, timestamp: Date.now() });
        return true;
    }

    /**
     * Xóa script
     */
    async function deleteScript(name) {
        if (db) {
            try {
                const { SCRIPTS_COLLECTION } = getConstants();
                await db.collection(SCRIPTS_COLLECTION).doc(name).delete();
                memoryCache.delete(name);
                return true;
            } catch (error) {
                console.error(`[APEX] Error deleting script ${name}:`, error.message);
                memoryCache.delete(name);
                return false;
            }
        }
        
        memoryCache.delete(name);
        return true;
    }

    /**
     * Chuẩn hóa tên script
     */
    function normalizeName(name) {
        return name.trim().toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '') || 'script';
    }

    /**
     * Phát hiện loại script (Luau hay Lua)
     */
    function detectTarget(code) {
        if (code.match(/\bgame\s*:\s*GetService\s*\(/) ||
            code.match(/\bInstance\.new\s*\(/) ||
            code.match(/\btask\.(spawn|wait|defer)\s*\(/) ||
            code.match(/\bworkspace\b/) ||
            code.match(/--!/)) {
            return 'luau';
        }
        return 'lua';
    }

    // ============================================================
    // HANDLERS
    // ============================================================

    /**
     * Xử lý GET request - Lấy script
     * YÊU CẦU ACCESS TOKEN (không còn bypass)
     */
    async function handleGet(req, res) {
        const { name, accessToken, nonce, hwid } = req.query;
        const ua = (req.headers['user-agent'] || '').toLowerCase();
        const clientIP = Security.getClientIP(req);
        
        // Lấy access token từ header hoặc query
        const effectiveToken = accessToken || req.headers['x-access-token'] || '';

        // Kiểm tra IP ban
        if (Security.isIPBanned(clientIP)) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.status(403).send(getBannedPage());
        }

        // Kiểm tra rate limit
        const rateCheck = Security.checkRateLimit(`raw:${clientIP}`, 10, 60000);
        if (!rateCheck.allowed) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.status(429).send(getRateLimitPage());
        }

        // Risk scoring
        const risk = Security.calculateRiskScore(req);
        if (risk.score >= 50) {
            Security.addStrike(clientIP, `High risk GET: ${risk.reasons.join(', ')}`);
            
            const isBrowser = ua.includes('mozilla') || ua.includes('chrome') ||
                              ua.includes('safari') || ua.includes('firefox');
            if (isBrowser) {
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                return res.send(getProtectionPage());
            }
            return res.status(403).json({
                error: 'Access denied',
                risk: risk.level
            });
        }

        // Nếu không có name, hiển thị welcome page
        if (!name) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.send(getWelcomePage());
        }

        // Nếu không có access token, yêu cầu challenge
        if (!effectiveToken) {
            const challenge = Security.generateChallenge();
            return res.json({
                protected: true,
                requireChallenge: true,
                challenge: {
                    question: challenge.question,
                    token: challenge.token,
                    type: challenge.type,
                    expiresIn: 45
                },
                message: 'Access token required. Solve challenge to get one.'
            });
        }

        // Xác thực access token
        const tokenValidation = Security.validateAccessToken(effectiveToken, hwid, nonce);
        if (!tokenValidation.valid) {
            Security.addStrike(clientIP, `Invalid token: ${tokenValidation.error}`);
            return res.status(403).json({
                success: false,
                error: tokenValidation.error,
                requireChallenge: true
            });
        }

        // Lấy script
        const scriptData = await getScript(name);
        if (!scriptData) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.status(404).send(getErrorPage(name));
        }

        // Kiểm tra nếu là executor (trả loader)
        const executorPatterns = [
            'roblox', 'synapse', 'krnl', 'script-ware', 'sentinel',
            'fluxus', 'electron', 'comet', 'oxygen', 'valyse',
            'hydrogen', 'codex', 'vega', 'trigon', 'nexus',
            'solara', 'jjsploit', 'celestial', 'evon', 'aris'
        ];
        const isExecutor = executorPatterns.some(p => ua.includes(p));

        if (isExecutor) {
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
            return res.send(generateLoader(scriptData.code));
        }

        // Fallback: trả encrypted
        const encryptKey = Crypto.generateRandomString(32);
        const encrypted = Crypto.encrypt(scriptData.code, encryptKey);
        
        return res.json({
            success: true,
            name: name,
            payload: encrypted.data,
            iv: encrypted.iv,
            decryptKey: encryptKey,
            checksum: encrypted.checksum,
            timestamp: Date.now()
        });
    }

    /**
     * Xử lý POST request - Tạo script mới
     */
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

            // Áp dụng Phantom Obfuscator
            console.log(`[APEX] Applying Phantom obfuscation to: ${fullName}`);
            const obfuscatedCode = phantomObfuscate(code);

            // Kiểm tra script đã tồn tại
            const existingScript = await getScript(fullName);
            if (existingScript) {
                // Tạo tên mới với timestamp
                const newName = fullName + '_' + Date.now().toString(36);
                await saveScript(newName, {
                    code: obfuscatedCode,
                    originalCode: code,
                    name: name.trim(),
                    created: Date.now(),
                    lastAccessed: Date.now(),
                    owner: userId,
                    target: detectTarget(code),
                    obfuscated: true
                });
                
                const rawUrl = `https://${req.headers.host}/api/raw?name=${newName}`;
                return res.status(200).json({
                    success: true,
                    raw: rawUrl,
                    name: newName,
                    existed: true,
                    message: 'Script already existed, created with new name'
                });
            }

            // Lưu script mới
            await saveScript(fullName, {
                code: obfuscatedCode,
                originalCode: code,
                name: name.trim(),
                created: Date.now(),
                lastAccessed: Date.now(),
                owner: userId,
                target: detectTarget(code),
                obfuscated: true
            });

            const rawUrl = `https://${req.headers.host}/api/raw?name=${fullName}`;
            return res.status(200).json({
                success: true,
                raw: rawUrl,
                name: fullName,
                message: 'Script created successfully'
            });
        } catch (error) {
            console.error('[APEX] Create error:', error);
            return res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Xử lý PUT request - Cập nhật script
     */
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
            
            // Kiểm tra quyền sở hữu
            if (uid && scriptData.owner && scriptData.owner !== uid && scriptData.owner !== 'public') {
                return res.status(403).json({ success: false, error: 'Not your script' });
            }

            // Cập nhật với obfuscation
            scriptData.code = phantomObfuscate(code);
            scriptData.originalCode = code;
            scriptData.updated = Date.now();
            scriptData.lastAccessed = Date.now();
            scriptData.target = detectTarget(code);

            await saveScript(name, scriptData);
            
            return res.status(200).json({
                success: true,
                message: 'Updated successfully',
                name: name
            });
        } catch (error) {
            console.error('[APEX] Update error:', error);
            return res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Xử lý DELETE request - Xóa script
     */
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
            
            // Kiểm tra quyền sở hữu
            if (uid && scriptData.owner && scriptData.owner !== uid && scriptData.owner !== 'public') {
                return res.status(403).json({ success: false, error: 'Not your script' });
            }
            
            await deleteScript(name);
            
            return res.status(200).json({
                success: true,
                message: 'Deleted successfully'
            });
        } catch (error) {
            console.error('[APEX] Delete error:', error);
            return res.status(500).json({ success: false, error: error.message });
        }
    }

    // ============================================================
    // UI PAGES
    // ============================================================

    function getProtectionPage() {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>APEX HUB | Security Gateway</title>
    <style>
        :root {
            --bg: #070708;
            --card: rgba(18, 18, 21, 0.72);
            --border: rgba(255, 255, 255, 0.07);
            --t1: #f5f5f5;
            --t2: #8b8b93;
            --t3: #505057;
        }
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: 'Inter', system-ui, sans-serif;
            background: var(--bg);
            color: var(--t1);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
        }
        .card {
            background: var(--card);
            backdrop-filter: blur(36px);
            border-radius: 18px;
            padding: 56px 52px;
            border: 1px solid var(--border);
            max-width: 560px;
            width: 90%;
            text-align: center;
            box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
            animation: fadeIn 0.7s cubic-bezier(0.22, 1, 0.36, 1);
        }
        @keyframes fadeIn {
            from {
                opacity: 0;
                transform: translateY(24px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        .logo {
            font-size: 26px;
            font-weight: 600;
            letter-spacing: -0.03em;
            margin-bottom: 6px;
        }
        .sub {
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.18em;
            color: #66666d;
            margin-bottom: 36px;
        }
        .sep {
            width: 100%;
            height: 1px;
            background: var(--border);
            margin: 24px 0;
        }
        .title {
            font-size: 22px;
            font-weight: 600;
            margin-bottom: 12px;
        }
        .desc {
            font-size: 14px;
            color: var(--t2);
            line-height: 1.7;
            margin-bottom: 32px;
        }
        .status {
            background: rgba(255, 255, 255, 0.015);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 20px 24px;
            text-align: left;
            margin-bottom: 28px;
        }
        .row {
            display: flex;
            justify-content: space-between;
            padding: 6px 0;
            font-size: 11px;
        }
        .label {
            color: var(--t3);
            text-transform: uppercase;
            font-size: 10px;
        }
        .value {
            font-family: monospace;
            color: var(--t2);
        }
        .btn {
            display: inline-flex;
            align-items: center;
            gap: 10px;
            padding: 15px 28px;
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid var(--border);
            border-radius: 10px;
            color: var(--t1);
            text-decoration: none;
            font-size: 14px;
            transition: all 0.3s;
        }
        .btn:hover {
            background: rgba(255, 255, 255, 0.05);
            border-color: rgba(255, 255, 255, 0.14);
        }
        .footer {
            margin-top: 28px;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            color: var(--t3);
        }
        @media (max-width: 600px) {
            .card {
                padding: 40px 24px;
            }
            .title {
                font-size: 19px;
            }
        }
    </style>
</head>
<body>
    <div class="card">
        <div class="logo">APEX HUB</div>
        <div class="sub">Security Gateway</div>
        <div class="sep"></div>
        <div class="title">Restricted endpoint.</div>
        <p class="desc">Access to this resource is limited to authorized clients. Requests from standard browsers are not permitted.</p>
        <div class="status">
            <div class="row">
                <span class="label">Status</span>
                <span class="value">ACTIVE</span>
            </div>
            <div class="row">
                <span class="label">Transport</span>
                <span class="value">ENCRYPTED</span>
            </div>
            <div class="row">
                <span class="label">Access</span>
                <span class="value">RESTRICTED</span>
            </div>
            <div class="row">
                <span class="label">Gateway</span>
                <span class="value">V10 PHANTOM</span>
            </div>
        </div>
        <a href="https://apexhubeditor.vercel.app/" class="btn">Open APEX HUB &rarr;</a>
        <div class="footer">APEX HUB / Security Infrastructure</div>
    </div>
</body>
</html>`;
    }

    function getWelcomePage() {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>APEX HUB | API Gateway</title>
    <style>
        :root {
            --bg: #070708;
            --card: rgba(18, 18, 21, 0.72);
            --border: rgba(255, 255, 255, 0.07);
            --t1: #f5f5f5;
            --t2: #8b8b93;
            --t3: #505057;
        }
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: 'Inter', system-ui, sans-serif;
            background: var(--bg);
            color: var(--t1);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
        }
        .card {
            background: var(--card);
            backdrop-filter: blur(36px);
            border-radius: 18px;
            padding: 52px 48px;
            border: 1px solid var(--border);
            max-width: 560px;
            width: 90%;
            text-align: center;
            box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
        }
        .brand {
            font-size: 28px;
            font-weight: 600;
            letter-spacing: -0.03em;
        }
        .sub {
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.18em;
            color: #66666d;
            margin: 6px 0 32px;
        }
        .desc {
            font-size: 14px;
            color: var(--t2);
            margin-bottom: 32px;
        }
        .sep {
            height: 1px;
            background: var(--border);
            margin-bottom: 28px;
        }
        .ep {
            display: flex;
            align-items: center;
            gap: 14px;
            padding: 12px 16px;
            font-size: 13px;
            font-family: monospace;
            border-radius: 8px;
            transition: 0.2s;
        }
        .ep:hover {
            background: rgba(255, 255, 255, 0.02);
        }
        .method {
            font-size: 10px;
            text-transform: uppercase;
            padding: 4px 10px;
            border-radius: 6px;
            min-width: 50px;
            text-align: center;
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.05);
            color: var(--t2);
        }
        .footer {
            margin-top: 32px;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            color: var(--t3);
        }
    </style>
</head>
<body>
    <div class="card">
        <h1 class="brand">APEX HUB</h1>
        <div class="sub">API Gateway</div>
        <p class="desc">Production infrastructure for secure script delivery and API access.</p>
        <div class="sep"></div>
        <div class="ep"><span class="method">POST</span>/api/raw</div>
        <div class="ep"><span class="method">PUT</span>/api/raw</div>
        <div class="ep"><span class="method">GET</span>/api/raw?name=script</div>
        <div class="ep"><span class="method">DEL</span>/api/raw?name=script</div>
        <div class="footer">APEX HUB &middot; API Infrastructure &middot; V10</div>
    </div>
</body>
</html>`;
    }

    function getErrorPage(name) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>404 | APEX HUB</title>
    <style>
        :root {
            --bg: #070708;
            --card: rgba(18, 18, 21, 0.72);
            --border: rgba(255, 255, 255, 0.07);
            --t1: #f5f5f5;
            --t2: #8b8b93;
        }
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: 'Inter', system-ui, sans-serif;
            background: var(--bg);
            color: var(--t1);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
        }
        .card {
            background: var(--card);
            border-radius: 18px;
            padding: 52px 48px;
            border: 1px solid var(--border);
            text-align: center;
            max-width: 480px;
            width: 90%;
            box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
        }
        .code {
            font-size: 5rem;
            font-family: monospace;
            color: var(--t2);
            margin-bottom: 8px;
        }
        .title {
            font-size: 16px;
            font-weight: 500;
            margin-bottom: 12px;
        }
        .msg {
            font-size: 14px;
            color: var(--t2);
            margin-bottom: 20px;
        }
        .ref {
            display: inline-block;
            padding: 8px 18px;
            background: rgba(255, 255, 255, 0.02);
            border: 1px solid var(--border);
            border-radius: 8px;
            font-family: monospace;
            font-size: 12px;
            color: var(--t2);
        }
        a {
            display: inline-block;
            margin-top: 20px;
            color: var(--t2);
            text-decoration: none;
            font-size: 13px;
        }
        a:hover {
            color: var(--t1);
        }
    </style>
</head>
<body>
    <div class="card">
        <div class="code">404</div>
        <div class="title">Resource not found</div>
        <p class="msg">The requested script could not be located.</p>
        <div class="ref">${Security.getClientIP ? name : (name || 'unknown')}</div>
        <br>
        <a href="https://apexhubeditor.vercel.app/">&larr; Return to Gateway</a>
    </div>
</body>
</html>`;
    }

    function getBannedPage() {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Access Denied | APEX HUB</title>
    <style>
        :root {
            --bg: #070708;
            --card: rgba(18, 18, 21, 0.72);
            --border: rgba(255, 255, 255, 0.07);
            --t1: #f5f5f5;
            --t2: #8b8b93;
            --t3: #505057;
        }
        * {
            margin: 0;
            padding: 0;
        }
        body {
            font-family: 'Inter', system-ui, sans-serif;
            background: var(--bg);
            color: var(--t1);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
        }
        .card {
            background: var(--card);
            border-radius: 18px;
            padding: 52px 48px;
            border: 1px solid var(--border);
            text-align: center;
            max-width: 480px;
            width: 90%;
        }
        .icon {
            width: 48px;
            height: 48px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 24px;
            color: var(--t2);
        }
        .title {
            font-size: 16px;
            margin-bottom: 12px;
        }
        .msg {
            font-size: 14px;
            color: var(--t2);
            margin-bottom: 24px;
        }
        .panel {
            background: rgba(255, 255, 255, 0.015);
            border: 1px solid var(--border);
            border-radius: 10px;
            padding: 16px 20px;
            text-align: left;
        }
        .row {
            display: flex;
            justify-content: space-between;
            padding: 4px 0;
            font-size: 11px;
        }
        .lbl {
            font-size: 10px;
            text-transform: uppercase;
            color: var(--t3);
        }
        .val {
            font-family: monospace;
            color: var(--t2);
        }
        .ft {
            margin-top: 24px;
            font-size: 10px;
            text-transform: uppercase;
            color: var(--t3);
        }
    </style>
</head>
<body>
    <div class="card">
        <div class="icon">&mdash;</div>
        <div class="title">Access Denied</div>
        <p class="msg">This request has been temporarily blocked by the APEX security gateway.</p>
        <div class="panel">
            <div class="row">
                <span class="lbl">Event</span>
                <span class="val">ACCESS POLICY VIOLATION</span>
            </div>
            <div class="row">
                <span class="lbl">Status</span>
                <span class="val">TEMPORARILY BLOCKED</span>
            </div>
        </div>
        <div class="ft">APEX HUB &middot; Security Infrastructure</div>
    </div>
</body>
</html>`;
    }

    function getRateLimitPage() {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Rate Limited | APEX HUB</title>
    <style>
        :root {
            --bg: #070708;
            --card: rgba(18, 18, 21, 0.72);
            --border: rgba(255, 255, 255, 0.07);
            --t1: #f5f5f5;
            --t2: #8b8b93;
            --t3: #505057;
        }
        * {
            margin: 0;
            padding: 0;
        }
        body {
            font-family: 'Inter', system-ui, sans-serif;
            background: var(--bg);
            color: var(--t1);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
        }
        .card {
            background: var(--card);
            border-radius: 18px;
            padding: 52px 48px;
            border: 1px solid var(--border);
            text-align: center;
            max-width: 480px;
            width: 90%;
        }
        .icon {
            width: 48px;
            height: 48px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 24px;
            color: var(--t2);
        }
        .title {
            font-size: 16px;
            margin-bottom: 12px;
        }
        .msg {
            font-size: 14px;
            color: var(--t2);
            margin-bottom: 20px;
        }
        .bar {
            width: 100%;
            height: 1px;
            background: rgba(255, 255, 255, 0.06);
            margin-bottom: 24px;
        }
        .fill {
            width: 100%;
            height: 100%;
            background: rgba(255, 255, 255, 0.15);
            animation: progress 60s linear;
        }
        @keyframes progress {
            from {
                transform: scaleX(0);
            }
            to {
                transform: scaleX(1);
            }
        }
        .panel {
            background: rgba(255, 255, 255, 0.015);
            border: 1px solid var(--border);
            border-radius: 10px;
            padding: 16px 20px;
            text-align: left;
        }
        .row {
            display: flex;
            justify-content: space-between;
            padding: 4px 0;
            font-size: 11px;
        }
        .lbl {
            font-size: 10px;
            text-transform: uppercase;
            color: var(--t3);
        }
        .val {
            font-family: monospace;
            color: var(--t2);
        }
        .ft {
            margin-top: 24px;
            font-size: 10px;
            text-transform: uppercase;
            color: var(--t3);
        }
    </style>
</head>
<body>
    <div class="card">
        <div class="icon">&mdash;</div>
        <div class="title">Request Throttled</div>
        <p class="msg">Too many requests from this client.</p>
        <div class="bar">
            <div class="fill"></div>
        </div>
        <div class="panel">
            <div class="row">
                <span class="lbl">Policy</span>
                <span class="val">RATE LIMIT</span>
            </div>
            <div class="row">
                <span class="lbl">Status</span>
                <span class="val">THROTTLED</span>
            </div>
            <div class="row">
                <span class="lbl">Retry</span>
                <span class="val">AUTOMATIC</span>
            </div>
        </div>
        <div class="ft">APEX HUB &middot; Security Infrastructure</div>
    </div>
</body>
</html>`;
    }

    // ============================================================
    // MAIN HANDLER - EXPORT
    // ============================================================

    return async function handler(req, res) {
        // CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Access-Token, X-Nonce, X-HWID, X-Challenge-Token, X-Challenge-Answer, X-Auth-Key');
        
        // Security headers
        Security.setSecurityHeaders(res);

        // Handle OPTIONS preflight
        if (req.method === 'OPTIONS') {
            return res.status(200).end();
        }

        try {
            // Route requests
            switch (req.method) {
                case 'GET':
                    return await handleGet(req, res);
                case 'POST':
                    return await handleCreate(req, res);
                case 'PUT':
                    return await handleUpdate(req, res);
                case 'DELETE':
                    return await handleDelete(req, res);
                default:
                    return res.status(405).json({ error: 'Method not allowed' });
            }
        } catch (error) {
            console.error('[APEX] Handler error:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: process.env.NODE_ENV === 'development' ? error.message : 'An error occurred'
            });
        }
    };
})();
