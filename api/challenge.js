// api/challenge.js
import Security from '../lib/security.js';

global.challenges = global.challenges || {};

export default function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method === 'GET') {
        const challenge = Security.generateChallenge();
        
        global.challenges[challenge.token] = {
            ...challenge,
            createdAt: Date.now(),
            used: false,
            attempts: 0,
            maxAttempts: 3
        };
        
        return res.json({
            success: true,
            challenge: {
                question: challenge.question,
                token: challenge.token,
                type: challenge.type,
                expiresIn: 60
            }
        });
    }

    if (req.method === 'POST') {
        return handleVerifyChallenge(req, res);
    }

    return res.status(405).json({ error: 'Method not allowed' });
}

function handleVerifyChallenge(req, res) {
    try {
        const { token, answer } = req.body;
        
        if (!token || !answer) {
            return res.json({ success: false, error: 'Missing token or answer' });
        }
        
        const challenge = global.challenges[token];
        
        if (!challenge) {
            return res.json({ success: false, error: 'Challenge not found' });
        }
        
        if (challenge.used) {
            return res.json({ success: false, error: 'Challenge already used' });
        }
        
        if (Date.now() - challenge.createdAt > 60000) {
            delete global.challenges[token];
            return res.json({ success: false, error: 'Challenge expired' });
        }
        
        challenge.attempts++;
        
        const userAnswer = answer.toString().trim().toUpperCase();
        const correctAnswer = challenge.answer.toString().trim().toUpperCase();
        
        if (userAnswer !== correctAnswer) {
            if (challenge.attempts >= challenge.maxAttempts) {
                challenge.used = true;
                return res.json({ success: false, error: 'Max attempts reached', locked: true });
            }
            return res.json({ 
                success: false, 
                error: 'Wrong answer',
                attemptsLeft: challenge.maxAttempts - challenge.attempts
            });
        }
        
        challenge.used = true;
        
        return res.json({
            success: true,
            verified: true,
            message: 'Challenge passed'
        });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
}
