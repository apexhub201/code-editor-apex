import { saveScript, getScript } from './_lib/firestore.js';
import { phantomObfuscate } from './_lib/obfuscator.js';
import { checkRateLimit, isIPBanned, getClientIP } from './_lib/security.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'PUT') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const clientIP = getClientIP(req);

    if (await isIPBanned(clientIP)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    if (!await checkRateLimit(clientIP)) {
      return res.status(429).json({ success: false, error: 'Rate limit exceeded' });
    }

    const { name, code, uid } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }

    const scriptData = await getScript(name);
    if (!scriptData) {
      return res.status(404).json({ success: false, error: 'Script not found' });
    }

    if (!code || !code.trim()) {
      return res.status(400).json({ success: false, error: 'Code is required' });
    }

    // Check ownership
    if (uid && scriptData.owner && scriptData.owner !== uid) {
      return res.status(403).json({ success: false, error: 'Not your script' });
    }

    scriptData.code = phantomObfuscate(code);
    scriptData.originalCode = code;
    scriptData.updated = Date.now();
    scriptData.lastAccessed = Date.now();
    scriptData.obfuscated = true;

    await saveScript(name, scriptData);

    return res.status(200).json({
      success: true,
      message: 'Updated successfully',
      name: name
    });

  } catch (error) {
    console.error('[APEX] Update error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
