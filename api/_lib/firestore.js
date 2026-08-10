import { getDB } from './firebase.js';

const SCRIPTS_COLLECTION = 'scripts';
const CHALLENGES_COLLECTION = 'challenges';

// Simple in-memory cache (clears on cold starts, which is fine for serverless)
const memoryCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ============================================================
// SCRIPT OPERATIONS
// ============================================================

export async function getScript(name) {
  // Check cache first
  const cached = memoryCache.get(name);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    return cached.data;
  }

  try {
    const db = getDB();
    const docRef = db.collection(SCRIPTS_COLLECTION).doc(name);
    const doc = await docRef.get();

    if (!doc.exists) {
      return null;
    }

    const data = doc.data();

    // Update last accessed timestamp (non-blocking)
    docRef.update({ lastAccessed: Date.now() }).catch(() => {});

    // Cache the result
    memoryCache.set(name, {
      data: data,
      timestamp: Date.now()
    });

    return data;

  } catch (error) {
    console.error('[APEX] Get script error:', error);
    return null;
  }
}

export async function saveScript(name, data) {
  try {
    const db = getDB();
    const docRef = db.collection(SCRIPTS_COLLECTION).doc(name);

    await docRef.set({
      ...data,
      updatedAt: Date.now()
    }, { merge: true });

    // Invalidate cache
    memoryCache.delete(name);

    return true;

  } catch (error) {
    console.error('[APEX] Save script error:', error);
    return false;
  }
}

export async function deleteScript(name) {
  try {
    const db = getDB();
    await db.collection(SCRIPTS_COLLECTION).doc(name).delete();

    // Invalidate cache
    memoryCache.delete(name);

    return true;

  } catch (error) {
    console.error('[APEX] Delete script error:', error);
    return false;
  }
}

export async function listScripts(owner = null, limit = 100) {
  try {
    const db = getDB();
    let query = db.collection(SCRIPTS_COLLECTION);

    if (owner) {
      query = query.where('owner', '==', owner);
    }

    const snapshot = await query.orderBy('created', 'desc').limit(limit).get();
    const scripts = [];

    snapshot.forEach(doc => {
      scripts.push({
        id: doc.id,
        ...doc.data()
      });
    });

    return scripts;

  } catch (error) {
    console.error('[APEX] List scripts error:', error);
    return [];
  }
}

// ============================================================
// CHALLENGE OPERATIONS
// ============================================================

export async function createChallenge(token, answer) {
  try {
    const db = getDB();
    await db.collection(CHALLENGES_COLLECTION).doc(token).set({
      answer: answer,
      createdAt: Date.now(),
      used: false,
      attempts: 0
    });
    return true;
  } catch (error) {
    console.error('[APEX] Create challenge error:', error);
    return false;
  }
}

export async function validateChallenge(token, answer) {
  try {
    const db = getDB();
    const docRef = db.collection(CHALLENGES_COLLECTION).doc(token);
    const doc = await docRef.get();

    if (!doc.exists) {
      return false;
    }

    const challenge = doc.data();
    const now = Date.now();

    // Check expiry (1 minute)
    if (now - challenge.createdAt > 60000) {
      return false;
    }

    // Check if already used
    if (challenge.used) {
      return false;
    }

    // Update attempts
    await docRef.update({
      attempts: (challenge.attempts || 0) + 1
    });

    // Validate answer
    if (answer === challenge.answer) {
      await docRef.update({ used: true });
      return true;
    }

    return false;

  } catch (error) {
    console.error('[APEX] Validate challenge error:', error);
    return false;
  }
}

export async function cleanupExpiredChallenges() {
  try {
    const db = getDB();
    const now = Date.now();
    const expiryTime = now - 300000; // 5 minutes ago

    const snapshot = await db.collection(CHALLENGES_COLLECTION)
      .where('createdAt', '<', expiryTime)
      .limit(100)
      .get();

    const batch = db.batch();
    snapshot.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();
    return snapshot.size;

  } catch (error) {
    console.error('[APEX] Cleanup challenges error:', error);
    return 0;
  }
}

// ============================================================
// UTILITIES
// ============================================================

export function normalizeName(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'script';
}

export function detectTarget(code) {
  if (code.match(/\bgame\s*:\s*GetService\s*\(/) ||
      code.match(/\bInstance\.new\s*\(/) ||
      code.match(/\btask\.(spawn|wait|defer)\s*\(/) ||
      code.match(/\bworkspace\b/) ||
      code.match(/--!/)) {
    return 'luau';
  }
  return 'lua';
}
