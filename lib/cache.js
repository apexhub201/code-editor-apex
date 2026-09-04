// ============================================================
// lib/cache.js - APEX HUB Cache System
// Production / Vercel Serverless Safe
// ============================================================

const DEFAULT_CONFIG = {
    TTL: 5 * 60 * 1000,              // 5 phút fresh
    STALE_GRACE: 60 * 60 * 1000,     // thêm 1 giờ stale
    MAX_ENTRIES: 500,                // tối đa 500 entries
    CLEANUP_INTERVAL: 60 * 1000,     // cleanup mỗi 60 giây
    MAX_PENDING_READS: 100           // chống quá nhiều request đồng thời
};

// ============================================================
// GLOBAL STATE
// ============================================================

function createGlobalState() {
    if (!global.__APEX_CACHE__) {
        global.__APEX_CACHE__ = {
            data: new Map(),
            pendingReads: new Map(),
            lastCleanup: Date.now(),

            stats: {
                hits: 0,
                staleHits: 0,
                misses: 0,
                sets: 0,
                deletes: 0,
                dedupHits: 0,
                loaderErrors: 0
            }
        };
    }

    return global.__APEX_CACHE__;
}

// ============================================================
// CACHE SYSTEM
// ============================================================

class CacheSystem {

    constructor(config = {}) {
        this.config = {
            ...DEFAULT_CONFIG,
            ...config
        };

        this.cache = createGlobalState();
    }

    // ========================================================
    // GET FRESH CACHE
    // ========================================================

    get(key) {
        if (!key) return null;

        const now = Date.now();
        const entry = this.cache.data.get(key);

        if (!entry) {
            this.cache.stats.misses++;
            return null;
        }

        // Fresh
        if (now < entry.expiresAt) {

            entry.lastAccess = now;

            this.cache.stats.hits++;

            console.log(`[APEX CACHE] HIT ${key}`);

            return this.cloneValue(entry.value, {
                fromCache: true,
                stale: false
            });
        }

        // Stale nhưng vẫn còn khả năng fallback
        if (now < entry.staleUntil) {

            this.cache.stats.misses++;

            console.log(`[APEX CACHE] STALE ${key}`);

            return null;
        }

        // Hoàn toàn hết hạn
        this.cache.data.delete(key);

        this.cache.stats.misses++;

        console.log(`[APEX CACHE] EXPIRED ${key}`);

        return null;
    }

    // ========================================================
    // GET STALE CACHE
    // ========================================================

    getStale(key) {
        if (!key) return null;

        const now = Date.now();
        const entry = this.cache.data.get(key);

        if (!entry) {
            return null;
        }

        // Vẫn còn trong stale grace
        if (now < entry.staleUntil) {

            entry.lastAccess = now;

            this.cache.stats.staleHits++;

            console.log(`[APEX CACHE] STALE_HIT ${key}`);

            return this.cloneValue(entry.value, {
                fromCache: true,
                stale: true
            });
        }

        // Hết stale grace
        this.cache.data.delete(key);

        console.log(`[APEX CACHE] STALE_EXPIRED ${key}`);

        return null;
    }

    // ========================================================
    // HAS
    // ========================================================

    has(key) {
        const now = Date.now();
        const entry = this.cache.data.get(key);

        if (!entry) return false;

        if (now < entry.staleUntil) {
            return true;
        }

        this.cache.data.delete(key);

        return false;
    }

    // ========================================================
    // SET
    // ========================================================

    set(key, value, ttl = this.config.TTL) {
        if (!key) return false;

        // Không cache null / undefined
        if (value === null || value === undefined) {
            return false;
        }

        const now = Date.now();

        this.cache.data.set(key, {
            value,
            createdAt: now,
            lastAccess: now,
            expiresAt: now + ttl,
            staleUntil: now + ttl + this.config.STALE_GRACE
        });

        this.cache.stats.sets++;

        this.cleanup();

        console.log(`[APEX CACHE] SET ${key}`);

        return true;
    }

    // ========================================================
    // DELETE
    // ========================================================

    delete(key) {
        if (!key) return false;

        const deleted = this.cache.data.delete(key);

        // Không cancel promise đang chạy.
        // Chỉ xoá reference nếu request đã hoàn thành.
        if (!this.cache.pendingReads.has(key)) {
            this.cache.pendingReads.delete(key);
        }

        if (deleted) {
            this.cache.stats.deletes++;
        }

        console.log(`[APEX CACHE] DELETE ${key}`);

        return deleted;
    }

    // ========================================================
    // CLEAR ALL
    // ========================================================

    clear() {
        this.cache.data.clear();
        this.cache.pendingReads.clear();

        console.log(`[APEX CACHE] CLEAR ALL`);
    }

    // ========================================================
    // CLEAR PREFIX
    // ========================================================

    clearPrefix(prefix) {
        if (!prefix) return;

        let count = 0;

        for (const key of this.cache.data.keys()) {
            if (key.startsWith(prefix)) {
                this.cache.data.delete(key);
                count++;
            }
        }

        console.log(
            `[APEX CACHE] CLEAR PREFIX ${prefix} (${count})`
        );
    }

    // ========================================================
    // CACHED
    //
    // Flow:
    //
    // Fresh cache
    //      ↓
    // Pending request
    //      ↓
    // Firebase loader
    //      ↓
    // success → cache
    // error → stale cache
    //      ↓
    // stale unavailable → throw original error
    // ========================================================

