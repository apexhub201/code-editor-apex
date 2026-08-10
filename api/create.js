import { saveScript, getScript, normalizeName, detectTarget } from './_lib/firestore.js';
import { phantomObfuscate } from './_lib/obfuscator.js';
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

    if (!await checkRateLimit(clientIP, 'create')) {
      return res.status(429).json({ error: 'Too many requests' });
    }

    const authUser = requireAuth(req);
    if (!authUser) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { code, name } = req.body || {};

    if (!code || typeof code !== 'string' || code.length > 500000) {
      return res.status(400).json({ error: 'Code required' });
    }

    if (!name || typeof name !== 'string' || name.length > 200) {
      return res.status(400).json({ error: 'Name required' });
    }

    const nameSlug = normalizeName(name);
    const fullName = `${authUser}_${nameSlug}`;
    const target = detectTarget(code);
    const obfuscatedCode = phantomObfuscate(code);

    const existing = await getScript(fullName);
    if (existing) {
      const newName = `${fullName}_${Date.now().toString(36)}`;
      await saveScript(newName, {
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
      owner: authUser,
      target: target,
      obfuscated: true
    });

    return res.status(200).json({
      success: true,
      name: fullName
    });

  } catch (error) {
    console.error('create error');
    return res.status(500).json({ error: 'Server error' });
  }
}
