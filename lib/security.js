// lib/security.js — Security Core v4
// ============================================================
// Hệ thống bảo mật: Rate limit, Challenge, Access Token,
// Risk Scoring, Nonce, Session, IP Ban, Strike
// ============================================================

import Crypto from './crypto.js';

// ============================================================
// CONSTANTS
// ============================================================
const ACCESS_TOKEN_TTL = 90 * 1000;        // 90 giây cho access token
const CHALLENGE_TTL = 45 * 1000;           // 45 giây cho challenge
const MAX_CHALLENGE_ATTEMPTS = 2;          // Tối đa 2 lần thử sai
const RATE_LIMIT_WINDOW = 60 * 1000;       // Cửa sổ rate limit: 60 giây
const RATE_LIMIT_MAX = 15;                 // Tối đa 15 requests/cửa sổ
const BAN_DURATION = 600 * 1000;           // Thời gian ban: 10 phút
const MAX_BAN_STRIKES = 3;                 // Số strike tối đa trước khi ban
const NONCE_TTL = 120 * 1000;              // Nonce hết hạn sau 2 phút
const SESSION_TTL = 24 * 60 * 60 * 1000;   // Session sống 24 giờ
const STRIKE_TTL = 60 * 60 * 1000;         // Strike hết hạn sau 1 giờ

// ============================================================
// IN-MEMORY STORES (dùng Map để hiệu năng cao)
// Có thể thay bằng Firebase sau này
// ============================================================

// Khởi tạo global stores nếu chưa có
if (!global._securityInitialized) {
    global.rateLimits = new Map();
    global.bannedIPs = new Map();
    global.strikes = new Map();
    global.challenges = new Map();
    global.accessTokens = new Map();
    global.nonces = new Map();
    global.sessions = new Map();
    global.requestLog = new Map();
    global._securityInitialized = true;
}

// ============================================================
// PERIODIC CLEANUP
// Xóa các entry hết hạn mỗi 5 phút
// ============================================================
const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 phút

function runCleanup() {
    const now = Date.now();
    
    // Cleanup challenges
    for (const [key, data] of global.challenges) {
        if (now - data.createdAt > CHALLENGE_TTL) {
            global.challenges.delete(key);
        }
    }
    
    // Cleanup access tokens
    for (const [key, data] of global.accessTokens) {
        if (now > data.expiresAt) {
            global.accessTokens.delete(key);
        }
    }
    
    // Cleanup nonces
    for (const [key, data] of global.nonces) {
        if (now > data.expiresAt) {
            global.nonces.delete(key);
        }
    }
    
    // Cleanup rate limits
    for (const [key, data] of global.rateLimits) {
        if (now > data.resetTime) {
            global.rateLimits.delete(key);
        }
    }
    
    // Cleanup banned IPs
    for (const [key, data] of global.bannedIPs) {
        if (now > data.until) {
            global.bannedIPs.delete(key);
        }
    }
    
    // Cleanup strikes
    for (const [key, data] of global.strikes) {
        if (now > data.expiresAt) {
            global.strikes.delete(key);
        }
    }
    
    // Cleanup sessions
    for (const [key, data] of global.sessions) {
        if (now > data.expiresAt || !data.active) {
            global.sessions.delete(key);
        }
    }
    
    // Cleanup request logs (giữ tối đa 1000 entries)
    if (global.requestLog.size > 1000) {
        const entries = [...global.requestLog.entries()];
        entries.sort((a, b) => a[1][a[1].length - 1] - b[1][b[1].length - 1]);
        const toDelete = entries.slice(0, entries.length - 800);
        for (const [key] of toDelete) {
            global.requestLog.delete(key);
        }
    }
}

// Chạy cleanup ngay và set interval
runCleanup();
const cleanupTimer = setInterval(runCleanup, CLEANUP_INTERVAL);

// Cho phép cleanup timer không chặn process exit
if (cleanupTimer && cleanupTimer.unref) {
    cleanupTimer.unref();
}

// ============================================================
// SECURITY CLASS
// ============================================================

export class Security {
    // ============================================================
    // IP & CLIENT IDENTIFICATION
    // ============================================================
    
