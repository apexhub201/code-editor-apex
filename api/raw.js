import { getScript, createChallenge, validateChallenge } from './_lib/firestore.js';
import { getClientIP, checkRateLimit, isIPBanned } from './_lib/security.js';
import { generateLoader, generateChallenge } from './_lib/crypto.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Auth-Key');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, private');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { name, challenge, answer } = req.query;
    const clientIP = getClientIP(req);

    if (await isIPBanned(clientIP)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!await checkRateLimit(clientIP, 'raw')) {
      return res.status(429).json({ error: 'Too many requests' });
    }

    if (!name) {
      return res.status(200).json({ status: 'ok' });
    }

    if (typeof name !== 'string' || name.length > 200) {
      return res.status(400).json({ error: 'Bad request' });
    }

    const scriptData = await getScript(name);
    if (!scriptData) {
      return res.status(404).json({ error: 'Not found' });
    }

    const authHeader = req.headers['x-auth-key'];
    const MASTER_KEY = process.env.APEX_MASTER_KEY;

    if (MASTER_KEY && authHeader === MASTER_KEY) {
      return res.status(200).json({
        success: true,
        code: scriptData.code
      });
    }

    if (challenge && answer) {
      if (typeof challenge !== 'string' || challenge.length > 100) {
        return res.status(400).json({ error: 'Bad request' });
      }
      if (typeof answer !== 'string' || answer.length > 50) {
        return res.status(400).json({ error: 'Bad request' });
      }

      const isValid = await validateChallenge(challenge, answer);
      if (isValid) {
        return res.status(200).json({
          success: true,
          code: scriptData.code
        });
      }
      return res.status(403).json({ error: 'Forbidden' });
    }

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
    console.error('raw error');
    return res.status(500).json({ error: 'Server error' });
  }
}
