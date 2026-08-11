// lib/crypto.js
import crypto from 'crypto';

class Crypto {
    static randomStr(length = 32) {
        return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
    }
    static hash(data) {
        return crypto.createHash('sha256').update(data).digest('hex');
    }
    static encrypt(data, key) {
        const keyBuf = Buffer.from(key.padEnd(32, '0').slice(0, 32));
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', keyBuf, iv);
        let enc = cipher.update(data, 'utf8', 'hex');
        enc += cipher.final('hex');
        return { data: enc, iv: iv.toString('hex'), checksum: Crypto.hash(enc) };
    }
}
export default Crypto;
