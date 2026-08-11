// lib/crypto.js — Enhanced Crypto Utilities v4
// ============================================================
// Cung cấp các hàm mã hóa, hash, HMAC, timing-safe compare
// ============================================================

import crypto from 'crypto';

export class Crypto {
    /**
     * Tạo chuỗi ngẫu nhiên với độ dài chỉ định
     * @param {number} length - Độ dài chuỗi (mặc định 32)
     * @returns {string} Chuỗi hex ngẫu nhiên
     */
    static generateRandomString(length = 32) {
        return crypto.randomBytes(Math.ceil(length / 2))
            .toString('hex')
            .substring(0, length);
    }

    /**
     * Tạo bộ key và IV cho mã hóa AES-256-CBC
     * @returns {object} { key, iv, timestamp }
     */
    static generateKey() {
        return {
            key: Crypto.generateRandomString(32),
            iv: Crypto.generateRandomString(16),
            timestamp: Date.now()
        };
    }

    /**
     * Mã hóa dữ liệu bằng AES-256-CBC
     * @param {string} data - Dữ liệu cần mã hóa
     * @param {string} key - Khóa mã hóa (tối đa 32 bytes)
     * @returns {object} { data, iv, checksum }
     */
    static encrypt(data, key) {
        // Đảm bảo key đúng 32 bytes
        const keyBuffer = Buffer.from(key.padEnd(32, '0').substring(0, 32), 'utf8');
        const iv = crypto.randomBytes(16);
        
        const cipher = crypto.createCipheriv('aes-256-cbc', keyBuffer, iv);
        let encrypted = cipher.update(data, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        const checksum = Crypto.hashString(encrypted);
        
        return {
            data: encrypted,
            iv: iv.toString('hex'),
            checksum: checksum
        };
    }

    /**
     * Giải mã dữ liệu bằng AES-256-CBC
     * @param {string} encryptedData - Dữ liệu đã mã hóa (hex)
     * @param {string} key - Khóa giải mã
     * @param {string} iv - IV (hex)
     * @returns {string} Dữ liệu đã giải mã
     */
    static decrypt(encryptedData, key, iv) {
        const keyBuffer = Buffer.from(key.padEnd(32, '0').substring(0, 32), 'utf8');
        const ivBuffer = Buffer.from(iv, 'hex');
        
        const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuffer, ivBuffer);
        let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
    }

    /**
     * Mã hóa đơn giản bằng XOR (cho các trường hợp nhẹ)
     * @param {string} data - Dữ liệu cần mã hóa
     * @param {string} key - Khóa XOR
     * @returns {object} { data, checksum }
     */
    static encryptXOR(data, key) {
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

    /**
     * Giải mã XOR
     * @param {number[]} encryptedData - Mảng bytes đã mã hóa
     * @param {string} key - Khóa XOR
     * @returns {string} Dữ liệu đã giải mã
     */
    static decryptXOR(encryptedData, key) {
        const decrypted = [];
        for (let i = 0; i < encryptedData.length; i++) {
            const byte = encryptedData[i];
            const keyChar = key.charCodeAt(i % key.length);
            decrypted.push(String.fromCharCode((byte ^ keyChar) & 0xFF));
        }
        return decrypted.join('');
    }

    /**
     * Tính SHA-256 hash
     * @param {string} data - Dữ liệu cần hash
     * @returns {string} Hash hex
     */
    static hashString(data) {
        return crypto.createHash('sha256').update(data).digest('hex');
    }

    /**
     * Tính HMAC-SHA256
     * @param {string} data - Dữ liệu
     * @param {string} secret - Khóa bí mật
     * @returns {string} HMAC hex
     */
    static hmacSHA256(data, secret) {
        return crypto
            .createHmac('sha256', secret)
            .update(data)
            .digest('hex');
    }

    /**
     * So sánh timing-safe (chống timing attack)
     * @param {string} a - Chuỗi thứ nhất
     * @param {string} b - Chuỗi thứ hai
     * @returns {boolean} true nếu bằng nhau
     */
    static timingSafeEqual(a, b) {
        if (a.length !== b.length) return false;
        try {
            return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
        } catch {
            return false;
        }
    }

    /**
     * Tính checksum đơn giản
     * @param {string} data - Dữ liệu
     * @returns {number} Checksum (0-65535)
     */
    static calculateChecksum(data) {
        let checksum = 0;
        for (let i = 0; i < data.length; i++) {
            checksum = (checksum + data.charCodeAt(i)) % 65536;
        }
        return checksum;
    }

    /**
     * Tạo token với tiền tố tùy chọn
     * @param {string} prefix - Tiền tố
     * @returns {string} Token
     */
    static generateToken(prefix = '') {
        return prefix + Crypto.generateRandomString(64);
    }

    /**
     * Mã hóa Base64 an toàn cho URL
     * @param {string} data - Dữ liệu
     * @returns {string} Base64 URL-safe
     */
    static base64UrlEncode(data) {
        return Buffer.from(data)
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    }

    /**
     * Giải mã Base64 URL-safe
     * @param {string} encoded - Dữ liệu đã mã hóa
     * @returns {string} Dữ liệu gốc
     */
    static base64UrlDecode(encoded) {
        let base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
        while (base64.length % 4) base64 += '=';
        return Buffer.from(base64, 'base64').toString('utf8');
    }
}

export default Crypto;
