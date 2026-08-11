// lib/hercules-obfuscator.js - Hercules Obfuscator (JS Port)
import crypto from 'crypto';

export default class HerculesObfuscator {
    constructor(options = {}) {
        this.config = {
            // Cấu hình mặc định (tương đương config.lua)
            stringEncryption: options.stringEncryption ?? true,
            numberEncryption: options.numberEncryption ?? true,
            controlFlowFlattening: options.controlFlowFlattening ?? true,
            deadCodeInjection: options.deadCodeInjection ?? true,
            antiDebug: options.antiDebug ?? true,
            virtualizeGlobals: options.virtualizeGlobals ?? false,
            mutationPasses: options.mutationPasses ?? 3,
            seed: options.seed || crypto.randomBytes(8).toString('hex')
        };
        
        this.rng = this.createRNG(this.config.seed);
    }
    
    /**
     * Create seeded random number generator
     */
    createRNG(seed) {
        let hash = 0;
        for (let i = 0; i < seed.length; i++) {
            hash = ((hash << 5) - hash) + seed.charCodeAt(i);
            hash |= 0;
        }
        return {
            next: () => {
                hash = (hash * 1103515245 + 12345) & 0x7fffffff;
                return hash / 0x7fffffff;
            },
            randomInt: (min, max) => {
                return Math.floor(this.rng ? this.rng.next() * (max - min + 1) + min : Math.random() * (max - min + 1) + min);
            }
        };
    }
    
    /**
     * Main obfuscation pipeline
     */
    obfuscate(code) {
        console.log('[HERCULES] Starting obfuscation pipeline...');
        
        let result = code;
        
        // Pipeline stages (tương tự pipeline.lua)
        const stages = [
            { name: 'StringEncryption', fn: this.encryptStrings.bind(this), enabled: this.config.stringEncryption },
            { name: 'NumberEncryption', fn: this.encryptNumbers.bind(this), enabled: this.config.numberEncryption },
            { name: 'ControlFlowFlattening', fn: this.flattenControlFlow.bind(this), enabled: this.config.controlFlowFlattening },
            { name: 'DeadCodeInjection', fn: this.injectDeadCode.bind(this), enabled: this.config.deadCodeInjection },
            { name: 'AntiDebug', fn: this.injectAntiDebug.bind(this), enabled: this.config.antiDebug },
            { name: 'GlobalVirtualization', fn: this.virtualizeGlobals.bind(this), enabled: this.config.virtualizeGlobals },
        ];
        
        for (const stage of stages) {
            if (stage.enabled) {
                console.log(`[HERCULES] Running: ${stage.name}`);
                result = stage.fn(result);
            }
        }
        
        // Mutation passes
        for (let i = 0; i < this.config.mutationPasses; i++) {
            result = this.mutateCode(result);
        }
        
        // Add manifest header
        result = this.addManifest(result);
        
        console.log('[HERCULES] Obfuscation complete');
        return result;
    }
    
    /**
     * String Encryption - Tách và mã hóa string
     */
    encryptStrings(code) {
        // Tìm tất cả string literals
        return code.replace(/"([^"]*)"/g, (match, str) => {
            if (str.length < 3) return match;
            
            // XOR encrypt string
            const key = this.rng.randomInt(1, 255);
            const encrypted = str.split('').map(c => {
                return String.fromCharCode(c.charCodeAt(0) ^ key);
            }).join('');
            
            // Escape special chars
            const escaped = encrypted.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
            
