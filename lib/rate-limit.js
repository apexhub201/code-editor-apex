// lib/rate-limit.js - Distributed Rate Limiting (Firestore)
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getApps, cert, initializeApp } from 'firebase-admin/app';

if (!getApps().length) {
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && privateKey) {
        initializeApp({
            credential: cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: privateKey
            })
        });
    }
}

const db = getFirestore();
const COLLECTION = 'security_rate_limits';

export default class RateLimiter {
    /**
     * Check rate limit using Firestore
     * @param {string} key - Identifier (IP, session, etc.)
     * @param {string} endpoint - Endpoint being accessed
     * @param {number} maxRequests - Maximum requests allowed
     * @param {number} windowMs - Time window in milliseconds
     * @returns {Object} { allowed, count, remaining, retryAfter }
     */
    static async check(key, endpoint, maxRequests = 30, windowMs = 60000) {
        const docId = `${key}_${endpoint}`;
        const now = Date.now();
        const windowStart = now - windowMs;
        
        try {
            const docRef = db.collection(COLLECTION).doc(docId);
            
            const result = await db.runTransaction(async (transaction) => {
                const doc = await transaction.get(docRef);
                
                if (!doc.exists) {
                    transaction.set(docRef, {
                        key,
                        endpoint,
                        count: 1,
                        windowStart: now,
                        updatedAt: FieldValue.serverTimestamp()
                    });
                    return {
                        allowed: true,
                        count: 1,
                        remaining: maxRequests - 1,
                        retryAfter: 0
                    };
                }
                
                const data = doc.data();
                
                // Reset if window expired
                if (data.windowStart < windowStart) {
                    transaction.update(docRef, {
                        count: 1,
                        windowStart: now,
                        updatedAt: FieldValue.serverTimestamp()
                    });
                    return {
                        allowed: true,
                        count: 1,
                        remaining: maxRequests - 1,
                        retryAfter: 0
                    };
                }
                
                const newCount = data.count + 1;
                
                if (newCount > maxRequests) {
                    const retryAfter = data.windowStart + windowMs - now;
                    return {
                        allowed: false,
                        count: newCount,
                        remaining: 0,
                        retryAfter: Math.max(0, retryAfter)
                    };
                }
                
                transaction.update(docRef, {
                    count: newCount,
                    updatedAt: FieldValue.serverTimestamp()
                });
                
                return {
                    allowed: true,
                    count: newCount,
                    remaining: maxRequests - newCount,
                    retryAfter: 0
                };
            });
            
            return result;
        } catch (error) {
            console.error('[RATE_LIMIT] Check error:', error.message);
            // Fail open to avoid blocking legitimate traffic
            return {
                allowed: true,
                count: 0,
                remaining: maxRequests,
                retryAfter: 0,
                error: error.message
            };
        }
    }
    
    /**
     * Get current rate limit status
     */
    static async getStatus(key, endpoint, maxRequests = 30, windowMs = 60000) {
        const docId = `${key}_${endpoint}`;
        
        try {
            const doc = await db.collection(COLLECTION).doc(docId).get();
            
            if (!doc.exists) {
                return {
                    count: 0,
                    remaining: maxRequests,
                    reset: Date.now() + windowMs
                };
            }
            
            const data = doc.data();
            const now = Date.now();
            
            if (data.windowStart < now - windowMs) {
                return {
                    count: 0,
                    remaining: maxRequests,
                    reset: now + windowMs
                };
            }
            
            return {
                count: data.count,
                remaining: Math.max(0, maxRequests - data.count),
                reset: data.windowStart + windowMs
            };
        } catch (error) {
            return {
                count: 0,
                remaining: maxRequests,
                reset: Date.now() + windowMs,
                error: error.message
            };
        }
    }
}
