import { put } from '@vercel/blob';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const { content, name = 'script' } = req.body;

    if (!content || !content.trim()) {
        return res.status(400).json({ success: false, error: 'Không có nội dung code' });
    }

    try {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2, 8);
        const cleanName = name.replace(/[^a-zA-Z0-9-_]/g, '_').substring(0, 40);

        const filename = `apex-raw/${cleanName}_${timestamp}_${random}.lua`;

        const { url } = await put(filename, content, {
            access: 'public',
            addRandomSuffix: false
        });

        res.status(200).json({ success: true, url: url });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Upload Blob thất bại' });
    }
}
