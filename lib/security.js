// lib/security.js - Security Utilities (Refactored)
import crypto from 'crypto';

export default class Security {
    /**
     * Generate math challenge (cryptographically random)
     */
    static generateChallenge() {
        const operations = ['+', '-', '*'];
        const op = operations[crypto.randomInt(0, 3)];
        let num1, num2, answer;
        
        switch (op) {
            case '+':
                num1 = crypto.randomInt(1, 50);
                num2 = crypto.randomInt(1, 50);
                answer = num1 + num2;
                break;
            case '-':
                num1 = crypto.randomInt(25, 75);
                num2 = crypto.randomInt(1, 25);
                answer = num1 - num2;
                break;
            case '*':
                num1 = crypto.randomInt(1, 12);
                num2 = crypto.randomInt(1, 12);
                answer = num1 * num2;
                break;
            default:
                num1 = crypto.randomInt(1, 50);
                num2 = crypto.randomInt(1, 50);
                answer = num1 + num2;
        }
        
        const token = crypto.randomBytes(32).toString('hex');
        
        return {
            question: `${num1} ${op} ${num2} = ?`,
            answer: answer.toString(),
            token,
            type: 'math'
        };
    }
    
    /**
     * Get client IP from Vercel request
     */
    static getClientIP(req) {
        const forwarded = req.headers['x-forwarded-for'];
        if (forwarded) {
            return forwarded.split(',')[0].trim();
        }
        return req.headers['x-real-ip'] || req.socket?.remoteAddress || '0.0.0.0';
    }
    
    /**
     * Generate session token
     */
    static generateSessionToken() {
        return crypto.randomBytes(48).toString('hex');
    }
}
