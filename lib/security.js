// lib/security.js - Security and validation utilities

export class Security {
    /**
     * Get client IP address from request
     */
    static getClientIP(req) {
        return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
               req.headers['x-real-ip'] ||
               req.connection?.remoteAddress ||
               req.socket?.remoteAddress ||
               '0.0.0.0';
    }
    
    /**
     * Validate request has required fields
     */
    static validateFields(body, requiredFields) {
        const missing = [];
        for (const field of requiredFields) {
            if (!body[field] || (typeof body[field] === 'string' && !body[field].trim())) {
                missing.push(field);
            }
        }
        return missing;
    }
    
    /**
     * Validate request body size
     */
    static validateBodySize(req, maxSize = 10240) {
        const contentLength = parseInt(req.headers['content-length'] || '0');
        return contentLength <= maxSize;
    }
    
    /**
     * Calculate risk score for a request
     */
    static calculateRiskScore(factors) {
        let score = 0;
        
        if (factors.tooFast) score += 20;
        if (factors.challengeFailed) score += 30;
        if (factors.nonceReplay) score += 30;
        if (factors.multipleSessions) score += 20;
        if (factors.keyBruteforce) score += 40;
        if (factors.suspiciousUA) score += 10;
        if (factors.malformedRequest) score += 25;
        if (factors.highRequestRate) score += 15;
        
        return Math.min(score, 100);
    }
    
    /**
     * Check if User-Agent appears suspicious (NOT for auth, only risk scoring)
     */
    static isSuspiciousUA(userAgent) {
        if (!userAgent) return true;
        
        const ua = userAgent.toLowerCase();
        
        // Known automation tools
        const suspiciousPatterns = [
            'bot', 'crawler', 'spider', 'scraper',
            'curl', 'wget', 'python', 'requests',
            'java/', 'libwww', 'perl', 'ruby',
            'go-http', 'node-fetch', 'axios'
        ];
        
        return suspiciousPatterns.some(pattern => ua.includes(pattern));
    }
    
    /**
     * Validate HWID format
     */
    static isValidHWID(hwid) {
        if (!hwid || typeof hwid !== 'string') return false;
        return hwid.length >= 16 && hwid.length <= 256;
    }
    
    /**
     * Validate version string format
     */
    static isValidVersion(version) {
        if (!version || typeof version !== 'string') return false;
        return /^[\d.]+$/.test(version) && version.length <= 20;
    }
    
    /**
     * Sanitize script name for storage
     */
    static sanitizeName(name) {
        return name.trim().toLowerCase()
            .replace(/[^a-z0-9\s_-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')
            .substring(0, 64) || 'script';
    }
}

export default Security;
