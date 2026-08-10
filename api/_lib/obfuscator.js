export function phantomObfuscate(code) {
  code = fragmentStrings(code);
  code = injectPhantomFunctions(code);
  code = encryptNumbers(code);
  code = wrapWithTimeBomb(code);
  code = injectAntiDebug(code);
  return code;
}

function fragmentStrings(code) {
  const luaStringRegex = /(?:^|[^\\])"((?:[^"\\]|\\.)*)"/g;
  return code.replace(luaStringRegex, (match, str) => {
    const prefix = match[0] === '"' ? '' : match[0];
    const inner = str;
    if (!inner || inner.length < 6) return match;

    const fragments = [];
    let remaining = inner;
    while (remaining.length > 0) {
      const len = Math.floor(Math.random() * 5) + 2;
      fragments.push(remaining.substring(0, len));
      remaining = remaining.substring(len);
    }

    const varName = '_s' + Math.random().toString(36).substring(2, 8);
    const parts = fragments.map(f => `"${f}"`).join(',');
    return `${prefix}(function() local ${varName}="" local _p={${parts}} for _i=1,#_p do ${varName}=${varName}.._p[_i] end return ${varName} end)()`;
  });
}

function injectPhantomFunctions(code) {
  const templates = [
    `local _p${rnd()}=function(...) local _a=table.pack(...) local _r=0 for _i=1,_a.n do _r=_r+(_a[_i]or 0)*_i end return _r end`,
    `local _q${rnd()}=function(_x) local _t={} for _i=1,math.abs(_x%20)+1 do _t[_i]=_i*_x%7 end return _t end`,
    `local _v${rnd()}=function(_s) local _h=0 for _i=1,#_s do _h=_h+string.byte(_s,_i)*_i%256 end return _h end`,
    `local _m${rnd()}=function(_a,_b) local _r={} for _i=1,math.max(#_a,#_b) do _r[_i]=(_a[_i]or 0)^(_b[_i]or 1)%100 end return _r end`,
  ];
  const lines = code.split('\n');
  const result = [];
  for (const line of lines) {
    result.push(line);
    if (line.trim() && Math.random() < 0.15) {
      result.push(templates[Math.floor(Math.random() * templates.length)]);
    }
  }
  return result.join('\n');
}

function encryptNumbers(code) {
  return code.replace(/\b(\d+)\b/g, (match, num) => {
    const n = parseInt(num);
    if (n < 2 || n > 9999 || Math.random() > 0.5) return match;
    const tmpl = [
      () => { const a = Math.floor(Math.random() * n); return `(${a}+${n - a})`; },
      () => { for (let i = 2; i <= Math.sqrt(n); i++) if (n % i === 0) return `(${i}*${n / i})`; return `(${n - 1}+1)`; },
      () => { const x = Math.floor(Math.random() * 20) + 2; return `(${n + x}-${x})`; },
      () => `math.floor(${n + Math.random() * 0.5})`
    ];
    return tmpl[Math.floor(Math.random() * tmpl.length)]();
  });
}

function wrapWithTimeBomb(code) {
  const seed = Date.now() % 100000;
  const v = '_t' + rnd();
  return `\nlocal ${v} = ${seed}\nlocal function _validate()\n  local _s = ${seed}\n  local _n = os and os.time and os.time() or 0\n  local _c = (_n % 100000) - _s\n  if math.abs(_c) > 86400 then return false end\n  return true\nend\nif not _validate() then return end\ndo\n${code}\nend\n${v} = nil _validate = nil`;
}

function injectAntiDebug(code) {
  const traps = [
    `if debug and debug.getinfo and debug.getinfo(1) and debug.getinfo(1).short_src:match("hook") then return end`,
    `if rawget and rawget(_G, "hooked") then return end`,
    `local _dbg = nil if debug then _dbg = debug.getregistry and debug.getregistry() end if _dbg and _dbg._HOOKED then return end`,
  ];
  return traps[Math.floor(Math.random() * traps.length)] + '\n' + code;
}

function rnd() {
  return Math.random().toString(36).substring(2, 8);
}
