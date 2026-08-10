// lib/firebase.js - Firebase/Firestore integration
import admin from 'firebase-admin';

class FirebaseManager {
    static initialized = false;
    static db = null;
    
    /**
     * Initialize Firebase Admin SDK
     */
    static init() {
        if (FirebaseManager.initialized && admin.apps.length > 0) {
            return admin.apps[0];
        }
        
        try {
            const projectId = process.env.FIREBASE_PROJECT_ID;
            const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
            const privateKey = process.env.FIREBASE_PRIVATE_KEY;
            
            if (projectId && clientEmail && privateKey) {
                const fixedKey = privateKey.replace(/\\n/g, '\n');
                
                const app = admin.initializeApp({
                    credential: admin.credential.cert({
                        projectId,
                        clientEmail,
                        privateKey: fixedKey
                    }),
                    projectId
                });
                
                FirebaseManager.db = admin.firestore();
                FirebaseManager.initialized = true;
                console.log('[APEX] Firebase initialized successfully');
                return app;
            }
            
            if (process.env.FIREBASE_SERVICE_ACCOUNT) {
                const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
                
                const app = admin.initializeApp({
                    credential: admin.credential.cert(serviceAccount),
                    projectId: serviceAccount.project_id
                });
                
                FirebaseManager.db = admin.firestore();
                FirebaseManager.initialized = true;
                console.log('[APEX] Firebase initialized with service account');
                return app;
            }
            
            console.warn('[APEX] No Firebase credentials - running in memory-only mode');
            FirebaseManager.initialized = true;
            return null;
            
        } catch (error) {
            console.error('[APEX] Firebase init error:', error.message);
            FirebaseManager.initialized = true;
            return null;
        }
    }
    
    /**
     * Get Firestore database instance
     */
    static getDB() {
        if (!FirebaseManager.db) {
            FirebaseManager.init();
        }
        return FirebaseManager.db;
    }
    
    /**
     * Check if Firebase is available
     */
    static isAvailable() {
        return FirebaseManager.db !== null;
    }
    
    /**
     * Get a collection reference
     */
    static collection(name) {
        const db = FirebaseManager.getDB();
        return db ? db.collection(name) : null;
    }
    
    /**
     * Get a document reference
     */
    static doc(collection, id) {
        const col = FirebaseManager.collection(collection);
        return col ? col.doc(id) : null;
    }
}

export default FirebaseManager;
