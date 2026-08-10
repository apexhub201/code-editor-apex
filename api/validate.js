import { createChallenge, validateChallenge, getScript } from './_lib/firestore.js';
import { generateChallenge } from './_lib/crypto.js';
import { getClientIP, checkRateLimit, isIPBanned } from './_lib/security.js';

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

    if (!await checkRateLimit(clientIP, 'validate')) {
      return res.status(429).json({ error: 'Too many requests' });
    }

    const body = req.body || {};

    if (body.requestChallenge) {
      const newChallenge = generateChallenge();
      await createChallenge(newChallenge.token, newChallenge.answer);
      return res.status(200).json({
        challenge: {
          question: newChallenge.question,
          token: newChallenge.token
        }
      });
    }

    const { token, answer, name } = body;

    if (!token || !answer) {
      return res.status(400).json({ error: 'Bad request' });
    }

    if (typeof token !== 'string' || token.length > 100) {
      return res.status(400).json({ error: 'Bad request' });
    }
    if (typeof answer !== 'string' || answer.length > 50) {
      return res.status(400).json({ error: 'Bad request' });
    }

    const isValid = await validateChallenge(token, answer);

    if (name) {
      if (typeof name !== 'string' || name.length > 200) {
        return res.status(400).json({ error: 'Bad request' });
      }
      if (isValid) {
        const scriptData = await getScript(name);
        if (scriptData) {
          return res.status(200).json({
            valid: true,
            code: scriptData.code
          });
        }
        return res.status(404).json({ error: 'Not found' });
      }
      return res.status(403).json({ valid: false });
    }

    return res.status(200).json({ valid: isValid });

  } catch (error) {
    console.error('validate error');
    return res.status(500).json({ error: 'Server error' });
  }
}
