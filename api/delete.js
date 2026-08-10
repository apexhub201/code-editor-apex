import { deleteScript, getScript } from './_lib/firestore.js';
import { checkRateLimit, isIPBanned, getClientIP } from './_lib/security.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
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

    if (!await checkRateLimit(clientIP)) {
      return res.status(429).json({ error: 'Too many requests' });
    }

    const { name, uid } = req.query;

    if (!name) {
      return res.status(400).json({ error: 'Name required' });
    }

    const scriptData = await getScript(name);
    if (!scriptData) {
      return res.status(404).json({ error: 'Not found' });
    }

    // Check owner
    if (uid && scriptData.owner && scriptData.owner !== uid) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await deleteScript(name);

    return res.status(200).json({
      success: true
    });

  } catch (error) {
    console.error('delete error:', error.message);
    return res.status(500).json({ error: 'Server error' });
  }
}