    /**
     * Lấy địa chỉ IP thực của client
     * Hỗ trợ nhiều header proxy khác nhau
     * @param {object} req - Request object
     * @returns {string} Địa chỉ IP
     */
    static getClientIP(req) {
        // Cloudflare
        const cfIP = req.headers['cf-connecting-ip'];
        if (cfIP) return cfIP.trim();
        
        // Nginx / Apache proxy
        const realIP = req.headers['x-real-ip'];
        if (realIP) return realIP.trim();
        
        // Standard forwarded header
        const forwarded = req.headers['x-forwarded-for'];
        if (forwarded) {
            // Lấy IP đầu tiên trong chuỗi (client thực)
            const ips = forwarded.split(',');
            return ips[0].trim();
        }
        
        // Direct connection
        if (req.socket && req.socket.remoteAddress) {
            return req.socket.remoteAddress;
        }
        if (req.connection && req.connection.remoteAddress) {
            return req.connection.remoteAddress;
        }
        
        return 'unknown';
    }

    /**
     * Tạo fingerprint từ headers của request
     * Giúp nhận diện client ngay cả khi đổi IP
     * @param {object} req - Request object
     * @returns {string} Fingerprint hash
     */
    static getFingerprint(req) {
        const ua = req.headers['user-agent'] || '';
        const accept = req.headers['accept'] || '';
        const acceptLanguage = req.headers['accept-language'] || '';
        const acceptEncoding = req.headers['accept-encoding'] || '';
        const secChUa = req.headers['sec-ch-ua'] || '';
        const secChUaPlatform = req.headers['sec-ch-ua-platform'] || '';
        
        const fingerprintString = [
            ua,
            accept,
            acceptLanguage,
            acceptEncoding,
            secChUa,
            secChUaPlatform
        ].join('|');
        
        return Crypto.hashString(fingerprintString);
    }

    // ============================================================
    // RATE LIMIT
    // ============================================================
    
    /**
     * Kiểm tra rate limit cho một key (thường là IP)
     * @param {string} identifier - Định danh (IP hoặc IP:action)
     * @param {number} limit - Số request tối đa (mặc định 15)
     * @param {number} windowMs - Cửa sổ thời gian ms (mặc định 60000)
     * @returns {object} { allowed, remaining, resetIn }
     */
    static checkRateLimit(identifier, limit = RATE_LIMIT_MAX, windowMs = RATE_LIMIT_WINDOW) {
        const now = Date.now();
        let entry = global.rateLimits.get(identifier);

        // Nếu chưa có entry hoặc đã hết hạn, tạo mới
        if (!entry || now > entry.resetTime) {
            entry = {
                count: 1,
                resetTime: now + windowMs,
                firstSeen: now,
                lastSeen: now
            };
            global.rateLimits.set(identifier, entry);
            return {
                allowed: true,
                remaining: limit - 1,
                resetIn: windowMs,
                limit: limit
            };
        }

        // Tăng counter
        entry.count++;
        entry.lastSeen = now;
        global.rateLimits.set(identifier, entry);

        // Kiểm tra vượt limit
        if (entry.count > limit) {
            return {
                allowed: false,
                remaining: 0,
                resetIn: entry.resetTime - now,
                limit: limit,
                retryAfter: Math.ceil((entry.resetTime - now) / 1000)
            };
        }

        return {
            allowed: true,
            remaining: limit - entry.count,
            resetIn: entry.resetTime - now,
            limit: limit
        };
    }

    /**
     * Lấy thông tin rate limit hiện tại (không tăng counter)
     * @param {string} identifier - Định danh
     * @returns {object} Thông tin rate limit
     */
    static getRateLimitInfo(identifier) {
        const entry = global.rateLimits.get(identifier);
        if (!entry) {
            return {
                count: 0,
                remaining: RATE_LIMIT_MAX,
                resetIn: RATE_LIMIT_WINDOW
            };
        }
        const now = Date.now();
        if (now > entry.resetTime) {
            global.rateLimits.delete(identifier);
            return {
                count: 0,
                remaining: RATE_LIMIT_MAX,
                resetIn: RATE_LIMIT_WINDOW
            };
        }
        return {
            count: entry.count,
            remaining: Math.max(0, RATE_LIMIT_MAX - entry.count),
            resetIn: entry.resetTime - now
        };
    }

    // ============================================================
    // STRIKE SYSTEM
    // ============================================================
    
