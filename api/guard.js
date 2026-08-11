// api/guard.js - Security Gateway Middleware
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getApps, cert, initializeApp } from 'firebase-admin/app';
import crypto from 'crypto';

// Initialize Firebase if not already
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

const COLLECTIONS = {
    SESSIONS: 'security_sessions',
    RATE_LIMITS: 'security_rate_limits',
    BANS: 'security_bans',
    EVENTS: 'security_events',
    NONCES: 'security_nonces'
};

/**
 * Extract client IP from Vercel request
 */
function getClientIP(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }
    return req.headers['x-real-ip'] || req.socket?.remoteAddress || '0.0.0.0';
}

/**
 * Create a security event log
 */
async function logSecurityEvent(type, data) {
    try {
        await db.collection(COLLECTIONS.EVENTS).add({
            type,
            ...data,
            createdAt: FieldValue.serverTimestamp(),
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // TTL 7 days
        });
    } catch (error) {
        console.error('[GUARD] Failed to log event:', type, error.message);
    }
}

/**
 * Distributed rate limiting using Firestore
 */
async function checkRateLimitFirestore(ip, endpoint, maxRequests = 30, windowMs = 60000) {
    const docId = `${ip}_${endpoint}`;
    const now = Date.now();
    const windowStart = now - windowMs;
    
    try {
        const docRef = db.collection(COLLECTIONS.RATE_LIMITS).doc(docId);
        
        // Atomic update using transaction
        const result = await db.runTransaction(async (transaction) => {
            const doc = await transaction.get(docRef);
            
            if (!doc.exists) {
                transaction.set(docRef, {
                    ip,
                    endpoint,
                    count: 1,
                    windowStart: now,
                    updatedAt: FieldValue.serverTimestamp()
                });
                return { allowed: true, count: 1, remaining: maxRequests - 1 };
            }
            
            const data = doc.data();
            
            // Reset window if expired
            if (data.windowStart < windowStart) {
                transaction.update(docRef, {
                    count: 1,
                    windowStart: now,
                    updatedAt: FieldValue.serverTimestamp()
                });
                return { allowed: true, count: 1, remaining: maxRequests - 1 };
            }
            
            const newCount = data.count + 1;
            
            if (newCount > maxRequests) {
                // Log rate limit event
                await logSecurityEvent('rate_limited', {
                    ip,
                    endpoint,
                    count: newCount,
                    limit: maxRequests
                });
                
                return { allowed: false, count: newCount, remaining: 0 };
            }
            
            transaction.update(docRef, {
                count: newCount,
                updatedAt: FieldValue.serverTimestamp()
            });
            
            return { allowed: true, count: newCount, remaining: maxRequests - newCount };
        });
        
        return result;
    } catch (error) {
        console.error('[GUARD] Rate limit error:', error.message);
        // Fail open for now, but log the error
        return { allowed: true, count: 0, remaining: maxRequests, error: error.message };
    }
}

/**
 * Check if IP is banned (Firestore)
 */
async function isIPBanned(ip) {
    try {
        const doc = await db.collection(COLLECTIONS.BANS).doc(ip).get();
        if (!doc.exists) return false;
        
        const data = doc.data();
        if (data.expiresAt && data.expiresAt.toDate() > new Date()) {
            return true;
        }
        
        // Clean up expired ban
        await doc.ref.delete();
        return false;
    } catch (error) {
        console.error('[GUARD] Ban check error:', error.message);
        return false;
    }
}

/**
 * Ban an IP
 */
async function banIP(ip, durationMs = 300000, reason = 'security_violation') {
    try {
        await db.collection(COLLECTIONS.BANS).doc(ip).set({
            ip,
            reason,
            createdAt: FieldValue.serverTimestamp(),
            expiresAt: new Date(Date.now() + durationMs)
        });
        
        await logSecurityEvent('ip_banned', { ip, reason, durationMs });
    } catch (error) {
        console.error('[GUARD] Ban error:', error.message);
    }
}

/**
 * Validate session token against Firestore
 */
async function validateSession(sessionToken) {
    if (!sessionToken || typeof sessionToken !== 'string' || sessionToken.length < 32) {
        return null;
    }
    
    try {
        const doc = await db.collection(COLLECTIONS.SESSIONS).doc(sessionToken).get();
        if (!doc.exists) return null;
        
        const session = doc.data();
        
        // Check expiration
        if (session.expiresAt && session.expiresAt.toDate() < new Date()) {
            // Session expired, mark as revoked
            await doc.ref.update({ 
                active: false, 
                revokedAt: FieldValue.serverTimestamp(),
                revokeReason: 'expired'
            });
            return null;
        }
        
        // Check if active
        if (!session.active) return null;
        
        // Check max requests
        if (session.maxRequests && session.requestCount >= session.maxRequests) {
            await doc.ref.update({ 
                active: false, 
                revokedAt: FieldValue.serverTimestamp(),
                revokeReason: 'max_requests_exceeded'
            });
            return null;
        }
        
        // Update session activity
        await doc.ref.update({
            lastActivity: FieldValue.serverTimestamp(),
            requestCount: FieldValue.increment(1)
        });
        
        return {
            token: sessionToken,
            tier: session.tier,
            createdAt: session.createdAt?.toDate(),
            expiresAt: session.expiresAt?.toDate(),
            requestCount: session.requestCount,
            maxRequests: session.maxRequests,
            metadata: session.metadata
        };
    } catch (error) {
        console.error('[GUARD] Session validation error:', error.message);
        return null;
    }
}

