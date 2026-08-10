import { phantomObfuscate } from './_lib/obfuscator.js';
import { generateLoader } from './_lib/crypto.js';
import { saveScript, normalizeName, detectTarget } from './_lib/firestore.js';
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

    const { code, name, uid, save } = req.body;

    if (!code || !code.trim()) {
      return res.status(400).json({ success: false, error: 'Code is required' });
    }

    // Apply obfuscation
    console.log('[APEX] Applying Phantom obfuscation...');
    const obfuscatedCode = phantomObfuscate(code);
    const loader = generateLoader(code);

    // If save requested
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
        name: fullName,
        obfuscated: true,
        url: `/raw?name=${fullName}`
      });
    }

    // Return obfuscated code only
    return res.status(200).json({
      success: true,
      obfuscated: true,
      code: obfuscatedCode,
      loader: loader,
      stats: {
        originalLength: code.length,
        obfuscatedLength: obfuscatedCode.length
      }
    });

  } catch (error) {
    console.error('[APEX] Obfuscate error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