    /**
     * Thêm một strike cho IP
     * Strike tích lũy sẽ dẫn đến ban tự động
     * @param {string} ip - Địa chỉ IP
     * @param {string} reason - Lý do strike
     * @returns {object} Thông tin strike hiện tại
     */
    static addStrike(ip, reason = '') {
        const now = Date.now();
        let entry = global.strikes.get(ip);
        
        if (!entry || now > entry.expiresAt) {
            entry = {
                count: 0,
                reasons: [],
                expiresAt: now + STRIKE_TTL,
                firstStrike: now
            };
        }
        
        entry.count++;
        entry.reasons.push({
            reason: reason,
            timestamp: now
        });
        entry.expiresAt = now + STRIKE_TTL;
        entry.lastStrike = now;
        
        global.strikes.set(ip, entry);

        // Tự động ban nếu vượt ngưỡng
        if (entry.count >= MAX_BAN_STRIKES) {
            const banDuration = BAN_DURATION * Math.min(entry.count - MAX_BAN_STRIKES + 1, 6);
            Security.banIP(ip, banDuration, `Auto-ban: ${entry.count} strikes. Reasons: ${entry.reasons.map(r => r.reason).join(', ')}`);
            
            // Reset strikes sau khi ban
            global.strikes.delete(ip);
        }

        return {
            count: entry.count,
            maxStrikes: MAX_BAN_STRIKES,
            remaining: Math.max(0, MAX_BAN_STRIKES - entry.count)
        };
    }

    /**
     * Lấy thông tin strikes của IP
     * @param {string} ip - Địa chỉ IP
     * @returns {object} { count, reasons, isBlocked }
     */
    static getStrikes(ip) {
        const entry = global.strikes.get(ip);
        if (!entry || Date.now() > entry.expiresAt) {
            global.strikes.delete(ip);
            return {
                count: 0,
                reasons: [],
                isBlocked: false
            };
        }
        return {
            count: entry.count,
            reasons: entry.reasons.slice(-5), // Chỉ trả 5 lý do gần nhất
            isBlocked: entry.count >= MAX_BAN_STRIKES,
            firstStrike: entry.firstStrike,
            lastStrike: entry.lastStrike
        };
    }

    // ============================================================
    // IP BAN
    // ============================================================
    
    /**
     * Kiểm tra IP có đang bị ban không
     * @param {string} ip - Địa chỉ IP
     * @returns {boolean} true nếu đang bị ban
     */
    static isIPBanned(ip) {
        const banData = global.bannedIPs.get(ip);
        if (!banData) return false;
        
        if (Date.now() > banData.until) {
            global.bannedIPs.delete(ip);
            return false;
        }
        
        return true;
    }

    /**
     * Ban một IP
     * @param {string} ip - Địa chỉ IP
     * @param {number} durationMs - Thời gian ban (ms)
     * @param {string} reason - Lý do ban
     * @returns {object} Thông tin ban
     */
    static banIP(ip, durationMs = BAN_DURATION, reason = '') {
        const banData = {
            bannedAt: Date.now(),
            until: Date.now() + durationMs,
            duration: durationMs,
            reason: reason
        };
        
        global.bannedIPs.set(ip, banData);
        
        // Log ban
        console.log(`[SECURITY] Banned IP: ${ip} for ${Math.round(durationMs / 1000)}s. Reason: ${reason}`);
        
        return banData;
    }

    /**
     * Unban một IP
     * @param {string} ip - Địa chỉ IP
     * @returns {boolean} true nếu IP đã bị ban và được unban
     */
    static unbanIP(ip) {
        const wasBanned = global.bannedIPs.has(ip);
        global.bannedIPs.delete(ip);
        return wasBanned;
    }

    /**
     * Lấy thông tin ban của IP
     * @param {string} ip - Địa chỉ IP
     * @returns {object|null} Thông tin ban hoặc null
     */
    static getBanInfo(ip) {
        const banData = global.bannedIPs.get(ip);
        if (!banData) return null;
        
        if (Date.now() > banData.until) {
            global.bannedIPs.delete(ip);
            return null;
        }
        
        return {
            ...banData,
            remaining: banData.until - Date.now()
        };
    }

    // ============================================================
    // NONCE (ANTI-REPLAY)
    // ============================================================
    
    /**
     * Tạo một nonce mới
     * @returns {string} Nonce
     */
    static generateNonce() {
        return Crypto.generateRandomString(40);
    }

