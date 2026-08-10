import { phantomObfuscate } from './_lib/obfuscator.js';
import { generateLoader } from './_lib/crypto.js';
import { saveScript, normalizeName, detectTarget } from './_lib/firestore.js';
import { getClientIP, checkRateLimit, isIPBanned, requireAuth } from './_lib/security.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Auth-Key');
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

    if (!await checkRateLimit(clientIP, 'obfuscate')) {
      return res.status(429).json({ error: 'Too many requests' });
    }

    const { code, name, save } = req.body || {};

    if (!code || typeof code !== 'string' || code.length > 500000) {
      return res.status(400).json({ error: 'Code required' });
    }

    const obfuscatedCode = phantomObfuscate(code);
    const loader = generateLoader(code);

    if (save && name) {
      const authUser = requireAuth(req);
      if (!authUser) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (typeof name !== 'string' || name.length > 200) {
        return res.status(400).json({ error: 'Bad request' });
      }

      const nameSlug = normalizeName(name);
      const fullName = `${authUser}_${nameSlug}`;
      const target = detectTarget(code);

      await saveScript(fullName, {
        code: obfuscatedCode,
        originalCode: code,
        name: name.trim(),
        created: Date.now(),
        lastAccessed: Date.now(),
        owner: authUser,
        target: target,
        obfuscated: true
      });

      return res.status(200).json({
        success: true,
        name: fullName
      });
    }

    return res.status(200).json({
      success: true,
      code: obfuscatedCode,
      loader: loader
    });

  } catch (error) {
    console.error('obfuscate error');
    return res.status(500).json({ error: 'Server error' });
  }
}
