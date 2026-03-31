// api/save.js
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const { content, id } = req.body;

    if (!content) {
        return res.status(400).json({ success: false, error: 'No content' });
    }

    // Lưu tạm vào global variable (hoặc dùng Vercel KV / Upstash nếu muốn bền vững hơn)
    if (!global.rawStorage) global.rawStorage = new Map();
    
    const rawId = id || Date.now().toString(36) + Math.random().toString(36).substr(2);
    
    global.rawStorage.set(rawId, {
        content: content,
        createdAt: Date.now()
    });

    // Tự động xóa sau 24h (tùy chọn)
    setTimeout(() => {
        if (global.rawStorage) global.rawStorage.delete(rawId);
    }, 24 * 60 * 60 * 1000);

    const rawUrl = `https://${process.env.VERCEL_URL || 'your-project.vercel.app'}/raw/${rawId}`;

    res.status(200).json({
        success: true,
        url: rawUrl,
        id: rawId
    });
}
