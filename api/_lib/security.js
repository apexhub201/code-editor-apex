import { getDB } from './firebase.js';

const RATE_LIMITS = 'rate_limits';
const BANNED = 'banned_ips';

export async function checkRateLimit(ip) {
  const now = Date.now();
  try {
    const db = getDB();
    const ref = db.collection(RATE_LIMITS).doc(ip);
    const doc = await ref.get();

    if (!doc.exists) {
      await ref.set({ count: 1, resetTime: now + 60000, createdAt: now });
      return true;
    }

    const d = doc.data();
    if (now > d.resetTime) {
      await ref.update({ count: 1, resetTime: now + 60000 });
      return true;
    }

    if (d.count >= 30) {
      await db.collection(BANNED).doc(ip).set({
        bannedUntil: now + 300000,
        createdAt: now
      });
      return false;
    }

    await ref.update({ count: d.count + 1 });
    return true;

  } catch (e) {
    return true;
  }
}

export async function isIPBanned(ip) {
  try {
    const db = getDB();
    const doc = await db.collection(BANNED).doc(ip).get();
    if (!doc.exists) return false;

    const d = doc.data();
    if (Date.now() < d.bannedUntil) return true;

    await doc.ref.delete();
    return false;

  } catch (e) {
    return false;
  }
}

export function getClientIP(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return fwd.split(',')[0].trim();

  const real = req.headers['x-real-ip'];
  if (real) return real.trim();

  return req.socket?.remoteAddress || '127.0.0.1';
}

export function getExecutorUA(ua) {
  const u = (ua || '').toLowerCase();
  const executors = [
    'roblox', 'synapse', 'krnl', 'script-ware', 'sentinel',
    'fluxus', 'electron', 'comet', 'oxygen', 'valyse',
    'hydrogen', 'codex', 'vega', 'trigon', 'nexus',
    'solara', 'jjsploit', 'celestial', 'evon', 'aris'
  ];
  return executors.some(p => u.includes(p));
}

export function isBrowser(ua) {
  const u = (ua || '').toLowerCase();
  return u.includes('mozilla') || u.includes('chrome') ||
         u.includes('safari') || u.includes('firefox');
}