    /**
     * Kiểm tra và đánh dấu nonce đã sử dụng
     * @param {string} nonce - Nonce cần kiểm tra
     * @returns {boolean} true nếu nonce hợp lệ và chưa được sử dụng
     */
    static validateNonce(nonce) {
        if (!nonce || typeof nonce !== 'string' || nonce.length < 8) {
            return false;
        }
        
        // Kiểm tra nonce đã tồn tại chưa
        if (global.nonces.has(nonce)) {
            return false; // Nonce đã được sử dụng
        }
        
        // Đánh dấu nonce đã sử dụng
        global.nonces.set(nonce, {
            usedAt: Date.now(),
            expiresAt: Date.now() + NONCE_TTL
        });
        
        return true;
    }

    /**
     * Kiểm tra nonce đã tồn tại chưa (không đánh dấu)
     * @param {string} nonce - Nonce cần kiểm tra
     * @returns {boolean} true nếu nonce chưa được sử dụng
     */
    static isNonceValid(nonce) {
        if (!nonce) return false;
        return !global.nonces.has(nonce);
    }

    // ============================================================
    // CHALLENGE SYSTEM
    // ============================================================
    
    /**
     * Tạo một challenge mới
     * Hỗ trợ nhiều loại: math, pattern, reverse
     * @returns {object} { question, token, type, expiresIn }
     */
    static generateChallenge() {
        const types = ['math', 'pattern', 'reverse'];
        const type = types[Math.floor(Math.random() * types.length)];
        
        let question = '';
        let answer = '';
        
        switch (type) {
            case 'math': {
                const ops = ['+', '-', '*'];
                const op = ops[Math.floor(Math.random() * ops.length)];
                let a, b;
                
                switch (op) {
                    case '+':
                        a = Math.floor(Math.random() * 50) + 1;
                        b = Math.floor(Math.random() * 50) + 1;
                        answer = a + b;
                        break;
                    case '-':
                        a = Math.floor(Math.random() * 50) + 25;
                        b = Math.floor(Math.random() * 25) + 1;
                        answer = a - b;
                        break;
                    case '*':
                        a = Math.floor(Math.random() * 12) + 2;
                        b = Math.floor(Math.random() * 12) + 2;
                        answer = a * b;
                        break;
                }
                question = `${a} ${op} ${b} = ?`;
                break;
            }
            
            case 'pattern': {
                const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
                answer = '';
                for (let i = 0; i < 6; i++) {
                    answer += chars[Math.floor(Math.random() * chars.length)];
                }
                question = `Type this code exactly: ${answer}`;
                break;
            }
            
            case 'reverse': {
                const words = ['apex', 'secure', 'verify', 'phantom', 'cipher', 'gateway', 'shield', 'crypto'];
                const word = words[Math.floor(Math.random() * words.length)];
                answer = word;
                const reversed = word.split('').reverse().join('');
                question = `What is the reverse of "${reversed}"? (lowercase)`;
                break;
            }
        }

        // Tạo token cho challenge
        const token = Crypto.generateRandomString(40);
        
        // Lưu challenge
        const challenge = {
            token: token,
            question: question,
            answer: answer.toString().toLowerCase().trim(),
            type: type,
            createdAt: Date.now(),
            attempts: 0,
            maxAttempts: MAX_CHALLENGE_ATTEMPTS,
            solved: false
        };
        
        global.challenges.set(token, challenge);

        return {
            question: question,
            token: token,
            type: type,
            expiresIn: Math.floor(CHALLENGE_TTL / 1000)
        };
    }

