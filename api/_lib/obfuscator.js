/**
 * APEX HUB - Phantom Obfuscator
 * Preserved from original code - V9 Phantom Layer
 */

export function phantomObfuscate(code) {
  // Layer 1: Fragment strings
  code = fragmentStrings(code);

  // Layer 2: Inject phantom functions
  code = injectPhantomFunctions(code);

  // Layer 3: Encrypt numbers
  code = encryptNumbers(code);

  // Layer 4: Wrap with time-bomb
  code = wrapWithTimeBomb(code);

  // Layer 5: Anti-debug traps
  code = injectAntiDebug(code);

  return code;
}

function fragmentStrings(code) {
  return code.replace(/"([^"]+)"/g, (match, str) => {
    if (str.length < 6) return match;

    const fragments = [];
    let remaining = str;
    while (remaining.length > 0) {
      const len = Math.floor(Math.random() * 5) + 2;
      fragments.push(remaining.substring(0, len));
      remaining = remaining.substring(len);
    }

    const varName = '_s' + Math.random().toString(36).substring(2, 8);
    const parts = fragments.map(f => `"${f}"`).join(',');

    return `(function() local ${varName}="" local _p={${parts}} for _i=1,#_p do ${varName}=${varName}.._p[_i] end return ${varName} end)()`;
  });
}

function injectPhantomFunctions(code) {
  const phantomTemplates = [
    `local _p${randomId()}=function(...) local _a=table.pack(...) local _r=0 for _i=1,_a.n do _r=_r+(_a[_i]or 0)*_i end return _r end`,
    `local _q${randomId()}=function(_x) local _t={} for _i=1,math.abs(_x%20)+1 do _t[_i]=_i*_x%7 end return _t end`,
    `local _v${randomId()}=function(_s) local _h=0 for _i=1,#_s do _h=_h+string.byte(_s,_i)*_i%256 end return _h end`,
    `local _m${randomId()}=function(_a,_b) local _r={} for _i=1,math.max(#_a,#_b) do _r[_i]=(_a[_i]or 0)^(_b[_i]or 1)%100 end return _r end`,
  ];

  const lines = code.split('\n');
  const result = [];

  for (const line of lines) {
    result.push(line);
    if (line.trim() && Math.random() < 0.15) {
      const phantom = phantomTemplates[Math.floor(Math.random() * phantomTemplates.length)];
      result.push(phantom);
    }
  }

  return result.join('\n');
}

function encryptNumbers(code) {
  return code.replace(/\b(\d+)\b/g, (match, num) => {
    const n = parseInt(num);
    if (n < 2 || n > 9999) return match;
    if (Math.random() > 0.5) return match;

    const templates = [
      () => {
        const a = Math.floor(Math.random() * n);
        const b = n - a;
        const op = Math.random() > 0.5 ? '+' : '-';
        return op === '+' ? `(${a}+${b})` : `(${a + n}-${a})`;
      },
      () => {
        const factors = [];
        for (let i = 2; i <= Math.sqrt(n); i++) {
          if (n % i === 0) factors.push({ a: i, b: n / i });
        }
        if (factors.length > 0) {
          const f = factors[Math.floor(Math.random() * factors.length)];
          return `(${f.a}*${f.b})`;
        }
        return `(${n - 1}+1)`;
      },
      () => {
        const x = Math.floor(Math.random() * 20) + 2;
        return `(${n + x}-${x})`;
      },
      () => {
        return `math.floor(${n + Math.random() * 0.5})`;
      },
    ];

    return templates[Math.floor(Math.random() * templates.length)]();
  });
}

function wrapWithTimeBomb(code) {
  const seed = Date.now() % 100000;
  const checkVar = '_t' + randomId();

  return `
local ${checkVar} = ${seed}
local function _validate()
    local _seed = ${seed}
    local _now = os and os.time and os.time() or 0
    local _check = (_now % 100000) - _seed
    if math.abs(_check) > 86400 then
        return false
    end
    return true
end
if not _validate() then return end
do
${code}
end
${checkVar} = nil _validate = nil`;
}

function injectAntiDebug(code) {
  const traps = [
    `if debug and debug.getinfo and debug.getinfo(1) and debug.getinfo(1).short_src:match("hook") then return end`,
    `if rawget and rawget(_G, "hooked") then return end`,
    `local _dbg = nil if debug then _dbg = debug.getregistry and debug.getregistry() end if _dbg and _dbg._HOOKED then return end`,
  ];

  const trap = traps[Math.floor(Math.random() * traps.length)];
  return trap + '\n' + code;
}

function randomId() {
  return Math.random().toString(36).substring(2, 8);
}
