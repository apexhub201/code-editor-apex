import { saveScript, getScript } from './_lib/firestore.js';
import { phantomObfuscate } from './_lib/obfuscator.js';
import { checkRateLimit, isIPBanned, getClientIP } from './_lib/security.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
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

    if (!await checkRateLimit(clientIP)) {
      return res.status(429).json({ error: 'Too many requests' });
    }

    const { name, code, uid } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name required' });
    }

    const scriptData = await getScript(name);
    if (!scriptData) {
      return res.status(404).json({ error: 'Not found' });
    }

    if (!code || !code.trim()) {
      return res.status(400).json({ error: 'Code required' });
    }

    // Check owner
    if (uid && scriptData.owner && scriptData.owner !== uid) {
      return res.status(403).json({ error: 'Forbidden' });
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
    console.error('update error:', error.message);
    return res.status(500).json({ error: 'Server error' });
  }
}