    /**
     * Xác thực challenge
     * @param {string} token - Token của challenge
     * @param {string} answer - Câu trả lời
     * @param {string} ip - IP của client (để strike nếu sai)
     * @returns {object} { success, verified, error }
     */
    static verifyChallenge(token, answer, ip) {
        const challenge = global.challenges.get(token);
        
        // Kiểm tra challenge tồn tại
        if (!challenge) {
            return {
                success: false,
                verified: false,
                error: 'Challenge not found'
            };
        }

        // Kiểm tra challenge đã được giải chưa
        if (challenge.solved) {
            global.challenges.delete(token);
            return {
                success: false,
                verified: false,
                error: 'Challenge already used'
            };
        }

        // Kiểm tra hết hạn
        if (Date.now() - challenge.createdAt > CHALLENGE_TTL) {
            global.challenges.delete(token);
            return {
                success: false,
                verified: false,
                error: 'Challenge expired'
            };
        }

        // Tăng số lần thử
        challenge.attempts++;
        
        // Chuẩn hóa câu trả lời
        const userAnswer = (answer || '').toString().toLowerCase().trim();
        const correctAnswer = challenge.answer;
        
        // Kiểm tra đáp án
        if (userAnswer !== correctAnswer) {
            // Kiểm tra đã vượt số lần thử tối đa
            if (challenge.attempts >= challenge.maxAttempts) {
                global.challenges.delete(token);
                
                // Strike IP
                if (ip) {
                    Security.addStrike(ip, 'Challenge max attempts exceeded');
                }
                
                return {
                    success: false,
                    verified: false,
                    error: 'Maximum attempts reached',
                    locked: true
                };
            }
            
            // Còn lượt thử
            return {
                success: false,
                verified: false,
                error: 'Wrong answer',
                attemptsLeft: challenge.maxAttempts - challenge.attempts
            };
        }

        // Đánh dấu đã giải
        challenge.solved = true;
        
        // Xóa challenge (mỗi challenge chỉ dùng 1 lần)
        global.challenges.delete(token);
        
        return {
            success: true,
            verified: true
        };
    }

    // ============================================================
    // ACCESS TOKEN (SHORT-LIVED)
    // ============================================================
    
    /**
     * Tạo access token ngắn hạn
     * Dùng sau khi đã xác thực (qua key hoặc challenge)
     * @param {object} sessionData - Dữ liệu session
     * @returns {object} { accessToken, expiresIn, nonce }
     */
    static generateAccessToken(sessionData = {}) {
        const token = Crypto.generateRandomString(64);
        const nonce = Security.generateNonce();
        const now = Date.now();
        
        const accessToken = {
            token: token,
            sessionId: sessionData.sessionId || null,
            keyId: sessionData.keyId || null,
            tier: sessionData.tier || 'standard',
            hwid: sessionData.hwid || null,
            fingerprint: sessionData.fingerprint || null,
            issuedAt: now,
            expiresAt: now + ACCESS_TOKEN_TTL,
            nonce: nonce,
            used: false,
            purpose: sessionData.purpose || 'script_access'
        };
        
        global.accessTokens.set(token, accessToken);
        
        return {
            accessToken: token,
            expiresIn: Math.floor(ACCESS_TOKEN_TTL / 1000),
            expiresAt: now + ACCESS_TOKEN_TTL,
            nonce: nonce
        };
    }

    /**
     * Xác thực access token
     * @param {string} token - Access token
     * @param {string} hwid - HWID của client (tùy chọn)
     * @param {string} nonce - Nonce đi kèm
     * @returns {object} { valid, data, error }
     */
    static validateAccessToken(token, hwid, nonce) {
        if (!token) {
            return { valid: false, error: 'No token provided' };
        }
        
        const accessToken = global.accessTokens.get(token);
        
        // Kiểm tra tồn tại
        if (!accessToken) {
            return { valid: false, error: 'Token not found' };
        }

        // Kiểm tra hết hạn
        if (Date.now() > accessToken.expiresAt) {
            global.accessTokens.delete(token);
            return { valid: false, error: 'Token expired' };
        }

        // Kiểm tra đã sử dụng chưa (one-time use)
        if (accessToken.used) {
            global.accessTokens.delete(token);
            return { valid: false, error: 'Token already used' };
        }

        // Kiểm tra nonce (anti-replay)
        if (nonce && nonce !== accessToken.nonce) {
            global.accessTokens.delete(token);
            return { valid: false, error: 'Nonce mismatch' };
        }

        // Kiểm tra HWID binding (nếu có)
        if (accessToken.hwid && hwid) {
            // Chuẩn hóa HWID để so sánh
            let clientHwid = hwid;
            try {
                const parsed = JSON.parse(hwid);
                clientHwid = parsed.hwid || hwid;
            } catch {
                // Giữ nguyên
            }
            
            if (accessToken.hwid !== clientHwid) {
                return { valid: false, error: 'HWID mismatch' };
            }
        }

        // Đánh dấu đã sử dụng (one-time use)
        accessToken.used = true;
        accessToken.usedAt = Date.now();
        global.accessTokens.set(token, accessToken);
        
        return {
            valid: true,
            data: {
                sessionId: accessToken.sessionId,
                tier: accessToken.tier,
                purpose: accessToken.purpose
            }
        };
    }

