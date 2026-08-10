import { deleteScript, getScript } from './_lib/firestore.js';
import { checkRateLimit, isIPBanned, getClientIP } from './_lib/security.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'DELETE') {
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

    const { name, uid } = req.query;

    if (!name) {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }

    const scriptData = await getScript(name);
    if (!scriptData) {
      return res.status(404).json({ success: false, error: 'Script not found' });
    }

    // Check ownership
    if (uid && scriptData.owner && scriptData.owner !== uid) {
      return res.status(403).json({ success: false, error: 'Not your script' });
    }

    await deleteScript(name);

    return res.status(200).json({
      success: true,
      message: 'Deleted successfully'
    });

  } catch (error) {
    console.error('[APEX] Delete error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
