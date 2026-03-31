// api/save-raw.js
import { put } from '@vercel/blob';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const { content, name = 'script' } = req.body;

    if (!content || content.trim() === '') {
        return res.status(400).json({ success: false, error: 'Không có nội dung' });
    }

    try {
        // Tạo tên file đẹp
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2, 7);
        const cleanName = name.replace(/[^a-zA-Z0-9-_]/g, '_').substring(0, 30);
        
        const filename = `apex-raw/${cleanName}_${timestamp}_${random}.lua`;

        // Upload lên Vercel Blob (public)
        const { url } = await put(filename, content, {
            access: 'public',           // ← Quan trọng: public
            addRandomSuffix: false      // Không thêm đuôi ngẫu nhiên
        });

        res.status(200).json({
            success: true,
            url: url,
            filename: filename
        });

    } catch (error) {
        console.error('Blob upload error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Lỗi khi upload lên Vercel Blob' 
        });
    }
}
