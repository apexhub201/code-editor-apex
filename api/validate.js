import { validateChallenge, createChallenge, getScript } from './_lib/firestore.js';
import { generateChallenge } from './_lib/crypto.js';
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

    const { token, answer, name, requestChallenge } = req.body;

    // Request new challenge
    if (requestChallenge) {
      const newChallenge = generateChallenge();
      await createChallenge(newChallenge.token, newChallenge.answer);

      return res.status(200).json({
        success: true,
        challenge: {
          question: newChallenge.question,
          token: newChallenge.token
        }
      });
    }

    // Validate challenge and get script
    if (token && answer && name) {
      const isValid = await validateChallenge(token, answer);
      if (isValid) {
        const scriptData = await getScript(name);
        if (scriptData) {
          return res.status(200).json({
            success: true,
            valid: true,
            code: scriptData.code,
            name: name
          });
        }
        return res.status(404).json({
          success: false,
          valid: true,
          error: 'Script not found'
        });
      }
      return res.status(403).json({
        success: false,
        valid: false,
        error: 'Invalid challenge'
      });
    }

    // Just validate challenge
    if (token && answer) {
      const isValid = await validateChallenge(token, answer);
      return res.status(200).json({
        success: true,
        valid: isValid
      });
    }

    return res.status(400).json({
      success: false,
      error: 'Invalid request. Required: token + answer, or token + answer + name, or requestChallenge'
    });

  } catch (error) {
    console.error('[APEX] Validate error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
