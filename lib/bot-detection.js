// lib/bot-detection.js - Bot & Scraper Detection
export default class BotDetector {
    constructor() {
        this.botPatterns = [
            // Discord bots
            /Discordbot/i,
            /discord/i,
            
            // Common scrapers
            /scraper/i,
            /crawler/i,
            /spider/i,
            /bot/i,
            
            // HTTP clients
            /axios/i,
            /node-fetch/i,
            /got/i,
            /request/i,
            /curl/i,
            /wget/i,
            /python-requests/i,
            /python-urllib/i,
            
            // Automation tools
            /selenium/i,
            /puppeteer/i,
            /playwright/i,
            /headless/i,
            
            // Missing common browser headers
            /^(?!.*(Mozilla|Chrome|Safari|Firefox|Edge|Opera)).*$/i
        ];

        this.suspiciousHeaders = [
            'x-forwarded-for',
            'x-real-ip',
            'cf-connecting-ip'
        ];
    }

    analyze(requestData) {
        const {
            ip,
            userAgent,
            headers,
            timestamp
        } = requestData;

        const analysis = {
            isBot: false,
            confidence: 0,
            reasons: [],
            riskLevel: 'low'
        };

        // 1. User-Agent analysis
        if (!userAgent) {
            analysis.isBot = true;
            analysis.confidence += 40;
            analysis.reasons.push('Missing User-Agent');
        } else {
            // Check bot patterns
            for (const pattern of this.botPatterns) {
                if (pattern.test(userAgent)) {
                    analysis.isBot = true;
                    analysis.confidence += 30;
                    analysis.reasons.push(`Bot UA pattern: ${pattern}`);
                    break;
                }
            }
        }

        // 2. Header analysis
        const missingHeaders = [];
        const requiredHeaders = ['accept', 'accept-language', 'accept-encoding'];
        
        for (const header of requiredHeaders) {
            if (!headers[header]) {
                missingHeaders.push(header);
            }
        }

        if (missingHeaders.length > 0) {
            analysis.confidence += 20;
            analysis.reasons.push(`Missing headers: ${missingHeaders.join(', ')}`);
        }

        // 3. Browser fingerprint check
        if (!this.hasValidBrowserFingerprint(headers)) {
            analysis.confidence += 15;
            analysis.reasons.push('Invalid browser fingerprint');
        }

        // 4. Check for automation headers
        const automationHeaders = [
            'x-requested-with',
            'sec-ch-ua',
            'sec-ch-ua-platform',
            'sec-ch-ua-mobile'
        ];

        const hasAutomationHeaders = automationHeaders.some(h => headers[h]);
        if (!hasAutomationHeaders && headers['user-agent']?.includes('Chrome')) {
            analysis.confidence += 25;
            analysis.reasons.push('Missing Chrome security headers');
        }

        // 5. Rate-based detection
        const requestHistory = this.getRequestHistory(ip);
        if (requestHistory.length > 0) {
            const timeBetweenRequests = this.analyzeRequestTiming(requestHistory);
            if (timeBetweenRequests.average < 100) {
                analysis.confidence += 35;
                analysis.reasons.push('Too fast requests (automated)');
            }
        }

        // 6. IP reputation check
        if (this.isDataCenterIP(ip)) {
            analysis.confidence += 20;
            analysis.reasons.push('Data center IP detected');
        }

        // Update risk level
        if (analysis.confidence > 70) {
            analysis.riskLevel = 'high';
        } else if (analysis.confidence > 40) {
            analysis.riskLevel = 'medium';
        }

        return analysis;
    }

    hasValidBrowserFingerprint(headers) {
        // Kiểm tra các header mà browser thực sự gửi
        const browserHeaders = [
            'accept',
            'accept-language',
            'accept-encoding',
            'sec-fetch-dest',
            'sec-fetch-mode',
            'sec-fetch-site'
        ];

        let validHeaders = 0;
        for (const header of browserHeaders) {
            if (headers[header]) {
                validHeaders++;
            }
        }

        return validHeaders >= 3;
    }

    getRequestHistory(ip) {
        global.requestHistory = global.requestHistory || {};
        if (!global.requestHistory[ip]) {
            global.requestHistory[ip] = [];
        }
        return global.requestHistory[ip];
    }

    analyzeRequestTiming(history) {
        if (history.length < 2) return { average: 0 };

        const intervals = [];
        for (let i = 1; i < history.length; i++) {
            intervals.push(history[i].timestamp - history[i-1].timestamp);
        }

        const average = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const min = Math.min(...intervals);
        const max = Math.max(...intervals);

        return { average, min, max };
    }

    isDataCenterIP(ip) {
        // Kiểm tra IP có phải từ data center không
        const dataCenterRanges = [
            '104.16.', '104.17.', '104.18.', '104.19.', '104.20.',
            '104.21.', '104.22.', '104.23.', '104.24.', '104.25.',
            '104.26.', '104.27.', '104.28.', '104.29.', '104.30.',
            '104.31.'
        ];

        return dataCenterRanges.some(range => ip.startsWith(range));
    }

    recordRequest(ip, timestamp) {
        const history = this.getRequestHistory(ip);
        history.push({ timestamp });
        
        // Chỉ giữ 50 request gần nhất
        if (history.length > 50) {
            global.requestHistory[ip] = history.slice(-50);
        } else {
            global.requestHistory[ip] = history;
        }
    }
}
