import { phantomObfuscate } from './_lib/obfuscator.js';
import { generateLoader } from './_lib/crypto.js';
import { saveScript, normalizeName, detectTarget } from './_lib/firestore.js';
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

    const { code, name, uid, save } = req.body;

    if (!code || !code.trim()) {
      return res.status(400).json({ error: 'Code required' });
    }

    // Obfuscate
    const obfuscatedCode = phantomObfuscate(code);
    const loader = generateLoader(code);

    // Save to Firestore nếu yêu cầu
    if (save && name) {
      const nameSlug = normalizeName(name);
      const userId = uid || 'public';
      const fullName = `${userId}_${nameSlug}`;
      const target = detectTarget(code);

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
    }

    // Return obfuscated
    return res.status(200).json({
      success: true,
      code: obfuscatedCode,
      loader: loader
    });

  } catch (error) {
    console.error('obfuscate error:', error.message);
    return res.status(500).json({ error: 'Server error' });
  }
}
