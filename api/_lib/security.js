import { getDB } from './firebase.js';

const RATE_LIMITS = 'rate_limits';
const BANNED = 'banned_ips';

const WINDOW_MS = 60000;
const BAN_DURATION_MS = 300000;
const MAX_REQUESTS = 30;

export async function checkRateLimit(ip, endpoint = 'default') {
  const now = Date.now();
  const key = `${endpoint}:${ip}`;
  try {
    const db = getDB();
    const ref = db.collection(RATE_LIMITS).doc(key);
    const doc = await ref.get();

    if (!doc.exists) {
      await ref.set({ count: 1, resetTime: now + WINDOW_MS });
      return true;
    }

    const d = doc.data();
    if (now > d.resetTime) {
      await ref.update({ count: 1, resetTime: now + WINDOW_MS });
      return true;
    }

    if (d.count >= MAX_REQUESTS) {
      await db.collection(BANNED).doc(ip).set({
        bannedUntil: now + BAN_DURATION_MS,
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
  if (fwd) {
    const ips = fwd.split(',');
    const ip = ips[0].trim();
    if (ip && ip.length < 45) return ip;
  }

  const real = req.headers['x-real-ip'];
  if (real && real.length < 45) return real.trim();

  return '127.0.0.1';
}

export function requireAuth(req) {
  const authHeader = req.headers['x-auth-key'];
  const MASTER_KEY = process.env.APEX_MASTER_KEY;

  if (!MASTER_KEY || !authHeader) return null;

  if (authHeader.startsWith('user_')) {
    const userId = authHeader.substring(5);
    if (userId && userId.length > 0 && userId.length <= 50) {
      return userId;
    }
  }

  if (authHeader === MASTER_KEY) {
    return 'master';
  }

  return null;
}