    /**
     * Thu hồi access token
     * @param {string} token - Access token cần thu hồi
     * @returns {boolean} true nếu token tồn tại và đã bị thu hồi
     */
    static revokeAccessToken(token) {
        const existed = global.accessTokens.has(token);
        global.accessTokens.delete(token);
        return existed;
    }

    // ============================================================
    // SESSION MANAGEMENT
    // ============================================================
    
    /**
     * Tạo session mới
     * @param {object} data - Dữ liệu session
     * @returns {object} Session object
     */
    static createSession(data = {}) {
        const sessionId = Crypto.generateRandomString(48);
        const now = Date.now();
        
        const session = {
            sessionId: sessionId,
            keyId: data.keyId || null,
            hwid: data.hwid || null,
            fingerprint: data.fingerprint || null,
            tier: data.tier || 'standard',
            issuedAt: now,
            lastSeen: now,
            expiresAt: now + SESSION_TTL,
            active: true,
            metadata: data.metadata || {}
        };
        
        global.sessions.set(sessionId, session);
        
        return session;
    }

    /**
     * Lấy session theo ID
     * @param {string} sessionId - ID của session
     * @returns {object|null} Session hoặc null
     */
    static getSession(sessionId) {
        if (!sessionId) return null;
        
        const session = global.sessions.get(sessionId);
        
        if (!session) return null;
        
        // Kiểm tra hết hạn
        if (Date.now() > session.expiresAt) {
            global.sessions.delete(sessionId);
            return null;
        }
        
        // Kiểm tra active
        if (!session.active) return null;
        
        // Cập nhật lastSeen
        session.lastSeen = Date.now();
        global.sessions.set(sessionId, session);
        
        return session;
    }

    /**
     * Vô hiệu hóa session
     * @param {string} sessionId - ID của session
     * @returns {boolean} true nếu session tồn tại và đã bị vô hiệu hóa
     */
    static invalidateSession(sessionId) {
        const session = global.sessions.get(sessionId);
        if (!session) return false;
        
        session.active = false;
        session.invalidatedAt = Date.now();
        global.sessions.set(sessionId, session);
        
        return true;
    }

    // ============================================================
    // RISK SCORING
    // ============================================================
    
    /**
     * Tính điểm rủi ro cho request
     * Điểm càng cao = càng nghi ngờ
     * @param {object} req - Request object
     * @returns {object} { score, level, reasons }
     */
    static calculateRiskScore(req) {
        const ip = Security.getClientIP(req);
        let score = 0;
        const reasons = [];

        // 1. Kiểm tra IP có bị ban không (điểm tối đa nếu có)
        if (Security.isIPBanned(ip)) {
            return {
                score: 100,
                level: 'critical',
                reasons: ['IP is banned']
            };
        }

        // 2. Kiểm tra strikes
        const strikes = Security.getStrikes(ip);
        if (strikes.count > 0) {
            score += strikes.count * 15;
            reasons.push(`Strikes: ${strikes.count}`);
        }

        // 3. Kiểm tra gần rate limit
        const rateInfo = Security.getRateLimitInfo(`risk:${ip}`);
        if (rateInfo.count > RATE_LIMIT_MAX * 0.7) {
            score += 10;
            reasons.push('Near rate limit');
        }

        // 4. Kiểm tra User-Agent
        const ua = (req.headers['user-agent'] || '').toLowerCase();
        
        // User-Agent rỗng hoặc quá ngắn
        if (!ua || ua.length < 10) {
            score += 25;
            reasons.push('Suspicious or missing User-Agent');
        }
        
        // Các HTTP client library phổ biến (không phải browser/executor)
        const httpClientPatterns = [
            'python-requests', 'python-urllib', 'curl/', 'wget/',
            'go-http-client', 'axios/', 'node-fetch', 'okhttp/',
            'libwww-perl', 'java/', 'scrapy', 'httpclient',
            'aiohttp', 'httpx', 'got (https'
        ];
        
        for (const pattern of httpClientPatterns) {
            if (ua.includes(pattern)) {
                score += 20;
                reasons.push(`HTTP client detected: ${pattern}`);
                break;
            }
        }

        // 5. Kiểm tra headers cần thiết
        if (!req.headers['accept']) {
            score += 5;
            reasons.push('Missing Accept header');
        }
        
        if (!req.headers['accept-language'] && !req.headers['accept-encoding']) {
            score += 5;
            reasons.push('Minimal headers');
        }

        // 6. Kiểm tra request burst (nhiều request trong thời gian ngắn)
        const now = Date.now();
        let requestLog = global.requestLog.get(ip) || [];
        
        // Lọc các request trong 10 giây gần đây
        const recentRequests = requestLog.filter(t => now - t < 10000);
        
        if (recentRequests.length > 20) {
            score += 30;
            reasons.push(`Request burst: ${recentRequests.length} requests in 10s`);
        } else if (recentRequests.length > 10) {
            score += 15;
            reasons.push(`High request rate: ${recentRequests.length} requests in 10s`);
        } else if (recentRequests.length > 5) {
            score += 5;
            reasons.push(`Elevated request rate: ${recentRequests.length} requests in 10s`);
        }
        
        // Cập nhật request log
        requestLog.push(now);
        // Giới hạn log
        if (requestLog.length > 200) {
            requestLog = requestLog.slice(-100);
        }
        global.requestLog.set(ip, requestLog);

        // 7. Kiểm tra content-type không khớp
        const contentType = (req.headers['content-type'] || '').toLowerCase();
        if (req.method === 'POST' && !contentType.includes('application/json')) {
            score += 5;
            reasons.push('Non-JSON POST request');
        }

        // Chuẩn hóa score
        score = Math.min(score, 100);
        
        // Xác định mức độ rủi ro
        let level = 'low';
        if (score >= 70) level = 'critical';
        else if (score >= 50) level = 'high';
        else if (score >= 25) level = 'medium';
        
        return {
            score: score,
            level: level,
            reasons: reasons,
            ip: ip
        };
    }