            // Tạo hàm giải mã
            const funcName = '_hs' + this.rng.randomInt(1000, 9999);
            return `(function() local ${funcName}="${escaped}" local _k=${key} local _r="" for _i=1,#${funcName} do _r=_r..string.char(string.byte(${funcName},_i)~_k) end return _r end)()`;
        });
    }
    
    /**
     * Number Encryption - Biến số thành biểu thức
     */
    encryptNumbers(code) {
        return code.replace(/\b(\d+)\b/g, (match, num) => {
            const n = parseInt(num);
            if (n < 2 || n > 9999 || this.rng.next() > 0.6) return match;
            
            const patterns = [
                () => {
                    const a = this.rng.randomInt(1, n - 1);
                    return `(${a}+${n - a})`;
                },
                () => {
                    const a = this.rng.randomInt(n + 1, n + 100);
                    return `(${a}-${a - n})`;
                },
                () => {
                    // Tìm ước số
                    for (let i = 2; i <= Math.sqrt(n); i++) {
                        if (n % i === 0 && this.rng.next() > 0.5) {
                            return `(${i}*${n / i})`;
                        }
                    }
                    return `(${n - 1}+1)`;
                },
                () => {
                    const shift = this.rng.randomInt(1, 8);
                    return `bit32.rshift(${n << shift},${shift})`;
                }
            ];
            
            return patterns[this.rng.randomInt(0, patterns.length - 1)]();
        });
    }
    
    /**
     * Control Flow Flattening - Làm phẳng luồng điều khiển
     */
    flattenControlFlow(code) {
        // Đơn giản hóa: thêm các block rỗng và goto không cần thiết
        const lines = code.split('\n');
        const result = [];
        
        for (const line of lines) {
            result.push(line);
            
            // Thêm label và goto ngẫu nhiên
            if (line.trim() && this.rng.next() < 0.2) {
                const labelName = '_lbl' + this.rng.randomInt(1000, 9999);
                result.push(`::${labelName}::`);
                if (this.rng.next() > 0.5) {
                    result.push(`goto ${labelName}`);
                }
            }
        }
        
        return result.join('\n');
    }
    
    /**
     * Dead Code Injection - Chèn code không bao giờ chạy
     */
    injectDeadCode(code) {
        const deadCodeTemplates = [
            `local _dc${this.rng.randomInt(1000, 9999)}=function(...) local _a=table.pack(...) local _r=0 for _i=1,_a.n do _r=_r+(_a[_i]or 0)*_i end return _r end`,
            `local _dc${this.rng.randomInt(1000, 9999)}={{},{},{}} for _i=1,3 do _dc${this.rng.randomInt(1000, 9999)}[_i]=_i*2 end`,
            `if false then local _dc${this.rng.randomInt(1000, 9999)}=Instance.new("Part") _dc${this.rng.randomInt(1000, 9999)}:Destroy() end`,
            `do local _dc${this.rng.randomInt(1000, 9999)}=math.random(1,100)*0 break end`,
        ];
        
        const lines = code.split('\n');
        const result = [];
        
        for (const line of lines) {
            result.push(line);
            if (line.trim() && this.rng.next() < 0.12) {
                const deadCode = deadCodeTemplates[this.rng.randomInt(0, deadCodeTemplates.length - 1)];
                result.push(deadCode);
            }
        }
        
        return result.join('\n');
    }
    
    /**
     * Anti-Debug Injection
     */
    injectAntiDebug(code) {
        const traps = [
            `if debug and debug.getinfo and debug.getinfo(1) and debug.getinfo(1).short_src:match("hook") then return end`,
            `if rawget and rawget(_G, "hooked") then return end`,
            `pcall(function() if getfenv and getfenv(0)["_HOOKED"] then error("Debug detected") end end)`,
            `local _dbg_check = pcall(function() return debug.getregistry() end) if _dbg_check and debug.getregistry()._HOOKED then return end`,
        ];
        
        const trap = traps[this.rng.randomInt(0, traps.length - 1)];
        
        // Chèn vào đầu code
        return `--[[ Hercules Protected ]]\n${trap}\n${code}`;
    }
    
    /**
     * Global Virtualization - Ẩn global variables
     */
    virtualizeGlobals(code) {
        // Thay thế các global thường dùng bằng biến ảo
        const globals = {
            'game': '_G' + this.rng.randomInt(1000, 9999),
            'workspace': '_G' + this.rng.randomInt(1000, 9999),
            'print': '_G' + this.rng.randomInt(1000, 9999),
            'wait': '_G' + this.rng.randomInt(1000, 9999),
        };
        
        const virtualizedLines = [];
        for (const [original, virtual] of Object.entries(globals)) {
            if (code.includes(original)) {
                virtualizedLines.push(`local ${virtual}=${original}`);
            }
        }
        
        let result = code;
        for (const [original, virtual] of Object.entries(globals)) {
            result = result.replace(new RegExp(`\\b${original}\\b`, 'g'), virtual);
        }
        
        return virtualizedLines.join('\n') + '\n' + result;
    }
    
    /**
     * Code Mutation - Biến đổi cấu trúc code
     */
    mutateCode(code) {
        // Đảo thứ tự biến, đổi tên biến, v.v.
        const mutations = [
            // Đổi tên biến local ngẫu nhiên
            (c) => c.replace(/\blocal\s+(\w+)\s*=/g, (match, varName) => {
                if (varName.startsWith('_')) return match; // Giữ biến đã được đổi
                return `local _${this.rng.randomInt(1000, 9999)} =`;
            }),
            // Thêm dấu cách thừa
            (c) => c.split('\n').map(line => {
                if (this.rng.next() < 0.1) {
                    return line.replace(/\s+/g, '   ');
                }
                return line;
            }).join('\n'),
            // Đổi thứ tự khai báo local
            (c) => {
                const lines = c.split('\n');
                const localLines = [];
                const otherLines = [];
                
                for (const line of lines) {
                    if (line.trim().startsWith('local ') && this.rng.next() < 0.3) {
                        localLines.push(line);
                    } else {
                        otherLines.push(line);
                    }
                }
                
                return [...otherLines.slice(0, 3), ...localLines, ...otherLines.slice(3)].join('\n');
            }
        ];
        
        // Áp dụng 1-2 mutation ngẫu nhiên
        const numMutations = this.rng.randomInt(1, 2);
        let result = code;
        
        for (let i = 0; i < numMutations; i++) {
            const mutation = mutations[this.rng.randomInt(0, mutations.length - 1)];
            result = mutation(result);
        }
        
        return result;
    }
    
    /**
     * Add manifest header
     */
    addManifest(code) {
        const manifest = [
            `--[[`,
            `    Hercules Obfuscator v2.0`,
            `    Protected by APEX HUB`,
            `    Seed: ${this.config.seed}`,
            `    Timestamp: ${Date.now()}`,
            `--]]`,
            ''
        ];
        return manifest.join('\n') + code;
    }
    
    /**
     * Generate loader wrapper
     */
    generateLoader(code) {
        const key = crypto.randomBytes(16).toString('hex');
        const iv = crypto.randomBytes(8).toString('hex');
        const funcName = '_hl' + this.rng.randomInt(1000, 9999);
        
        return [
            `-- APEX HUB Loader (Hercules)`,
            `local ${funcName} = "${key}"`,
            `local function _decode(d,k)`,
            `    local r = {}`,
            `    for i = 1, #d do`,
            `        r[i] = string.char(string.byte(d,i) ~ string.byte(k,(i-1)%#k+1))`,
            `    end`,
            `    return table.concat(r)`,
            `end`,
            `local _d = "${Buffer.from(code).toString('base64')}"`,
            `local _c = _decode(_d, ${funcName})`,
            `local _f = loadstring(_c)`,
            `if _f then _f() end`,
        ].join('\n');
    }
}
