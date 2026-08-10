import { getDB } from './firebase.js';

const SCRIPTS = 'scripts';
const CHALLENGES = 'challenges';

const cache = new Map();
const TTL = 5 * 60 * 1000;

// Scripts

export async function getScript(name) {
  const c = cache.get(name);
  if (c && Date.now() - c.ts < TTL) return c.data;

  try {
    const db = getDB();
    const doc = await db.collection(SCRIPTS).doc(name).get();
    if (!doc.exists) return null;

    const data = doc.data();
    doc.ref.update({ lastAccessed: Date.now() }).catch(() => {});

    cache.set(name, { data, ts: Date.now() });
    return data;

  } catch (e) {
    return null;
  }
}

export async function saveScript(name, data) {
  try {
    const db = getDB();
    await db.collection(SCRIPTS).doc(name).set({
      ...data,
      updatedAt: Date.now()
    }, { merge: true });

    cache.delete(name);
    return true;

  } catch (e) {
    return false;
  }
}

export async function deleteScript(name) {
  try {
    const db = getDB();
    await db.collection(SCRIPTS).doc(name).delete();
    cache.delete(name);
    return true;

  } catch (e) {
    return false;
  }
}

// Challenges

export async function createChallenge(token, answer) {
  try {
    const db = getDB();
    await db.collection(CHALLENGES).doc(token).set({
      answer,
      createdAt: Date.now(),
      used: false,
      attempts: 0
    });
    return true;

  } catch (e) {
    return false;
  }
}

export async function validateChallenge(token, answer) {
  try {
    const db = getDB();
    const ref = db.collection(CHALLENGES).doc(token);
    const doc = await ref.get();

    if (!doc.exists) return false;

    const c = doc.data();
    const now = Date.now();

    if (now - c.createdAt > 60000) return false;
    if (c.used) return false;

    await ref.update({ attempts: (c.attempts || 0) + 1 });

    if (answer === c.answer) {
      await ref.update({ used: true });
      return true;
    }

    return false;

  } catch (e) {
    return false;
  }
}

// Utils

export function normalizeName(name) {
  return name.trim().toLowerCase()
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
