// lib/cache.js

class MemoryCache {
    constructor(options = {}) {
        this.cache = new Map();

        this.maxItems = options.maxItems || 500;
        this.defaultTTL = options.defaultTTL || 5 * 60 * 1000;

        // Dọn cache hết hạn định kỳ
        this.cleanupTimer = setInterval(() => {
            this.cleanup();
        }, 60 * 1000);

        // Không giữ Node/Vercel function sống chỉ vì timer
        if (this.cleanupTimer?.unref) {
            this.cleanupTimer.unref();
        }
    }

    get(key) {
        const item = this.cache.get(key);

        if (!item) {
            return undefined;
        }

        // Hết hạn
        if (item.expiresAt <= Date.now()) {
            this.cache.delete(key);
            return undefined;
        }

        // Cập nhật thời gian truy cập
        item.lastAccess = Date.now();

        return item.value;
    }

    set(key, value, ttl = this.defaultTTL) {
        // Nếu đã tồn tại thì cập nhật
        if (this.cache.has(key)) {
            this.cache.delete(key);
        }

        // Giới hạn số lượng cache
        if (this.cache.size >= this.maxItems) {
            this.removeOldest();
        }

        this.cache.set(key, {
            value,
            createdAt: Date.now(),
            lastAccess: Date.now(),
            expiresAt: Date.now() + ttl
        });

        return value;
    }

    has(key) {
        return this.get(key) !== undefined;
    }

    delete(key) {
        return this.cache.delete(key);
    }

    clear() {
        this.cache.clear();
    }

    size() {
        return this.cache.size;
    }

    removeOldest() {
        let oldestKey = null;
        let oldestTime = Infinity;

        for (const [key, item] of this.cache.entries()) {
            if (item.lastAccess < oldestTime) {
                oldestTime = item.lastAccess;
                oldestKey = key;
            }
        }

        if (oldestKey !== null) {
            this.cache.delete(oldestKey);
        }
    }

    cleanup() {
        const now = Date.now();

        for (const [key, item] of this.cache.entries()) {
            if (item.expiresAt <= now) {
                this.cache.delete(key);
            }
        }
    }

    stats() {
        return {
            size: this.cache.size,
            maxItems: this.maxItems
        };
    }
}


// --------------------------------------------------
// Request deduplication
// --------------------------------------------------
// Nếu 20 request cùng lúc yêu cầu cùng một dữ liệu,
// chỉ chạy loader 1 lần.
//
// Request còn lại dùng chung Promise.
// --------------------------------------------------

const inflight = new Map();


// --------------------------------------------------
// Global cache
// --------------------------------------------------

const cache = new MemoryCache({
    maxItems: 500,
    defaultTTL: 5 * 60 * 1000
});


// --------------------------------------------------
// cached()
// --------------------------------------------------

export async function cached(
    key,
    loader,
    ttl = 5 * 60 * 1000
) {
    // 1. Kiểm tra cache
    const cachedValue = cache.get(key);

    if (cachedValue !== undefined) {
        return cachedValue;
    }

    // 2. Nếu request này đang chạy rồi
    if (inflight.has(key)) {
        return inflight.get(key);
    }

    // 3. Tạo request mới
    const promise = Promise.resolve()
        .then(() => loader())
        .then((value) => {
            // Không cache undefined/null
            if (value !== undefined && value !== null) {
                cache.set(key, value, ttl);
            }

            return value;
        })
        .finally(() => {
            inflight.delete(key);
        });

    inflight.set(key, promise);

    return promise;
}


// --------------------------------------------------
// Cache thủ công
// --------------------------------------------------

export function cacheGet(key) {
    return cache.get(key);
}

export function cacheSet(key, value, ttl) {
    return cache.set(key, value, ttl);
}

export function cacheDelete(key) {
    return cache.delete(key);
}

export function cacheClear() {
    cache.clear();
}

export function cacheHas(key) {
    return cache.has(key);
}

export function cacheStats() {
    return cache.stats();
}


// --------------------------------------------------
// Xóa cache theo prefix
//
// Ví dụ:
// clearByPrefix("script:")
//
// sẽ xóa:
// script:abc
// script:def
// script:test
// --------------------------------------------------

export function clearByPrefix(prefix) {
    let deleted = 0;

    for (const key of cache.cache.keys()) {
        if (key.startsWith(prefix)) {
            cache.cache.delete(key);
            deleted++;
        }
    }

    return deleted;
}


// --------------------------------------------------
// Export default
// --------------------------------------------------

export default cache;
