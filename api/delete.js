import { deleteScript, getScript } from './_lib/firestore.js';
import { getClientIP, checkRateLimit, isIPBanned, requireAuth } from './_lib/security.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Auth-Key');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const clientIP = getClientIP(req);

    if (await isIPBanned(clientIP)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!await checkRateLimit(clientIP, 'delete')) {
      return res.status(429).json({ error: 'Too many requests' });
    }

    const authUser = requireAuth(req);
    if (!authUser) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { name } = req.query || {};

    if (!name || typeof name !== 'string' || name.length > 200) {
      return res.status(400).json({ error: 'Name required' });
    }

    const scriptData = await getScript(name);
    if (!scriptData) {
      return res.status(404).json({ error: 'Not found' });
    }

    if (scriptData.owner !== authUser) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await deleteScript(name);

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('delete error');
    return res.status(500).json({ error: 'Server error' });
  }
}
