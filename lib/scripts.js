// lib/scripts.js - Script storage and retrieval
import FirebaseManager from './firebase.js';
import Crypto from './crypto.js';

// Memory cache
const scriptCache = new Map();
const CACHE_TTL = 30000; // 30 seconds

export class ScriptManager {
    static COLLECTION = 'scripts';
    
    /**
     * Store a script
     */
    static async storeScript(name, code, metadata = {}) {
        const sanitizedName = name.trim().toLowerCase()
            .replace(/[^a-z0-9_-]/g, '')
            .substring(0, 64);
        
        const scriptData = {
            name: metadata.displayName || sanitizedName,
            code,
            created: metadata.created || Date.now(),
            updated: Date.now(),
            owner: metadata.owner || 'public',
            target: metadata.target || 'lua',
            obfuscated: metadata.obfuscated || false,
            size: code.length
        };
        
        // Store in Firestore
        if (FirebaseManager.isAvailable()) {
            try {
                const db = FirebaseManager.getDB();
                await db.collection(ScriptManager.COLLECTION).doc(sanitizedName).set(scriptData);
                
                // Update cache
                scriptCache.set(sanitizedName, {
                    ...scriptData,
                    cachedAt: Date.now()
                });
                
                return { success: true, name: sanitizedName };
            } catch (error) {
                console.error('[SCRIPT] Store error:', error.message);
                return { success: false, error: error.message };
            }
        }
        
        // Memory-only
        scriptCache.set(sanitizedName, {
            ...scriptData,
            cachedAt: Date.now()
        });
        
        return { success: true, name: sanitizedName };
    }
    
    /**
     * Get a script by name
     */
    static async getScript(name) {
        const sanitizedName = name.trim().toLowerCase()
            .replace(/[^a-z0-9_-]/g, '')
            .substring(0, 64);
        
        const now = Date.now();
        
        // Check cache
        const cached = scriptCache.get(sanitizedName);
        if (cached && (now - cached.cachedAt) < CACHE_TTL) {
            return cached;
        }
        
        // Check Firestore
        if (FirebaseManager.isAvailable()) {
            try {
                const db = FirebaseManager.getDB();
                const doc = await db.collection(ScriptManager.COLLECTION).doc(sanitizedName).get();
                
                if (!doc.exists) {
                    return null;
                }
                
                const scriptData = doc.data();
                
                // Update last accessed (fire and forget)
                doc.ref.update({ lastAccessed: now }).catch(() => {});
                
                // Update cache
                scriptCache.set(sanitizedName, {
                    ...scriptData,
                    cachedAt: now
                });
                
                return scriptData;
            } catch (error) {
                console.error('[SCRIPT] Get error:', error.message);
                return cached || null;
            }
        }
        
        return cached || null;
    }
    
    /**
     * Delete a script
     */
    static async deleteScript(name) {
        const sanitizedName = name.trim().toLowerCase()
            .replace(/[^a-z0-9_-]/g, '')
            .substring(0, 64);
        
        scriptCache.delete(sanitizedName);
        
        if (FirebaseManager.isAvailable()) {
            try {
                const db = FirebaseManager.getDB();
                await db.collection(ScriptManager.COLLECTION).doc(sanitizedName).delete();
                return true;
            } catch (error) {
                console.error('[SCRIPT] Delete error:', error.message);
                return false;
            }
        }
        
        return true;
    }
    
    /**
     * List scripts for admin
     */
    static async listScripts(limit = 100) {
        if (FirebaseManager.isAvailable()) {
            try {
                const db = FirebaseManager.getDB();
                const snapshot = await db.collection(ScriptManager.COLLECTION)
                    .orderBy('updated', 'desc')
                    .limit(limit)
                    .get();
                
                return snapshot.docs.map(doc => ({
                    name: doc.id,
                    ...doc.data(),
                    code: undefined // Never return code in listing
                }));
            } catch (error) {
                return [];
            }
        }
        
        return [];
    }
}