    async cached(
        key,
        fn,
        ttl = this.config.TTL,
        options = {}
    ) {

        const staleFallback =
            options.staleFallback !== false;

        // ----------------------------------------------------
        // 1. Fresh cache
        // ----------------------------------------------------

        const fresh = this.get(key);

        if (fresh) {
            return fresh;
        }

        // ----------------------------------------------------
        // 2. Existing request
        // ----------------------------------------------------

        if (this.cache.pendingReads.has(key)) {

            this.cache.stats.dedupHits++;

            console.log(
                `[APEX CACHE] DEDUP ${key}`
            );

            return await this.cache.pendingReads.get(key);
        }

        // ----------------------------------------------------
        // 3. Prevent unlimited Firebase requests
        // ----------------------------------------------------

        if (
            this.cache.pendingReads.size >=
            this.config.MAX_PENDING_READS
        ) {

            console.warn(
                `[APEX CACHE] MAX_PENDING_READS reached`
            );

            if (staleFallback) {
                const stale = this.getStale(key);

                if (stale) {
                    return stale;
                }
            }

            throw new Error(
                'CACHE_PENDING_LIMIT'
            );
        }

        // ----------------------------------------------------
        // 4. Create single loader request
        // ----------------------------------------------------

        let readPromise;

        readPromise = (async () => {

            try {

                const result = await fn();

                // ------------------------------------------------
                // Firebase success
                // ------------------------------------------------

                if (
                    result !== null &&
                    result !== undefined
                ) {
                    this.set(
                        key,
                        result,
                        ttl
                    );
                }

                return result;

            } catch (error) {

                this.cache.stats.loaderErrors++;

                console.warn(
                    `[APEX CACHE] LOADER_ERROR ${key}:`,
                    error?.message || 'unknown error'
                );

                // ------------------------------------------------
                // Firebase lỗi → stale fallback
                // ------------------------------------------------

                if (staleFallback) {

                    const stale =
                        this.getStale(key);

                    if (stale) {

                        console.warn(
                            `[APEX CACHE] FALLBACK_STALE ${key}`
                        );

                        return stale;
                    }
                }

                // Không có stale → giữ nguyên lỗi
                throw error;

            } finally {

                // Chỉ xoá đúng promise hiện tại
                if (
                    this.cache.pendingReads.get(key) ===
                    readPromise
                ) {
                    this.cache.pendingReads.delete(key);
                }
            }

        })();

        this.cache.pendingReads.set(
            key,
            readPromise
        );

        return await readPromise;
    }

    // ========================================================
    // CLEANUP
    // ========================================================

    cleanup() {

        const now = Date.now();

        if (
            now - this.cache.lastCleanup <
            this.config.CLEANUP_INTERVAL
        ) {
            return;
        }

        this.cache.lastCleanup = now;

        // ----------------------------------------------------
        // Remove expired entries
        // ----------------------------------------------------

        for (
            const [key, entry]
            of this.cache.data.entries()
        ) {

            if (now >= entry.staleUntil) {
                this.cache.data.delete(key);
            }
        }

        // ----------------------------------------------------
        // Enforce MAX_ENTRIES
        // LRU = Least Recently Used
        // ----------------------------------------------------

        if (
            this.cache.data.size >
            this.config.MAX_ENTRIES
        ) {

            const entries =
                Array.from(
                    this.cache.data.entries()
                );

            entries.sort(
                (a, b) =>
                    a[1].lastAccess -
                    b[1].lastAccess
            );

            const removeCount =
                entries.length -
                this.config.MAX_ENTRIES;

            for (
                let i = 0;
                i < removeCount;
                i++
            ) {

                this.cache.data.delete(
                    entries[i][0]
                );
            }
        }

        console.log(
            `[APEX CACHE] CLEANUP ${this.cache.data.size} entries`
        );
    }

    // ========================================================
    // STATS
    // ========================================================

    stats() {

        return {
            entries: this.cache.data.size,

            pendingReads:
                this.cache.pendingReads.size,

            maxEntries:
                this.config.MAX_ENTRIES,

            maxPendingReads:
                this.config.MAX_PENDING_READS,

            ...this.cache.stats
        };
    }

    // ========================================================
    // SIZE
    // ========================================================

    get size() {
        return this.cache.data.size;
    }

    // ========================================================
    // INTERNAL CLONE
    // ========================================================

    cloneValue(value, metadata = {}) {

        // Object
        if (
            value &&
            typeof value === 'object' &&
            !Array.isArray(value)
        ) {

            return {
                ...value,
                ...metadata
            };
        }

        // Primitive / array
        return value;
    }
}

// ============================================================
// SINGLETON
// ============================================================

const cache = new CacheSystem();

// ============================================================
// NAMED EXPORTS
// Giúp api/raw.js dùng được:
// cached()
// setCache()
// deleteCache()
// clearCachePrefix()
// getStaleCache()
// ============================================================

export const cached = (
    key,
    fn,
    ttl,
    options
) => {
    return cache.cached(
        key,
        fn,
        ttl,
        options
    );
};

export const setCache = (
    key,
    value,
    ttl
) => {
    return cache.set(
        key,
        value,
        ttl
    );
};

export const getCache = (
    key
) => {
    return cache.get(key);
};

export const getStaleCache = (
    key
) => {
    return cache.getStale(key);
};

export const deleteCache = (
    key
) => {
    return cache.delete(key);
};

export const clearCache = () => {
    return cache.clear();
};

export const clearCachePrefix = (
    prefix
) => {
    return cache.clearPrefix(prefix);
};

export const cacheStats = () => {
    return cache.stats();
};

export default cache;
