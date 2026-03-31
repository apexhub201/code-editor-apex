import { put } from '@vercel/blob';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ success: false });

    const { content, name = "script" } = req.body;

    if (!content?.trim()) {
        return res.status(400).json({ success: false, error: "No content" });
    }

    try {
        const cleanName = name.replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 30);
        const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
        const filename = `apex-raw/${cleanName}_${id}.lua`;

        const { url } = await put(filename, content, {
            access: 'public',
            addRandomSuffix: false
        });

        res.json({ success: true, url });
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, error: "Upload failed" });
    }
}
