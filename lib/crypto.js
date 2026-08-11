// lib/crypto.js
import crypto from 'crypto';

class Crypto {
    static generateRandomString(length = 32) {
        return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').substring(0, length);
    }

    static encrypt(data, key) {
        const keyBuffer = Buffer.from(key.padEnd(32, '0').substring(0, 32), 'utf8');
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', keyBuffer, iv);
        let encrypted = cipher.update(data, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const checksum = crypto.createHash('sha256').update(encrypted).digest('hex');
        return { data: encrypted, iv: iv.toString('hex'), checksum };
    }

    static hashString(data) {
        return crypto.createHash('sha256').update(data).digest('hex');
    }

    static calculateChecksum(data) {
        let checksum = 0;
        for (let i = 0; i < data.length; i++) {
            checksum = (checksum + data.charCodeAt(i)) % 65536;
        }
        return checksum;
    }
}

export default Crypto;
