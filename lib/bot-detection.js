// lib/bot-detection.js - Multi-signal Bot Detection
export default class BotDetector {
    static analyze(req, context = {}) {
        const signals = {
            score: 0,
            reasons: [],
            isBot: false,
            riskLevel: 'low'
        };
        
        const ua = (req.headers['user-agent'] || '').toLowerCase();
        const ip = BotDetector.getClientIP(req);
        
        // 1. User-Agent analysis (low weight - easily spoofed)
        if (!ua) {
            signals.score += 15;
            signals.reasons.push('missing_user_agent');
        } else {
            const botPatterns = [
                /discordbot/, /discord\//, /scraper/i, /crawler/i, /spider/i,
                /axios/i, /node-fetch/, /got\//, /python-requests/,
                /curl\//, /wget\//, /libwww/i, /okhttp/i
            ];
            
            for (const pattern of botPatterns) {
                if (pattern.test(ua)) {
                    signals.score += 20;
                    signals.reasons.push('bot_user_agent');
                    break;
                }
            }
        }
        
        // 2. Header analysis
        const requiredHeaders = ['accept', 'accept-language'];
        const missingHeaders = requiredHeaders.filter(h => !req.headers[h]);
        if (missingHeaders.length >= 2) {
            signals.score += 15;
            signals.reasons.push('missing_required_headers');
        }
        
        // 3. Request frequency (from context)
        if (context.requestRate && context.requestRate > 10) {
            signals.score += 15;
            signals.reasons.push('high_request_rate');
        }
        if (context.requestRate && context.requestRate > 50) {
            signals.score += 25;
            signals.reasons.push('very_high_request_rate');
        }
        
        // 4. Challenge failure history
        if (context.challengeFailures && context.challengeFailures > 3) {
            signals.score += 20;
            signals.reasons.push('multiple_challenge_failures');
        }
        if (context.challengeFailures && context.challengeFailures > 10) {
            signals.score += 30;
            signals.reasons.push('excessive_challenge_failures');
        }
        
        // 5. Session anomalies
        if (context.uniqueIPsPerSession && context.uniqueIPsPerSession > 3) {
            signals.score += 20;
            signals.reasons.push('multiple_ips_per_session');
        }
        
        // 6. Repeated script requests
        if (context.scriptRequestRate && context.scriptRequestRate > 5) {
            signals.score += 15;
            signals.reasons.push('high_script_request_rate');
        }
        
        // Determine risk level
        if (signals.score >= 70) {
            signals.isBot = true;
            signals.riskLevel = 'high';
        } else if (signals.score >= 40) {
            signals.riskLevel = 'medium';
        }
        
        return signals;
    }
    
    static getClientIP(req) {
        const forwarded = req.headers['x-forwarded-for'];
        if (forwarded) return forwarded.split(',')[0].trim();
        return req.headers['x-real-ip'] || req.socket?.remoteAddress || '0.0.0.0';
    }
}
