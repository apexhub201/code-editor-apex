// lib/rate-limit.js - Advanced Rate Limiting
export default class RateLimiter {
    constructor(options = {}) {
        this.maxRequests = options.maxRequests || 60;
        this.windowMs = options.windowMs || 60000;
        this.cleanupInterval = options.cleanupInterval || 300000;
        this.store = new Map();
        
        // Tự động cleanup
        this.cleanupTimer = setInterval(() => this.cleanup(), this.cleanupInterval);
    }

    check(key) {
        const now = Date.now();
        let record = this.store.get(key);

        if (!record || now > record.windowEnd) {
            record = {
                count: 0,
                windowStart: now,
                windowEnd: now + this.windowMs,
                history: []
            };
            this.store.set(key, record);
        }

        record.count++;
        record.history.push({
            timestamp: now,
            count: record.count
        });

        // Chỉ giữ 100 bản ghi history gần nhất
        if (record.history.length > 100) {
            record.history = record.history.slice(-100);
        }

        const allowed = record.count <= this.maxRequests;
        const retryAfter = record.windowEnd - now;

        // Block nếu vượt quá nhiều
        if (record.count > this.maxRequests * 2) {
            return {
                allowed: false,
                retryAfter: this.windowMs * 2,
                blocked: true,
                reason: 'Excessive requests'
            };
        }

        return {
            allowed,
            retryAfter: allowed ? 0 : retryAfter,
            remaining: Math.max(0, this.maxRequests - record.count),
            reset: record.windowEnd
        };
    }

    getStats(key) {
        const record = this.store.get(key);
        if (!record) {
            return {
                total: 0,
                remaining: this.maxRequests,
                reset: Date.now() + this.windowMs
            };
        }

        return {
            total: record.count,
            remaining: Math.max(0, this.maxRequests - record.count),
            reset: record.windowEnd,
            history: record.history.slice(-10) // 10 request gần nhất
        };
    }

    reset(key) {
        this.store.delete(key);
    }

    cleanup() {
        const now = Date.now();
        for (const [key, record] of this.store.entries()) {
            if (now > record.windowEnd + this.windowMs) {
                this.store.delete(key);
            }
        }
    }

    destroy() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }
        this.store.clear();
    }
}
