// lib/rate-limit.js - Multi-dimensional rate limiting
import FirebaseManager from './firebase.js';
import Crypto from './crypto.js';

// In-memory cache for performance, falls back to Firestore
const memoryCache = new Map();

export class RateLimiter {
    static DEFAULT_CONFIGS = {
        'auth': {
            ip: { maxRequests: 10, windowMs: 60000 },
            key: { maxRequests: 20, windowMs: 60000 },
            hwid: { maxRequests: 15, windowMs: 60000 }
        },
        'get-script': {
            ip: { maxRequests: 30, windowMs: 60000 },
            session: { maxRequests: 20, windowMs: 60000 }
        },
        'challenge': {
            ip: { maxRequests: 10, windowMs: 60000 }
        },
        'admin': {
            ip: { maxRequests: 5, windowMs: 60000 }
        },
        'default': {
            ip: { maxRequests: 60, windowMs: 60000 }
        }
    };
    
    /**
     * Check rate limit for a specific dimension
     */
    static async checkLimit(dimension, identifier, endpoint = 'default') {
        const config = RateLimiter.DEFAULT_CONFIGS[endpoint]?.[dimension] ||
                       RateLimiter.DEFAULT_CONFIGS['default']?.ip ||
                       { maxRequests: 60, windowMs: 60000 };
        
        const cacheKey = `rl:${endpoint}:${dimension}:${Crypto.hash256(identifier)}`;
        const now = Date.now();
        
        // Check memory cache first
        const cached = memoryCache.get(cacheKey);
        if (cached && now < cached.windowEnd && cached.count >= config.maxRequests) {
            return false;
        }
        
        // Check/update Firestore
        if (FirebaseManager.isAvailable()) {
            try {
                const db = FirebaseManager.getDB();
                const docRef = db.collection('rate_limits').doc(cacheKey);
                
                const result = await db.runTransaction(async (transaction) => {
                    const doc = await transaction.get(docRef);
                    
                    if (!doc.exists) {
                        transaction.set(docRef, {
                            count: 1,
                            windowStart: now,
                            windowEnd: now + config.windowMs,
                            dimension,
                            identifier: Crypto.hash256(identifier),
                            endpoint
                        });
                        return true;
                    }
                    
                    const data = doc.data();
                    
                    if (now > data.windowEnd) {
                        transaction.update(docRef, {
                            count: 1,
                            windowStart: now,
                            windowEnd: now + config.windowMs
                        });
                        return true;
                    }
                    
                    if (data.count >= config.maxRequests) {
                        return false;
                    }
                    
                    transaction.update(docRef, {
                        count: data.count + 1
                    });
                    return true;
                });
                
                // Update memory cache
                memoryCache.set(cacheKey, {
                    count: cached ? cached.count + 1 : 1,
                    windowEnd: now + config.windowMs
                });
                
                return result;
                
            } catch (error) {
                // Fallback to memory-only
                if (!cached || now >= cached.windowEnd) {
                    memoryCache.set(cacheKey, {
                        count: 1,
                        windowEnd: now + config.windowMs
                    });
                    return true;
                }
                
                if (cached.count >= config.maxRequests) {
                    return false;
                }
                
                cached.count++;
                return true;
            }
        }
        
        // Memory-only mode
        if (!cached || now >= cached.windowEnd) {
            memoryCache.set(cacheKey, {
                count: 1,
                windowEnd: now + config.windowMs
            });
            return true;
        }
        
        if (cached.count >= config.maxRequests) {
            return false;
        }
        
        cached.count++;
        return true;
    }
    
    /**
     * Check multiple rate limits at once
     */
    static async checkAllLimits(limits, endpoint) {
        for (const [dimension, identifier] of Object.entries(limits)) {
            if (identifier) {
                const allowed = await RateLimiter.checkLimit(dimension, identifier, endpoint);
                if (!allowed) {
                    return { allowed: false, dimension };
                }
            }
        }
        return { allowed: true };
    }
    
    /**
     * Clean up expired cache entries periodically
     */
    static cleanupCache() {
        const now = Date.now();
        for (const [key, value] of memoryCache.entries()) {
            if (now >= value.windowEnd) {
                memoryCache.delete(key);
            }
        }
    }
}

// Periodic cleanup
setInterval(() => RateLimiter.cleanupCache(), 300000);
