// api/load.js - Endpoint cho Roblox Executor (không challenge)
// Dùng: loadstring(game:HttpGet("https://domain.vercel.app/api/load?name=SCRIPT_NAME"))()

import Crypto from '../lib/crypto.js';
import Security from '../lib/security.js';
import { RateLimiter } from '../lib/rate-limit.js';
import { ScriptManager } from '../lib/scripts.js';

export default async function handler(req, res) {
    // Cho phép mọi origin (Roblox HttpService cần *)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method !== 'GET') {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.send('-- APEX HUB: Only GET method allowed');
    }
    
    const clientIP = Security.getClientIP(req);
    const ipHash = Crypto.hashIP(clientIP);
    const userAgent = (req.headers['user-agent'] || '').toLowerCase();
    
    try {
        // Rate limit: 30 requests/phút/IP
        const allowed = await RateLimiter.checkLimit('ip', clientIP, 'default');
        if (!allowed) {
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            return res.send('-- APEX HUB: Rate limited. Wait 60 seconds.\nreturn warn("Rate limited. Try again later.")');
        }
        
        const { name } = req.query;
        
        // Không có tên script
        if (!name) {
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            return res.send('-- APEX HUB: Script name required\n-- Usage: /api/load?name=SCRIPT_NAME\nreturn warn("Missing script name")');
        }
        
        // Lấy script từ database
        const script = await ScriptManager.getScript(name);
        
        // Script không tồn tại
        if (!script) {
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            return res.send('-- APEX HUB: Script not found: ' + name + '\nreturn warn("Script not found: ' + name + '")');
        }
        
        // Trả code Lua trực tiếp
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.send(script.code);
        
    } catch (error) {
        console.error('[LOAD] Error:', error.message);
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.send('-- APEX HUB: Internal error\nreturn warn("Server error. Try again.")');
    }
}