/**
 * Multi-signal bot detection
 */
function detectBot(req, riskContext = {}) {
    const signals = {
        isBot: false,
        confidence: 0,
        reasons: [],
        riskLevel: 'low'
    };
    
    const ua = (req.headers['user-agent'] || '').toLowerCase();
    const ip = getClientIP(req);
    
    // 1. Missing User-Agent
    if (!ua) {
        signals.confidence += 25;
        signals.reasons.push('missing_user_agent');
    }
    
    // 2. Known bot patterns
    const botPatterns = [
        /discordbot/, /discord\//, /scraper/i, /crawler/i, /spider/i,
        /axios/i, /node-fetch/, /got\//, /python-requests/, /python-urllib/,
        /curl\//, /wget\//, /libwww/i, /okhttp/i, /java\//
    ];
    
    for (const pattern of botPatterns) {
        if (pattern.test(ua)) {
            signals.confidence += 20;
            signals.reasons.push('known_bot_ua');
            break;
        }
    }
    
    // 3. Missing browser headers
    const browserHeaders = ['accept', 'accept-language', 'accept-encoding'];
    const missingHeaders = browserHeaders.filter(h => !req.headers[h]);
    if (missingHeaders.length >= 2) {
        signals.confidence += 15;
        signals.reasons.push('missing_headers');
    }
    
    // 4. Suspicious header combinations
    if (ua.includes('mozilla') && !req.headers['sec-fetch-dest']) {
        signals.confidence += 10;
        signals.reasons.push('fake_browser_ua');
    }
    
    // 5. Request frequency (from risk context)
    if (riskContext.requestCount > 50) {
        signals.confidence += 15;
        signals.reasons.push('high_request_frequency');
    }
    
    // 6. Challenge failures
    if (riskContext.challengeFailures > 3) {
        signals.confidence += 20;
        signals.reasons.push('multiple_challenge_failures');
    }
    
    // 7. Session anomalies
    if (riskContext.sessionReuseCount > 3) {
        signals.confidence += 15;
        signals.reasons.push('session_reuse_anomaly');
    }
    
    // Determine risk level
    if (signals.confidence >= 70) {
        signals.isBot = true;
        signals.riskLevel = 'high';
    } else if (signals.confidence >= 40) {
        signals.riskLevel = 'medium';
    }
    
    return signals;
}

/**
 * Main guard middleware
 */
export default async function guard(req, res, options = {}) {
    const {
        requireSession = false,
        requireChallenge = false,
        rateLimit = true,
        rateLimitMax = 30,
        rateLimitWindow = 60000,
        botDetection = true,
        endpoint = 'default'
    } = options;
    
    const ip = getClientIP(req);
    const now = Date.now();
    
    // Collect risk context
    const riskContext = {};
    
    try {
        // 1. Check IP ban
        if (await isIPBanned(ip)) {
            await logSecurityEvent('blocked_banned_ip', { ip, endpoint });
            return {
                blocked: true,
                status: 403,
                body: { error: 'ACCESS_DENIED', code: 'IP_BANNED' }
            };
        }
        
        // 2. Rate limiting
        if (rateLimit) {
            const rateResult = await checkRateLimitFirestore(ip, endpoint, rateLimitMax, rateLimitWindow);
            riskContext.requestCount = rateResult.count;
            
            if (!rateResult.allowed) {
                // Increase ban risk
                if (rateResult.count > rateLimitMax * 3) {
                    await banIP(ip, 300000, 'excessive_rate');
                }
                
                return {
                    blocked: true,
                    status: 429,
                    body: { 
                        error: 'RATE_LIMITED', 
                        retryAfter: Math.ceil(rateLimitWindow / 1000)
                    }
                };
            }
        }
        
        // 3. Bot detection
        if (botDetection) {
            const botResult = detectBot(req, riskContext);
            
            if (botResult.riskLevel === 'high') {
                await logSecurityEvent('bot_detected', {
                    ip,
                    endpoint,
                    confidence: botResult.confidence,
                    reasons: botResult.reasons
                });
                
                await banIP(ip, 600000, 'bot_detected');
                
                return {
                    blocked: true,
                    status: 403,
                    body: { error: 'ACCESS_DENIED', code: 'BOT_DETECTED' }
                };
            }
        }
        
        // 4. Session validation
        let session = null;
        if (requireSession) {
            const sessionToken = req.headers['x-session-token'] || 
                                req.query.session_token ||
                                req.body?.sessionToken;
            
            session = await validateSession(sessionToken);
            
            if (!session) {
                return {
                    blocked: true,
                    status: 401,
                    body: { error: 'INVALID_SESSION', code: 'SESSION_REQUIRED' }
                };
            }
            
            // Check session hasn't expired
            if (session.expiresAt && session.expiresAt < new Date()) {
                return {
                    blocked: true,
                    status: 401,
                    body: { error: 'SESSION_EXPIRED', code: 'SESSION_EXPIRED' }
                };
            }
        }
        
        // Passed all checks
        return {
            blocked: false,
            session,
            ip
        };
        
    } catch (error) {
        console.error('[GUARD] Unexpected error:', error.message);
        return {
            blocked: true,
            status: 500,
            body: { error: 'INTERNAL_ERROR' }
        };
    }
}

export { getClientIP, validateSession, banIP, logSecurityEvent };
