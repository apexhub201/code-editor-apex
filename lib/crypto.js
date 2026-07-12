// lib/crypto.js - Encryption Utilities

export class Crypto {
    static generateRandomString(length = 32) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    static generateKey() {
        return {
            key: Crypto.generateRandomString(32),
            iv: Crypto.generateRandomString(16),
            timestamp: Date.now()
        };
    }

    static encrypt(data, key) {
        if (typeof data === 'string') {
            const encrypted = [];
            for (let i = 0; i < data.length; i++) {
                const charCode = data.charCodeAt(i);
                const keyChar = key.charCodeAt(i % key.length);
                encrypted.push((charCode ^ keyChar) & 0xFF);
            }
            return {
                data: encrypted,
                checksum: Crypto.calculateChecksum(data)
            };
        }
        return null;
    }

    static decrypt(encryptedData, key) {
        if (Array.isArray(encryptedData)) {
            const decrypted = [];
            for (let i = 0; i < encryptedData.length; i++) {
                const byte = encryptedData[i];
                const keyChar = key.charCodeAt(i % key.length);
                decrypted.push(String.fromCharCode((byte ^ keyChar) & 0xFF));
            }
            return decrypted.join('');
        }
        return null;
    }

    static calculateChecksum(data) {
        let checksum = 0;
        for (let i = 0; i < data.length; i++) {
            checksum = (checksum + data.charCodeAt(i)) % 65536;
        }
        return checksum;
    }

    static generateToken(prefix = '') {
        return prefix + Crypto.generateRandomString(64);
    }
}

export default Crypto;
