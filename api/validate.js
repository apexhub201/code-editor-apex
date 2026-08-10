import { validateChallenge, createChallenge, getScript } from './_lib/firestore.js';
import { generateChallenge } from './_lib/crypto.js';
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

    const { token, answer, name, requestChallenge } = req.body;

    // Request new challenge
    if (requestChallenge) {
      const newChallenge = generateChallenge();
      await createChallenge(newChallenge.token, newChallenge.answer);

      return res.status(200).json({
        challenge: {
          question: newChallenge.question,
          token: newChallenge.token
        }
      });
    }

    // Validate + get script
    if (token && answer && name) {
      const isValid = await validateChallenge(token, answer);
      if (isValid) {
        const scriptData = await getScript(name);
        if (scriptData) {
          return res.status(200).json({
            success: true,
            code: scriptData.code
          });
        }
        return res.status(404).json({ error: 'Not found' });
      }
      return res.status(403).json({ error: 'Invalid' });
    }

    // Validate only
    if (token && answer) {
      const isValid = await validateChallenge(token, answer);
      return res.status(200).json({ valid: isValid });
    }

    return res.status(400).json({ error: 'Bad request' });

  } catch (error) {
    console.error('validate error:', error.message);
    return res.status(500).json({ error: 'Server error' });
  }
}
