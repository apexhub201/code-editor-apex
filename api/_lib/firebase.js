import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

let db = null;

export function getDB() {
  if (db) return db;

  if (!getApps().length) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
      console.error('Missing Firebase environment variables');
      throw new Error('Firebase configuration incomplete');
    }

    try {
      initializeApp({
        credential: cert({ projectId, clientEmail, privateKey })
      });
      console.log('[APEX] Firebase initialized successfully');
    } catch (error) {
      console.error('[APEX] Firebase init error:', error);
      throw error;
    }
  }

  db = getFirestore();
  return db;
}
