// lib/sessions.js - Session management with Firestore persistence
import FirebaseManager from './firebase.js';
import Crypto from './crypto.js';

// In-memory cache for fast validation
const sessionCache = new Map();
const CACHE_TTL = 60000; // 1 minute cache

export class SessionManager {
    static SESSION_TTL = 5 * 60 * 1000; // 5 minutes
    static COLLECTION = 'sessions';
    
    /**
     * Create a new session
     */
    static async createSession(keyId, hwid, version, ipHash) {
        const sessionToken = Crypto.generateToken('sess_');
        const tokenHash = Crypto.hash(sessionToken);
        const hwidHash = Crypto.hash(hwid);
        const now = Date.now();
        
        const sessionData = {
            tokenHash,
            keyId,
            hwidHash,
            ipHash,
            version,
            createdAt: now,
            expiresAt: now + SessionManager.SESSION_TTL,
            lastSeen: now,
            active: true,
            revoked: false
        };
        
        // Store in Firestore
        if (FirebaseManager.isAvailable()) {
            try {
                const db = FirebaseManager.getDB();
                await db.collection(SessionManager.COLLECTION).doc(tokenHash).set(sessionData);
            } catch (error) {
                console.error('[SESSION] Failed to store session:', error.message);
            }
        }
        
        // Cache in memory
        sessionCache.set(tokenHash, {
            ...sessionData,
            cachedAt: now
        });
        
        return {
            token: sessionToken,
            tokenHash,
            hwidHash,
            expiresAt: sessionData.expiresAt
        };
    }
    
    /**
     * Validate a session token
     */
    static async validateSession(sessionToken, hwid = null) {
        if (!sessionToken || typeof sessionToken !== 'string' || sessionToken.length < 32) {
            return { valid: false, reason: 'INVALID_SESSION' };
        }
        
        const tokenHash = Crypto.hash(sessionToken);
        const now = Date.now();
        
        // Check cache first
        const cached = sessionCache.get(tokenHash);
        if (cached && (now - cached.cachedAt) < CACHE_TTL) {
            if (!cached.active || cached.revoked) {
                return { valid: false, reason: 'SESSION_REVOKED' };
            }
            if (now > cached.expiresAt) {
                sessionCache.delete(tokenHash);
                return { valid: false, reason: 'SESSION_EXPIRED' };
            }
            if (hwid && cached.hwidHash !== Crypto.hash(hwid)) {
                return { valid: false, reason: 'HWID_MISMATCH' };
            }
            return { valid: true, session: cached };
        }
        
        // Check Firestore
        if (FirebaseManager.isAvailable()) {
            try {
                const db = FirebaseManager.getDB();
                const doc = await db.collection(SessionManager.COLLECTION).doc(tokenHash).get();
                
                if (!doc.exists) {
                    return { valid: false, reason: 'INVALID_SESSION' };
                }
                
                const session = doc.data();
                
                if (!session.active || session.revoked) {
                    return { valid: false, reason: 'SESSION_REVOKED' };
                }
                
                if (now > session.expiresAt) {
                    return { valid: false, reason: 'SESSION_EXPIRED' };
                }
                
                if (hwid && session.hwidHash !== Crypto.hash(hwid)) {
                    return { valid: false, reason: 'HWID_MISMATCH' };
                }
                
                // Update last seen
                await doc.ref.update({ lastSeen: now });
                
                // Update cache
                sessionCache.set(tokenHash, {
                    ...session,
                    cachedAt: now,
                    lastSeen: now
                });
                
                return { valid: true, session };
                
            } catch (error) {
                console.error('[SESSION] Validation error:', error.message);
                // Fallback to cache if available
                if (cached) {
                    if (now > cached.expiresAt) {
                        return { valid: false, reason: 'SESSION_EXPIRED' };
                    }
                    return { valid: true, session: cached };
                }
                return { valid: false, reason: 'INTERNAL_ERROR' };
            }
        }
        
        // Memory-only mode
        if (cached) {
            if (!cached.active || cached.revoked) {
                return { valid: false, reason: 'SESSION_REVOKED' };
            }
            if (now > cached.expiresAt) {
                sessionCache.delete(tokenHash);
                return { valid: false, reason: 'SESSION_EXPIRED' };
            }
            return { valid: true, session: cached };
        }
        
        return { valid: false, reason: 'INVALID_SESSION' };
    }
    
    /**
     * Revoke a session
     */
    static async revokeSession(tokenHash) {
        sessionCache.delete(tokenHash);
        
        if (FirebaseManager.isAvailable()) {
            try {
                const db = FirebaseManager.getDB();
                await db.collection(SessionManager.COLLECTION).doc(tokenHash).update({
                    active: false,
                    revoked: true,
                    revokedAt: Date.now()
                });
                return true;
            } catch (error) {
                console.error('[SESSION] Revoke error:', error.message);
                return false;
            }
        }
        
        return true;
    }
    
    /**
     * Clean up expired sessions
     */
    static async cleanupExpiredSessions() {
        const now = Date.now();
        
        // Clean cache
        for (const [hash, session] of sessionCache.entries()) {
            if (now > session.expiresAt + 60000) {
                sessionCache.delete(hash);
            }
        }
        
        // Clean Firestore periodically (every 10 minutes)
        if (FirebaseManager.isAvailable() && Math.random() < 0.1) {
            try {
                const db = FirebaseManager.getDB();
                const expired = await db.collection(SessionManager.COLLECTION)
                    .where('expiresAt', '<', now - 3600000)
                    .limit(100)
                    .get();
                
                const batch = db.batch();
                expired.docs.forEach(doc => batch.delete(doc.ref));
                await batch.commit();
            } catch (error) {
                console.error('[SESSION] Cleanup error:', error.message);
            }
        }
    }
}

// Periodic cleanup
setInterval(() => SessionManager.cleanupExpiredSessions(), 60000);
