import { getDB } from './firebase.js';

const RATE_LIMITS_COLLECTION = 'rate_limits';
const BANNED_COLLECTION = 'banned_ips';
const MAX_REQUESTS = 30;
const WINDOW_MS = 60000; // 1 minute
const BAN_DURATION_MS = 300000; // 5 minutes

export async function checkRateLimit(ip) {
  const now = Date.now();
  try {
    const db = getDB();
    const docRef = db.collection(RATE_LIMITS_COLLECTION).doc(ip);
    const doc = await docRef.get();

    if (!doc.exists) {
      await docRef.set({
        count: 1,
        resetTime: now + WINDOW_MS,
        createdAt: now
      });
      return true;
    }

    const data = doc.data();

    // Reset if window expired
    if (now > data.resetTime) {
      await docRef.update({
        count: 1,
        resetTime: now + WINDOW_MS
      });
      return true;
    }

    // Ban if exceeded
    if (data.count >= MAX_REQUESTS) {
      await db.collection(BANNED_COLLECTION).doc(ip).set({
        bannedUntil: now + BAN_DURATION_MS,
        reason: 'Rate limit exceeded',
        count: data.count,
        createdAt: now
      });
      return false;
    }

    // Increment
    await docRef.update({
      count: data.count + 1
    });
    return true;

  } catch (error) {
    console.error('[APEX] Rate limit check error:', error);
    return true; // Fail open
  }
}

export async function isIPBanned(ip) {
  try {
    const db = getDB();
    const doc = await db.collection(BANNED_COLLECTION).doc(ip).get();

    if (!doc.exists) return false;

    const data = doc.data();
    const now = Date.now();

    // Check if ban is still active
    if (now < data.bannedUntil) {
      return true;
    }

    // Ban expired, clean up
    await doc.ref.delete();
    return false;

  } catch (error) {
    console.error('[APEX] IP ban check error:', error);
    return false; // Fail open
  }
}

export function getClientIP(req) {
  // Vercel-specific headers (order matters)
  const xForwardedFor = req.headers['x-forwarded-for'];
  if (xForwardedFor) {
    // Take the first IP in the chain (client's real IP)
    const ips = xForwardedFor.split(',');
    return ips[0].trim();
  }

  // Fallback headers
  const realIP = req.headers['x-real-ip'];
  if (realIP) return realIP.trim();

  // Last resort
  return req.socket?.remoteAddress || '127.0.0.1';
}

export function getExecutorUA(userAgent) {
  const ua = (userAgent || '').toLowerCase();
  const executorPatterns = [
    'roblox', 'synapse', 'krnl', 'script-ware', 'sentinel',
    'fluxus', 'electron', 'comet', 'oxygen', 'valyse',
    'hydrogen', 'codex', 'vega', 'trigon', 'nexus',
    'solara', 'jjsploit', 'celestial', 'evon', 'aris'
  ];
  return executorPatterns.some(p => ua.includes(p));
}

export function isBrowser(userAgent) {
  const ua = (userAgent || '').toLowerCase();
  return ua.includes('mozilla') || ua.includes('chrome') ||
         ua.includes('safari') || ua.includes('firefox') ||
         ua.includes('edge') || ua.includes('opera');
}

export function isCurlOrCLI(userAgent) {
  const ua = (userAgent || '').toLowerCase();
  return ua.includes('curl') || ua.includes('wget') ||
         ua.includes('python') || ua.includes('node');
}
