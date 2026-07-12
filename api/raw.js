// api/raw.js
global.scripts = global.scripts || {};

export default function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Session-Token');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method === 'POST') {
        return handleCreate(req, res);
    }

    if (req.method === 'PUT') {
        return handleUpdate(req, res);
    }

    if (req.method === 'DELETE') {
        return handleDelete(req, res);
    }

    return res.status(405).json({ error: 'Method not allowed' });
}

function handleCreate(req, res) {
    try {
        const { code, name } = req.body;

        if (!code || !code.trim()) {
            return res.status(400).json({ success: false, error: 'Code is required' });
        }

        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, error: 'Name is required' });
        }

        const nameSlug = name.trim()
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '') || 'script';

        if (global.scripts[nameSlug]) {
            return res.status(409).json({ success: false, error: 'Script name already exists' });
        }

        global.scripts[nameSlug] = {
            code: code,
            name: name.trim(),
            created: Date.now(),
            lastAccessed: Date.now()
        };

        const rawUrl = `https://${req.headers.host}/api/load?name=${nameSlug}`;

        return res.status(200).json({
            success: true,
            raw: rawUrl,
            name: nameSlug
        });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
}

function handleUpdate(req, res) {
    try {
        const { name, code } = req.body;

        if (!name || !global.scripts[name]) {
            return res.status(404).json({ success: false, error: 'Script not found' });
        }

        if (!code || !code.trim()) {
            return res.status(400).json({ success: false, error: 'Code is required' });
        }

        global.scripts[name].code = code;
        global.scripts[name].updated = Date.now();
        global.scripts[name].lastAccessed = Date.now();

        const rawUrl = `https://${req.headers.host}/api/load?name=${name}`;

        return res.status(200).json({
            success: true,
            message: 'Updated successfully',
            raw: rawUrl,
            name: name
        });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
}

function handleDelete(req, res) {
    const { name } = req.query;
    if (name && global.scripts[name]) {
        delete global.scripts[name];
        return res.status(200).json({ success: true, message: 'Deleted' });
    }
    return res.status(404).json({ success: false, error: 'Script not found' });
}
