// lib/challenges.js - Challenge management with Firestore
import FirebaseManager from './firebase.js';
import Crypto from './crypto.js';

export class ChallengeManager {
    static COLLECTION = 'challenges';
    static TTL = 60000; // 60 seconds
    static MAX_ATTEMPTS = 3;
    
    /**
     * Generate a math challenge
     */
    static generateMathChallenge() {
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
        
        return {
            question: `${num1} ${op} ${num2} = ?`,
            answer: answer.toString(),
            type: 'math'
        };
    }
    
    /**
     * Create a new challenge
     */
    static async createChallenge(ipHash = null, keyId = null) {
        const { question, answer, type } = ChallengeManager.generateMathChallenge();
        const token = Crypto.randomString(32);
        const tokenHash = Crypto.hash256(token);
        const answerHash = Crypto.hash(answer);
        const now = Date.now();
        
        const challengeData = {
            tokenHash,
            answerHash,
            question,
            type,
            createdAt: now,
            expiresAt: now + ChallengeManager.TTL,
            attempts: 0,
            maxAttempts: ChallengeManager.MAX_ATTEMPTS,
            used: false,
            ipHash,
            keyId
        };
        
        // Store in Firestore
        if (FirebaseManager.isAvailable()) {
            try {
                const db = FirebaseManager.getDB();
                await db.collection(ChallengeManager.COLLECTION).doc(tokenHash).set(challengeData);
            } catch (error) {
                console.error('[CHALLENGE] Create error:', error.message);
            }
        }
        
        return {
            token,
            tokenHash,
            question,
            type
        };
    }
    
    /**
     * Verify a challenge answer
     */
    static async verifyChallenge(token, answer) {
        if (!token || !answer) {
            return { valid: false, reason: 'MISSING_FIELDS' };
        }
        
        const tokenHash = Crypto.hash256(token);
        const now = Date.now();
        
        // Check Firestore
        if (FirebaseManager.isAvailable()) {
            try {
                const db = FirebaseManager.getDB();
                const docRef = db.collection(ChallengeManager.COLLECTION).doc(tokenHash);
                
                const result = await db.runTransaction(async (transaction) => {
                    const doc = await transaction.get(docRef);
                    
                    if (!doc.exists) {
                        return { valid: false, reason: 'INVALID_CHALLENGE' };
                    }
                    
                    const challenge = doc.data();
                    
                    if (challenge.used) {
                        return { valid: false, reason: 'CHALLENGE_ALREADY_USED' };
                    }
                    
                    if (now > challenge.expiresAt) {
                        return { valid: false, reason: 'CHALLENGE_EXPIRED' };
                    }
                    
                    const newAttempts = challenge.attempts + 1;
                    const answerCorrect = Crypto.timingSafeEqual(
                        Crypto.hash(answer.toString().trim()),
                        challenge.answerHash
                    );
                    
                    if (!answerCorrect) {
                        if (newAttempts >= challenge.maxAttempts) {
                            transaction.update(docRef, {
                                attempts: newAttempts,
                                used: true
                            });
                            return { valid: false, reason: 'MAX_ATTEMPTS_REACHED' };
                        }
                        
                        transaction.update(docRef, { attempts: newAttempts });
                        return {
                            valid: false,
                            reason: 'WRONG_ANSWER',
                            attemptsLeft: challenge.maxAttempts - newAttempts
                        };
                    }
                    
                    transaction.update(docRef, {
                        attempts: newAttempts,
                        used: true,
                        verifiedAt: now
                    });
                    
                    return { valid: true };
                });
                
                return result;
                
            } catch (error) {
                console.error('[CHALLENGE] Verify error:', error.message);
                return { valid: false, reason: 'INTERNAL_ERROR' };
            }
        }
        
        return { valid: false, reason: 'CHALLENGE_DISABLED' };
    }
    
    /**
     * Clean up expired challenges
     */
    static async cleanupExpiredChallenges() {
        if (FirebaseManager.isAvailable() && Math.random() < 0.1) {
            try {
                const db = FirebaseManager.getDB();
                const expired = await db.collection(ChallengeManager.COLLECTION)
                    .where('expiresAt', '<', Date.now() - 3600000)
                    .limit(100)
                    .get();
                
                const batch = db.batch();
                expired.docs.forEach(doc => batch.delete(doc.ref));
                await batch.commit();
            } catch (error) {
                console.error('[CHALLENGE] Cleanup error:', error.message);
            }
        }
    }
}

// Periodic cleanup
setInterval(() => ChallengeManager.cleanupExpiredChallenges(), 120000);
