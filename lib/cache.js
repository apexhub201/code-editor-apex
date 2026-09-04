// ============================================================
// lib/cache.js - APEX HUB Cache System (Production Ready)
// ============================================================

const DEFAULT_CONFIG = {
    TTL: 5 * 60 * 1000,           // 5 phút fresh
    STALE_GRACE: 60 * 60 * 1000,  // 1 giờ stale grace
    MAX_ENTRIES: 500,              // Tối đa 500 entries
    CLEANUP_INTERVAL: 60 * 1000    // Cleanup mỗi 60 giây
};

class CacheSystem {
    constructor(config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        
        if (!global.__APEX_CACHE__) {
            global.__APEX_CACHE__ = {
                data: new Map(),
                pendingReads: new Map(),
                lastCleanup: Date.now()
            };
        }
        
        this.cache = global.__APEX_CACHE__;
    }

    // ============================================================
    // GET - Lấy cache nếu fresh
    // ============================================================
    get(key) {
        const now = Date.now();
        const entry = this.cache.data.get(key);
        
        if (!entry) return null;
        
        // Check if fresh
        if (now < entry.expiresAt) {
            entry.lastAccess = now;
            console.log(`[APEX CACHE] HIT ${key}`);
            return { ...entry.value, fromCache: true };
        }
        
        // Check if stale
        if (now < entry.staleUntil) {
            console.log(`[APEX CACHE] STALE ${key}`);
            return null; // Return null to trigger Firebase read, but keep stale for fallback
        }
        
        // Expired - remove
        this.cache.data.delete(key);
        console.log(`[APEX CACHE] EXPIRED ${key}`);
        return null;
    }

    // ============================================================
    // GET STALE - Lấy cache kể cả khi stale (dùng khi Firebase lỗi)
    // ============================================================
    getStale(key) {
        const now = Date.now();
        const entry = this.cache.data.get(key);
        
        if (!entry) return null;
        
        // Return if not expired
        if (now < entry.staleUntil) {
            entry.lastAccess = now;
            console.log(`[APEX CACHE] STALE_HIT ${key}`);
            return { ...entry.value, fromCache: true, stale: true };
        }
        
        // Expired - remove
        this.cache.data.delete(key);
        return null;
    }

    // ============================================================
    // SET - Lưu cache
    // ============================================================
    set(key, value, ttl = this.config.TTL) {
        const now = Date.now();
        
        this.cache.data.set(key, {
            value: value,
            createdAt: now,
            lastAccess: now,
            expiresAt: now + ttl,
            staleUntil: now + ttl + this.config.STALE_GRACE
        });
        
        this.cleanup();
        console.log(`[APEX CACHE] SET ${key}`);
    }

    // ============================================================
    // DELETE - Xóa cache
    // ============================================================
    delete(key) {
        this.cache.data.delete(key);
        this.cache.pendingReads.delete(key);
        console.log(`[APEX CACHE] DELETE ${key}`);
    }

    // ============================================================
    // CLEAR - Xóa tất cả cache
    // ============================================================
    clear() {
        this.cache.data.clear();
        this.cache.pendingReads.clear();
        console.log(`[APEX CACHE] CLEAR ALL`);
    }

    // ============================================================
    // CLEAR PREFIX - Xóa cache theo prefix
    // ============================================================
    clearPrefix(prefix) {
        for (const key of this.cache.data.keys()) {
            if (key.startsWith(prefix)) {
                this.cache.data.delete(key);
            }
        }
        console.log(`[APEX CACHE] CLEAR PREFIX ${prefix}`);
    }

    // ============================================================
    // CACHED - Decorator cho async function
    // ============================================================
    async cached(key, fn, ttl = this.config.TTL) {
        // Check fresh cache
        const fresh = this.get(key);
        if (fresh) return fresh;
        
        // Check pending reads
        if (this.cache.pendingReads.has(key)) {
            console.log(`[APEX CACHE] PENDING ${key}`);
            return await this.cache.pendingReads.get(key);
        }
        
        // Create new read
        const readPromise = (async () => {
            try {
                const result = await fn();
                if (result !== null && result !== undefined) {
                    this.set(key, result, ttl);
                }
                return result;
            } catch (error) {
                console.error(`[APEX CACHE] ERROR ${key}:`, error.message);
                throw error;
            } finally {
                this.cache.pendingReads.delete(key);
            }
        })();
        
        this.cache.pendingReads.set(key, readPromise);
        return await readPromise;
    }

    // ============================================================
    // CLEANUP - Dọn dẹp entries hết hạn
    // ============================================================
    cleanup() {
        const now = Date.now();
        
        // Chỉ cleanup mỗi CLEANUP_INTERVAL
        if (now - this.cache.lastCleanup < this.config.CLEANUP_INTERVAL) {
            return;
        }
        
        this.cache.lastCleanup = now;
        
        // Xóa entries expired
        for (const [key, entry] of this.cache.data.entries()) {
            if (now >= entry.staleUntil) {
                this.cache.data.delete(key);
            }
        }
        
        // Enforce max entries
        if (this.cache.data.size > this.config.MAX_ENTRIES) {
            const entries = Array.from(this.cache.data.entries());
            entries.sort((a, b) => a[1].lastAccess - b[1].lastAccess);
            const toDelete = entries.slice(0, entries.length - this.config.MAX_ENTRIES);
            for (const [key] of toDelete) {
                this.cache.data.delete(key);
            }
        }
        
        console.log(`[APEX CACHE] CLEANUP - ${this.cache.data.size} entries`);
    }

    // ============================================================
    // SIZE - Số lượng entries
    // ============================================================
    get size() {
        return this.cache.data.size;
    }
}

// Singleton instance
const cache = new CacheSystem();

export default cache;
