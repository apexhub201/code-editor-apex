import { saveScript, getScript, normalizeName, detectTarget } from './_lib/firestore.js';
import { phantomObfuscate } from './_lib/obfuscator.js';
import { checkRateLimit, isIPBanned, getClientIP } from './_lib/security.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
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

    const { code, name, uid } = req.body;

    if (!code || !code.trim()) {
      return res.status(400).json({ error: 'Code required' });
    }

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name required' });
    }

    const nameSlug = normalizeName(name);
    const userId = uid || 'public';
    const fullName = `${userId}_${nameSlug}`;
    const target = detectTarget(code);

    // Obfuscate
    const obfuscatedCode = phantomObfuscate(code);

    // Check exists
    const existing = await getScript(fullName);
    if (existing) {
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
        existed: true
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
      name: fullName
    });

  } catch (error) {
    console.error('create error:', error.message);
    return res.status(500).json({ error: 'Server error' });
  }
}
