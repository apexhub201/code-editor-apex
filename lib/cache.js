// ============================================================
// lib/cache.js - APEX HUB V8 (Professional Cache System)
// ============================================================

const DEFAULT_TTL = 5 * 60 * 1000;
const DEFAULT_MAX_ITEMS = 500;

class MemoryCache {
    constructor(maxItems = DEFAULT_MAX_ITEMS) {
        this.data = new Map();
        this.pending = new Map();
        this.maxItems = maxItems;
    }

    get(key) {
        const item = this.data.get(key);
        if (!item) return undefined;

        if (item.expiresAt <= Date.now()) {
            this.data.delete(key);
            return undefined;
        }

        item.lastAccess = Date.now();
        return item.value;
    }

    set(key, value, ttl = DEFAULT_TTL) {
        if (this.data.has(key)) {
            this.data.delete(key);
        }

        if (this.data.size >= this.maxItems) {
            this.removeOldest();
        }

        this.data.set(key, {
            value,
            createdAt: Date.now(),
            lastAccess: Date.now(),
            expiresAt: Date.now() + ttl
        });

        return value;
    }

    delete(key) {
        return this.data.delete(key);
    }

    clear() {
        this.data.clear();
    }

    has(key) {
        return this.get(key) !== undefined;
    }

    removeOldest() {
        let oldestKey = null;
        let oldestTime = Infinity;

        for (const [key, item] of this.data.entries()) {
            if (item.lastAccess < oldestTime) {
                oldestTime = item.lastAccess;
                oldestKey = key;
            }
        }

        if (oldestKey !== null) {
            this.data.delete(oldestKey);
        }
    }

    cleanup() {
        const now = Date.now();
        for (const [key, item] of this.data.entries()) {
            if (item.expiresAt <= now) {
                this.data.delete(key);
            }
        }
    }

    size() {
        return this.data.size;
    }
}

// Global cache instance
if (!global.__APEX_CACHE__) {
    global.__APEX_CACHE__ = new MemoryCache(DEFAULT_MAX_ITEMS);
}

const cache = global.__APEX_CACHE__;

// Cached loader with deduplication
export async function cached(key, loader, ttl = DEFAULT_TTL) {
    // Cache hit
    const existing = cache.get(key);
    if (existing !== undefined) {
        return { value: existing, fromCache: true };
    }

    // Pending request deduplication
    if (cache.pending.has(key)) {
        const value = await cache.pending.get(key);
        return { value, fromCache: true, deduplicated: true };
    }

    // New Firestore read
    const promise = Promise.resolve()
        .then(() => loader())
        .then(value => {
            if (value !== undefined && value !== null) {
                cache.set(key, value, ttl);
            }
            return value;
        })
        .finally(() => {
            cache.pending.delete(key);
        });

    cache.pending.set(key, promise);

    const value = await promise;
    return { value, fromCache: false };
}

// Direct cache API
export function getCache(key) {
    return cache.get(key);
}

export function setCache(key, value, ttl = DEFAULT_TTL) {
    return cache.set(key, value, ttl);
}

export function deleteCache(key) {
    return cache.delete(key);
}

export function clearCache() {
    cache.clear();
}

export function cacheHas(key) {
    return cache.has(key);
}

export function cacheSize() {
    return cache.size();
}

export function cleanupCache() {
    cache.cleanup();
}

// Prefix invalidation
export function clearCachePrefix(prefix) {
    let count = 0;
    for (const key of cache.data.keys()) {
        if (key.startsWith(prefix)) {
            cache.data.delete(key);
            count++;
        }
    }
    return count;
}
