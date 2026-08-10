import { getScript, validateChallenge, createChallenge } from './_lib/firestore.js';
import { checkRateLimit, isIPBanned, getClientIP, getExecutorUA, isBrowser } from './_lib/security.js';
import { generateLoader, generateChallenge } from './_lib/crypto.js';

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Challenge-Token, X-Challenge-Answer, X-Auth-Key');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Chỉ GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { name, key, raw, challenge, answer } = req.query;
    const clientIP = getClientIP(req);
    const userAgent = req.headers['user-agent'] || '';
    const authKey = req.headers['x-auth-key'] || '';

    // Security
    if (await isIPBanned(clientIP)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!await checkRateLimit(clientIP)) {
      return res.status(429).json({ error: 'Too many requests' });
    }

    // Không có name -> response mặc định
    if (!name) {
      return res.status(200).json({ status: 'ok' });
    }

    // Lấy script
    const scriptData = await getScript(name);
    if (!scriptData) {
      return res.status(404).json({ error: 'Not found' });
    }

    // Master key check
    const MASTER_KEY = process.env.APEX_MASTER_KEY;
    const hasValidKey = (MASTER_KEY && (key === MASTER_KEY || authKey === MASTER_KEY));
    const wantsRaw = raw === 'true';

    // Raw code
    if (hasValidKey || wantsRaw) {
      return res.status(200).json({
        success: true,
        code: scriptData.code
      });
    }

    // Challenge validation
    if (challenge && answer) {
      const isValid = await validateChallenge(challenge, answer);
      if (isValid) {
        return res.status(200).json({
          success: true,
          code: scriptData.code
        });
      }
      return res.status(403).json({ error: 'Challenge failed' });
    }

    // Executor -> loader
    if (getExecutorUA(userAgent)) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.status(200).send(generateLoader(scriptData.code));
    }

    // Browser -> challenge
    if (isBrowser(userAgent)) {
      const newChallenge = generateChallenge();
      await createChallenge(newChallenge.token, newChallenge.answer);

      return res.status(401).json({
        protected: true,
        challenge: {
          question: newChallenge.question,
          token: newChallenge.token
        }
      });
    }

    // Unknown -> challenge
    const newChallenge = generateChallenge();
    await createChallenge(newChallenge.token, newChallenge.answer);

    return res.status(401).json({
      protected: true,
      challenge: {
        question: newChallenge.question,
        token: newChallenge.token
      }
    });

  } catch (error) {
    console.error('raw error:', error.message);
    return res.status(500).json({ error: 'Server error' });
  }
}
