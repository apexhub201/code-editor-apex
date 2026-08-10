import { getScript, validateChallenge, createChallenge } from './_lib/firestore.js';
import { checkRateLimit, isIPBanned, getClientIP, getExecutorUA, isBrowser } from './_lib/security.js';
import { generateLoader, generateChallenge } from './_lib/crypto.js';

export default async function handler(req, res) {
  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only GET
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { name, key, raw, challenge, answer } = req.query;
    const clientIP = getClientIP(req);
    const userAgent = req.headers['user-agent'] || '';
    const authKey = req.headers['x-auth-key'] || '';

    // Security checks
    if (await isIPBanned(clientIP)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
        code: 'IP_BANNED'
      });
    }

    if (!await checkRateLimit(clientIP)) {
      return res.status(429).json({
        success: false,
        error: 'Rate limit exceeded',
        code: 'RATE_LIMITED'
      });
    }

    // Welcome/health check
    if (!name) {
      return res.status(200).json({
        success: true,
        message: 'APEX HUB API Gateway v9',
        version: '9.0.0',
        status: 'operational',
        endpoints: {
          get: '/raw?name=<script>',
          create: 'POST /raw',
          update: 'PUT /raw',
          delete: 'DELETE /raw?name=<script>',
          validate: 'POST /api/validate',
          obfuscate: 'POST /api/obfuscate'
        }
      });
    }

    // Get script
    const scriptData = await getScript(name);
    if (!scriptData) {
      return res.status(404).json({
        success: false,
        error: 'Script not found',
        code: 'NOT_FOUND'
      });
    }

    // Master key check (from environment variable)
    const MASTER_KEY = process.env.APEX_MASTER_KEY;
    const hasValidKey = (MASTER_KEY && (key === MASTER_KEY || authKey === MASTER_KEY));
    const wantsRaw = raw === 'true';

    // Return raw code if authenticated or explicitly requested
    if (hasValidKey || wantsRaw) {
      return res.status(200).json({
        success: true,
        code: scriptData.code,
        obfuscated: scriptData.obfuscated || false,
        name: name
      });
    }

    // Challenge validation
    if (challenge && answer) {
      const isValid = await validateChallenge(challenge, answer);
      if (isValid) {
        return res.status(200).json({
          success: true,
          code: scriptData.code,
          name: name
        });
      }
      return res.status(403).json({
        success: false,
        error: 'Invalid challenge',
        code: 'CHALLENGE_FAILED'
      });
    }

    // Executor client - return encrypted loader
    if (getExecutorUA(userAgent)) {
      const loader = generateLoader(scriptData.code);
      return res.status(200).send(loader);
    }

    // Browser client - return challenge
    if (isBrowser(userAgent)) {
      const newChallenge = generateChallenge();
      await createChallenge(newChallenge.token, newChallenge.answer);

      return res.status(401).json({
        success: false,
        protected: true,
        message: 'Challenge required',
        challenge: {
          question: newChallenge.question,
          token: newChallenge.token
        }
      });
    }

    // Unknown client - return challenge
    const newChallenge = generateChallenge();
    await createChallenge(newChallenge.token, newChallenge.answer);

    return res.status(401).json({
      success: false,
      protected: true,
      message: 'Authentication required',
      challenge: {
        question: newChallenge.question,
        token: newChallenge.token
      }
    });

  } catch (error) {
    console.error('[APEX] Raw endpoint error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      code: 'SERVER_ERROR'
    });
  }
}
