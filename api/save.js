let database = {};

export default function handler(req, res) {
    if (req.method === 'POST') {
        const { content, id } = req.body;

        if (!content || !id) {
            return res.status(400).json({ error: "Thiếu dữ liệu" });
        }

        database[id] = content;

        return res.status(200).json({
            success: true,
            url: `https://code-editor-apex-ccmf.vercel.app/api/get?id=${id}`
        });
    }

    res.status(405).end();
}
