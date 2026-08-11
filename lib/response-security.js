// lib/response-security.js - Response Security Headers & Protection
export default class ResponseSecurity {
    constructor() {
        this.securityHeaders = {
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'X-XSS-Protection': '1; mode=block',
            'Referrer-Policy': 'strict-origin-when-cross-origin',
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
            'Surrogate-Control': 'no-store'
        };
    }

    applySecurityHeaders(res) {
        // Apply all security headers
        for (const [header, value] of Object.entries(this.securityHeaders)) {
            res.setHeader(header, value);
        }

        // Remove sensitive headers
        res.removeHeader('X-Powered-By');
        res.removeHeader('Server');
    }

    secureResponse(res, data, options = {}) {
        const {
            encrypt = false,
            sign = false,
            wrapInEnvelope = true,
            contentType = 'application/json'
        } = options;

        // Apply security headers
        this.applySecurityHeaders(res);
        res.setHeader('Content-Type', contentType);

        let responseData = data;

        // Wrap in envelope if requested
        if (wrapInEnvelope) {
            responseData = {
                success: true,
                timestamp: Date.now(),
                data: responseData
            };
        }

        // Add security metadata
        responseData.security = {
            version: '1.0',
            encrypted: encrypt,
            signed: sign,
            expiresAt: Date.now() + (options.ttl || 60000)
        };

        return responseData;
    }

    addSecurityMeta(responseData, meta = {}) {
        return {
            ...responseData,
            _security: {
                timestamp: Date.now(),
                requestId: meta.requestId || this.generateRequestId(),
                checksum: this.calculateChecksum(responseData),
                ...meta
            }
        };
    }

    generateRequestId() {
        return `req_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
    }

    calculateChecksum(data) {
        const str = JSON.stringify(data);
        let checksum = 0;
        for (let i = 0; i < str.length; i++) {
            checksum = (checksum + str.charCodeAt(i)) % 65536;
        }
        return checksum.toString(16);
    }

    preventCaching(res) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Surrogate-Control', 'no-store');
    }

    rateLimitHeaders(res, rateLimitInfo) {
        res.setHeader('X-RateLimit-Limit', rateLimitInfo.limit);
        res.setHeader('X-RateLimit-Remaining', rateLimitInfo.remaining);
        res.setHeader('X-RateLimit-Reset', rateLimitInfo.reset);
    }

    securityScoreHeaders(res, riskScore) {
        res.setHeader('X-Security-Score', riskScore);
        res.setHeader('X-Threat-Level', riskScore > 70 ? 'high' : riskScore > 40 ? 'medium' : 'low');
    }

    // Obfuscate sensitive data in responses
    obfuscateSensitiveData(data, fields = ['token', 'key', 'secret', 'password']) {
        const obfuscated = JSON.parse(JSON.stringify(data));
        
        const obfuscate = (obj) => {
            for (const key in obj) {
                if (fields.some(f => key.toLowerCase().includes(f.toLowerCase()))) {
                    obj[key] = this.maskValue(obj[key]);
                } else if (typeof obj[key] === 'object') {
                    obfuscate(obj[key]);
                }
            }
        };

        obfuscate(obfuscated);
        return obfuscated;
    }

    maskValue(value) {
        if (typeof value !== 'string') return '***';
        if (value.length <= 8) return '***';
        return value.substr(0, 4) + '***' + value.substr(-4);
    }
}
