// lib/security.js - Security Functions

class Security {
    static generateChallenge() {
        const operations = ['+', '-', '*'];
        const op = operations[Math.floor(Math.random() * operations.length)];
        let num1, num2, answer;
        
        switch(op) {
            case '+':
                num1 = Math.floor(Math.random() * 50) + 1;
                num2 = Math.floor(Math.random() * 50) + 1;
                answer = num1 + num2;
                break;
            case '-':
                num1 = Math.floor(Math.random() * 50) + 25;
                num2 = Math.floor(Math.random() * 25) + 1;
                answer = num1 - num2;
                break;
            case '*':
                num1 = Math.floor(Math.random() * 12) + 1;
                num2 = Math.floor(Math.random() * 12) + 1;
                answer = num1 * num2;
                break;
        }
        
        const token = require('./crypto.js').generateRandomString(32);
        
        return {
            question: `${num1} ${op} ${num2} = ?`,
            answer: answer,
            token: token,
            type: 'math'
        };
    }

    static checkRateLimit(ip, limit = 60, windowMs = 60000) {
        global.rateLimits = global.rateLimits || {};
        const now = Date.now();
        
        if (!global.rateLimits[ip]) {
            global.rateLimits[ip] = { count: 0, resetTime: now + windowMs };
        }
        
        if (now > global.rateLimits[ip].resetTime) {
            global.rateLimits[ip] = { count: 0, resetTime: now + windowMs };
        }
        
        global.rateLimits[ip].count++;
        return global.rateLimits[ip].count <= limit;
    }

    static isIPBanned(ip) {
        global.bannedIPs = global.bannedIPs || {};
        const banData = global.bannedIPs[ip];
        if (!banData) return false;
        if (Date.now() > banData.until) {
            delete global.bannedIPs[ip];
            return false;
        }
        return true;
    }

    static banIP(ip, durationMs = 300000) {
        global.bannedIPs = global.bannedIPs || {};
        global.bannedIPs[ip] = {
            bannedAt: Date.now(),
            until: Date.now() + durationMs
        };
    }

    static getClientIP(req) {
        return req.headers['x-forwarded-for'] || 
               req.headers['x-real-ip'] || 
               req.connection?.remoteAddress || 
               'unknown';
    }

    static generateSessionToken() {
        return require('./crypto.js').generateToken('SESS_');
    }
}

module.exports = Security;
