import { saveScript, getScript, normalizeName, detectTarget } from './_lib/firestore.js';
import { phantomObfuscate } from './_lib/obfuscator.js';
import { checkRateLimit, isIPBanned, getClientIP } from './_lib/security.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
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

    const { code, name, uid } = req.body;

    if (!code || !code.trim()) {
      return res.status(400).json({ success: false, error: 'Code is required' });
    }

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }

    const nameSlug = normalizeName(name);
    const userId = uid || 'public';
    const fullName = `${userId}_${nameSlug}`;
    const target = detectTarget(code);

    // Apply obfuscation
    const obfuscatedCode = phantomObfuscate(code);

    // Check if exists
    const existingScript = await getScript(fullName);
    if (existingScript) {
      const newName = `${fullName}_${Date.now().toString(36)}`;
      await saveScript(newName, {
        code: obfuscatedCode,
        originalCode: code,
        name: name.trim(),
        created: Date.now(),
        lastAccessed: Date.now(),
        owner: userId,
        target: target,
        obfuscated: true
      });

      return res.status(200).json({
        success: true,
        name: newName,
        existed: true,
        url: `/raw?name=${newName}`
      });
    }

    await saveScript(fullName, {
      code: obfuscatedCode,
      originalCode: code,
      name: name.trim(),
      created: Date.now(),
      lastAccessed: Date.now(),
      owner: userId,
      target: target,
      obfuscated: true
    });

    return res.status(200).json({
      success: true,
      name: fullName,
      url: `/raw?name=${fullName}`
    });

  } catch (error) {
    console.error('[APEX] Create error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
