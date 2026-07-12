// api/load.js
import Crypto from '../lib/crypto.js';
import Security from '../lib/security.js';

global.challenges = global.challenges || {};

export default function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Challenge-Token, X-Challenge-Answer');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const host = req.headers.host;
    const clientIP = Security.getClientIP(req);
    const ua = (req.headers['user-agent'] || '').toLowerCase();
    const acceptHeader = (req.headers['accept'] || '').toLowerCase();

    if (Security.isIPBanned(clientIP)) {
        return res.status(403).json({ error: 'IP banned' });
    }

    if (!Security.checkRateLimit(clientIP, 60, 60000)) {
        Security.banIP(clientIP, 300000);
        return res.status(429).json({ error: 'Rate limit exceeded' });
    }

    const isBrowser = ua.includes('mozilla') || ua.includes('chrome') || 
                      ua.includes('safari') || ua.includes('firefox');
    const wantsHTML = acceptHeader.includes('text/html') || !acceptHeader;

    if (isBrowser && wantsHTML) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(getProtectionHTML(host));
    }

    const challengeToken = req.headers['x-challenge-token'] || req.query['challenge-token'];
    const challengeAnswer = req.headers['x-challenge-answer'] || req.query['challenge-answer'];

    if (!challengeToken || !challengeAnswer) {
        const challenge = Security.generateChallenge();
        
        global.challenges[challenge.token] = {
            ...challenge,
            createdAt: Date.now(),
            used: false,
            attempts: 0,
            maxAttempts: 3
        };
        
        return res.json({
            requireChallenge: true,
            challenge: {
                question: challenge.question,
                token: challenge.token,
                type: challenge.type,
                expiresIn: 60
            }
        });
    }

    const challenge = global.challenges[challengeToken];
    
    if (!challenge || challenge.used) {
        return res.status(403).json({ error: 'Invalid challenge' });
    }
    
    if (Date.now() - challenge.createdAt > 60000) {
        delete global.challenges[challengeToken];
        return res.status(403).json({ error: 'Challenge expired' });
    }
    
    challenge.attempts++;
    
    if (challengeAnswer.toString().trim().toUpperCase() !== challenge.answer.toString().trim().toUpperCase()) {
        if (challenge.attempts >= challenge.maxAttempts) {
            challenge.used = true;
            Security.banIP(clientIP, 300000);
            return res.status(403).json({ error: 'Max attempts reached', locked: true });
        }
        return res.status(403).json({ error: 'Wrong answer', attemptsLeft: challenge.maxAttempts - challenge.attempts });
    }
    
    challenge.used = true;

    const loaderKey = Crypto.generateKey();
    const loaderCode = generateLoaderCode(host);
    const encryptedLoader = Crypto.encrypt(loaderCode, loaderKey.key);

    return res.json({
        success: true,
        payload: encryptedLoader.data,
        key: loaderKey.key,
        checksum: encryptedLoader.checksum,
        version: '3.0.0',
        timestamp: Date.now()
    });
}

function generateLoaderCode(host) {
    return `
--[[
    APEX HUB Loader v3.0
    Protected System
]]--

local HttpService = game:GetService("HttpService")
local BASE_URL = "https://${host}"
local VERSION = "3.0.0"

local function AntiDebug()
    pcall(function()
        if debug and debug.getinfo then
            local info = debug.getinfo(1, "S")
            if info and info.source and #info.source > 0 then
                error("Debugger detected")
            end
        end
        if hookfunction then error("Hook detected") end
    end)
end

local function ProtectMemory()
    local dangerous = {"writefile", "readfile", "appendfile", "listfiles", "loadfile", "dofile", "decompile", "dumpstring"}
    for _, fn in ipairs(dangerous) do
        pcall(function() if _G[fn] then _G[fn] = function() return nil end end end)
    end
end

local function Decrypt(data, key)
    local decoded = HttpService:JSONDecode(data)
    local result = {}
    for i = 1, #decoded do
        local byte = decoded[i]
        local keyByte = string.byte(key, (i - 1) % #key + 1)
        result[i] = string.char(bit32.bxor(byte, keyByte))
    end
    return table.concat(result)
end

local function Main()
    AntiDebug()
    ProtectMemory()
    
    local key = ""
    pcall(function() if getclipboard then key = getclipboard() end end)
    
    if key == "" then
        error("No key found")
    end
    
    local hwid = HttpService:JSONEncode({hwid = game:GetService("RbxAnalyticsService"):GetClientId()})
    local authResponse = HttpService:PostAsync(BASE_URL .. "/api/auth", HttpService:JSONEncode({
        key = key, hwid = hwid, version = VERSION
    }), Enum.HttpContentType.ApplicationJson, false)
    
    local authData = HttpService:JSONDecode(authResponse)
    if not authData.success then error("Auth failed") end
    
    key = nil
    
    local scriptResponse = HttpService:PostAsync(BASE_URL .. "/api/get-script", HttpService:JSONEncode({
        sessionToken = authData.sessionToken
    }), Enum.HttpContentType.ApplicationJson, false)
    
    local scriptData = HttpService:JSONDecode(scriptResponse)
    if not scriptData.success then error("Script load failed") end
    
    local decrypted = Decrypt(scriptData.payload, scriptData.decryptKey)
    local func = loadstring(decrypted)
    decrypted = nil
    collectgarbage("collect")
    
    if func then func() end
end

pcall(Main)
`;
}

function getProtectionHTML(host) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>APEX HUB | Protected</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: system-ui, sans-serif;
            background: #0a0a1a;
            color: #e0e0ff;
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
        }
        .card {
            background: rgba(21,21,48,0.9);
            border-radius: 24px;
            padding: 48px 40px;
            border: 1px solid rgba(255,71,87,0.15);
            text-align: center;
            animation: fadeIn 0.6s ease;
        }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        h1 {
            font-size: 2rem;
            background: linear-gradient(135deg, #ff6b81, #ff4757);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 16px;
        }
        p { color: #666; margin-bottom: 24px; }
        .url {
            font-family: monospace;
            color: #888;
            background: rgba(0,0,0,0.3);
            padding: 12px;
            border-radius: 8px;
            word-break: break-all;
        }
    </style>
</head>
<body>
    <div class="card">
        <h1>🔒 PROTECTED SYSTEM</h1>
        <p>This endpoint is for Roblox Executor only.</p>
        <div class="url">${host}/api/load</div>
    </div>
</body>
</html>`;
}