    /**
     * Kiểm tra xem request có nên bị chặn dựa trên risk score không
     * @param {object} req - Request object
     * @param {number} threshold - Ngưỡng chặn (mặc định 60)
     * @returns {object} { blocked, risk }
     */
    static shouldBlock(req, threshold = 60) {
        const risk = Security.calculateRiskScore(req);
        
        if (risk.score >= threshold) {
            const ip = Security.getClientIP(req);
            Security.addStrike(ip, `High risk score: ${risk.score} - ${risk.reasons.join(', ')}`);
            return { blocked: true, risk: risk };
        }
        
        return { blocked: false, risk: risk };
    }

    // ============================================================
    // REQUEST SIGNATURE
    // ============================================================
    
    /**
     * Tạo chữ ký cho request payload
     * @param {object|string} payload - Dữ liệu cần ký
     * @param {string} secret - Khóa bí mật
     * @returns {string} Chữ ký HMAC-SHA256
     */
    static generateSignature(payload, secret) {
        const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
        return Crypto.hmacSHA256(data, secret);
    }

    /**
     * Xác thực chữ ký
     * @param {object|string} payload - Dữ liệu đã ký
     * @param {string} signature - Chữ ký
     * @param {string} secret - Khóa bí mật
     * @returns {boolean} true nếu chữ ký hợp lệ
     */
    static verifySignature(payload, signature, secret) {
        if (!payload || !signature || !secret) return false;
        const expected = Security.generateSignature(payload, secret);
        return Crypto.timingSafeEqual(expected, signature);
    }

    // ============================================================
    // SECURITY HEADERS
    // ============================================================
    
    /**
     * Thiết lập security headers cho response
     * @param {object} res - Response object
     */
    static setSecurityHeaders(res) {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-XSS-Protection', '1; mode=block');
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
        res.setHeader('X-Download-Options', 'noopen');
        
        // Xóa header tiết lộ công nghệ
        res.removeHeader('X-Powered-By');
        res.removeHeader('Server');
    }

    // ============================================================
    // STATISTICS
    // ============================================================
    
    /**
     * Lấy thống kê bảo mật
     * @returns {object} Thống kê
     */
    static getStats() {
        return {
            rateLimited: global.rateLimits.size,
            bannedIPs: global.bannedIPs.size,
            activeChallenges: global.challenges.size,
            activeAccessTokens: global.accessTokens.size,
            activeSessions: global.sessions.size,
            totalStrikes: [...global.strikes.values()].reduce((sum, s) => sum + s.count, 0),
            nonceCount: global.nonces.size,
            requestLogSize: global.requestLog.size
        };
    }
}

export default Security;
