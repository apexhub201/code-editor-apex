// api/ping.js
export default function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    return res.send('pong');
}
