// api/raw.js
import Crypto from '../lib/crypto.js';
import Security, { S } from '../lib/security.js';

export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Access-Token, X-Nonce');
    Security.setHeaders(res);

    if (req.method === 'OPTIONS') return res.status(200).end();

    const ip = Security.getIP(req);

    // Rate limit
    if (!Security.rateLimit(ip, 20, 60000)) {
        return res.status(429).json({ error: 'Rate limited' });
    }

    // ============================================================
    // GET - Lấy script
    // ============================================================
    if (req.method === 'GET') {
        const { name, accessToken, nonce } = req.query;
        const ua = (req.headers['user-agent'] || '').toLowerCase();

        // No name -> welcome
        if (!name) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>APEX HUB</title><style>body{font-family:system-ui;background:#070708;color:#f5f5f5;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0}.card{background:rgba(18,18,21,0.9);border-radius:18px;padding:52px;border:1px solid rgba(255,255,255,0.07);text-align:center}.logo{font-size:28px;font-weight:600}.sub{font-size:11px;color:#666;margin:8px 0 32px;text-transform:uppercase;letter-spacing:0.2em}.endpoints{text-align:left;font-family:monospace;font-size:13px;color:#8b8b93}.ep{padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.03)}.method{color:#505057;font-size:10px;text-transform:uppercase;margin-right:12px}</style></head><body><div class="card"><div class="logo">APEX HUB</div><div class="sub">API Gateway v10</div><div class="endpoints"><div class="ep"><span class="method">POST</span>/api/raw - Create script</div><div class="ep"><span class="method">GET</span>/api/raw?name=X - Get script</div><div class="ep"><span class="method">GET</span>/api/challenge - Get challenge</div><div class="ep"><span class="method">POST</span>/api/challenge - Solve challenge</div></div></div></body></html>`);
        }

        // No access token -> require challenge
        if (!accessToken) {
            const isBrowser = ua.includes('mozilla') || ua.includes('chrome') || ua.includes('safari') || ua.includes('firefox');
            if (isBrowser) {
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                return res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>APEX HUB</title><style>body{font-family:system-ui;background:#070708;color:#f5f5f5;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0}.card{background:rgba(18,18,21,0.9);border-radius:18px;padding:52px;border:1px solid rgba(255,255,255,0.07);text-align:center;max-width:500px}.logo{font-size:24px;font-weight:600}.sub{font-size:11px;color:#666;margin:8px 0 32px;text-transform:uppercase;letter-spacing:0.2em}.msg{color:#8b8b93;font-size:14px;line-height:1.6}.status{margin-top:24px;padding:16px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:10px;text-align:left;font-size:11px;font-family:monospace;color:#505057}.row{display:flex;justify-content:space-between;padding:4px 0}.val{color:#8b8b93}</style></head><body><div class="card"><div class="logo">APEX HUB</div><div class="sub">Security Gateway</div><p class="msg">This endpoint requires authentication.<br>Browser access is not permitted.</p><div class="status"><div class="row"><span>Status</span><span class="val">ACTIVE</span></div><div class="row"><span>Access</span><span class="val">RESTRICTED</span></div><div class="row"><span>Gateway</span><span class="val">V10 PHANTOM</span></div></div></div></body></html>`);
            }
            // API client -> return challenge
            const challenge = Security.genChallenge();
            return res.json({
                protected: true,
                challenge: {
                    question: challenge.q,
                    token: challenge.token,
                    type: 'math',
                    expiresIn: 45
                }
            });
        }

        // Validate token
        if (!Security.checkAccessToken(accessToken, nonce)) {
            return res.status(403).json({ error: 'Invalid or expired token', requireChallenge: true });
        }

        // Get script
        const script = S.scripts.get(name);
        if (!script) {
            return res.status(404).json({ error: 'Script not found', name });
        }

        // Executor detection -> trả loader
        const executors = ['roblox', 'synapse', 'krnl', 'script-ware', 'sentinel', 'fluxus', 'electron', 'comet', 'oxygen', 'valyse', 'hydrogen', 'codex', 'vega', 'trigon', 'nexus', 'solara', 'jjsploit', 'celestial', 'evon', 'aris'];
        const isExecutor = executors.some(e => ua.includes(e));

        if (isExecutor) {
            // Tạo loader đơn giản cho executor
            const key = Crypto.randomStr(16);
            const bytes = Buffer.from(script.code, 'utf8');
            const enc = [];
            for (let i = 0; i < bytes.length; i++) {
                enc.push((bytes[i] + key.charCodeAt(i % key.length)) % 256);
            }
            const hex = Buffer.from(enc).toString('hex');

            const loader = `-- APEX HUB Loader v10
local key="${key}"
local hex="${hex}"
local bytes={}
local idx=1
for c in hex:gmatch("..") do
    local b=tonumber(c,16)
    local kb=string.byte(key,(idx-1)%#key+1)
    bytes[idx]=string.char((b-kb)%256)
    idx=idx+1
end
local code=table.concat(bytes)
hex=nil key=nil bytes=nil
local f,e=loadstring(code)
if not f then error("APEX: "..tostring(e)) end
code=nil
f()
f=nil
collectgarbage("collect")`;

            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            return res.send(loader);
        }

        // Default: return encrypted
        const encKey = Crypto.randomStr(32);
        const encrypted = Crypto.encrypt(script.code, encKey);
        return res.json({
            success: true,
            name,
            payload: encrypted.data,
            iv: encrypted.iv,
            decryptKey: encKey,
            checksum: encrypted.checksum
        });
    }

    // ============================================================
    // POST - Tạo script
    // ============================================================
    if (req.method === 'POST') {
        try {
            const { code, name } = req.body || {};
            if (!code || !name) {
                return res.status(400).json({ success: false, error: 'Code and name required' });
            }

            const slug = String(name).trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'script';
            
            // Obfuscate nhẹ
            let obfuscated = code;
            // Chống debug cơ bản
            obfuscated = 'if debug and debug.getinfo and debug.getinfo(1) and debug.getinfo(1).short_src:match("hook") then return end\n' + obfuscated;
            // Mã hóa string dài
            obfuscated = obfuscated.replace(/"([^"]{8,})"/g, (match, str) => {
                const parts = [];
                let remaining = str;
                while (remaining.length > 0) {
                    const len = Math.floor(Math.random() * 4) + 3;
                    parts.push('"' + remaining.slice(0, len) + '"');
                    remaining = remaining.slice(len);
                }
                const v = '_s' + Math.random().toString(36).slice(2, 6);
                return '(function() local ' + v + '="" for _,p in ipairs({' + parts.join(',') + '}) do ' + v + '=' + v + '..p end return ' + v + ' end)()';
            });

            S.scripts.set(slug, {
                code: obfuscated,
                original: code,
                name: String(name).trim(),
                created: Date.now()
            });

            const rawUrl = 'https://' + req.headers.host + '/api/raw?name=' + slug;
            return res.json({ success: true, raw: rawUrl, name: slug });
        } catch (error) {
            return res.status(500).json({ success: false, error: error.message });
        }
    }

    // ============================================================
    // DELETE - Xóa script
    // ============================================================
    if (req.method === 'DELETE') {
        const { name } = req.query;
        if (!name) return res.status(400).json({ error: 'Name required' });
        S.scripts.delete(name);
        return res.json({ success: true, message: 'Deleted' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
