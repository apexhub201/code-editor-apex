// api/load.js - Phiên bản tối giản cho Roblox Executor
export default async function handler(req, res) {
    // Cho phép tất cả
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    // Lấy tên script từ query
    const { name } = req.query;
    
    // Trả code Lua test
    const code = `print("APEX HUB V10 - OK! Script: ${name || 'none'}")`;
    
    return res.status(200).send(code);
}
