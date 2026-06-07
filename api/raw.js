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
        
        // Kiểm tra nếu là trình duyệt (có User-Agent của browser)
        const isBrowser = 
            userAgent.includes("Mozilla") || 
            userAgent.includes("Chrome") || 
            userAgent.includes("Safari") || 
            userAgent.includes("Firefox") || 
            userAgent.includes("Edge") ||
            userAgent.includes("Opera");

        // Nếu là trình duyệt -> hiển thị thông báo bảo vệ
        if (isBrowser) {
            res.setHeader("Content-Type", "text/plain");
            return res.send(`ACTIVATE PROTECTION
Access: https://code-editor-apex-ccmf.vercel.app/`);
        }

        // Nếu là executor (không có User-Agent hoặc User-Agent đặc biệt)
        // -> trả về code thật để loadstring() hoạt động
        res.setHeader("Content-Type", "text/plain");
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        
        return res.send(scripts[id]);
    }

    return res.status(405).end();
}
