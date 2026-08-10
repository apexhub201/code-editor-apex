import { saveScript, getScript } from './_lib/firestore.js';
import { phantomObfuscate } from './_lib/obfuscator.js';
import { getClientIP, checkRateLimit, isIPBanned, requireAuth } from './_lib/security.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Auth-Key');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const clientIP = getClientIP(req);

    if (await isIPBanned(clientIP)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!await checkRateLimit(clientIP, 'update')) {
      return res.status(429).json({ error: 'Too many requests' });
    }

    const authUser = requireAuth(req);
    if (!authUser) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { name, code } = req.body || {};

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

    if (!code || typeof code !== 'string' || code.length > 500000) {
      return res.status(400).json({ error: 'Code required' });
    }

    scriptData.code = phantomObfuscate(code);
    scriptData.originalCode = code;
    scriptData.updated = Date.now();
    scriptData.lastAccessed = Date.now();
    scriptData.obfuscated = true;

    await saveScript(name, scriptData);

    return res.status(200).json({
      success: true,
      name: name
    });

  } catch (error) {
    console.error('update error');
    return res.status(500).json({ error: 'Server error' });
  }
}
