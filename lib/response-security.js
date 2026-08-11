// lib/response-security.js - Security Headers & Response Protection
export default class ResponseSecurity {
    /**
     * Apply security headers
     */
    static applyHeaders(res) {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-XSS-Protection', '1; mode=block');
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        
        // Remove server info
        res.removeHeader('X-Powered-By');
        res.removeHeader('Server');
    }
    
    /**
     * Prevent caching of sensitive responses
     */
    static preventCache(res) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }
    
    /**
     * Sanitize error for production
     */
    static sanitizeError(error) {
        // Remove sensitive information
        const safe = {
            error: 'INTERNAL_ERROR',
            code: 'SERVER_ERROR'
        };
        
        // Only include safe error types
        if (error.code) {
            safe.code = error.code;
        }
        
        if (error.message && !error.message.includes('Firebase') && 
            !error.message.includes('Error:') && !error.message.includes('at ')) {
            safe.error = error.message;
        }
        
        return safe;
    }
    
    /**
     * Add rate limit headers
     */
    static rateLimitHeaders(res, info) {
        if (info.limit) res.setHeader('X-RateLimit-Limit', info.limit);
        if (info.remaining !== undefined) res.setHeader('X-RateLimit-Remaining', info.remaining);
        if (info.reset) res.setHeader('X-RateLimit-Reset', info.reset);
    }
}
