export function generateLoader(code) {
  const ts = Date.now().toString(36);
  const seed = generateSeed(code);
  const key = deriveKey(seed, ts);
  const nonce = generateNonce(12);
  const enc = encryptWithKey(code, key, nonce);
  const hex = Buffer.from(enc).toString('hex');
  return buildLoader(hex, seed, ts, nonce);
}

export function generateSeed(code) {
  let h = 0;
  for (let i = 0; i < Math.min(code.length, 100); i++) {
    h = ((h << 5) - h) + code.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h).toString(36);
}

export function deriveKey(seed, salt) {
  let k = '';
  const c = seed + salt;
  for (let i = 0; i < 16; i++) {
    let v = 0;
    for (let j = 0; j < c.length; j++) {
      v = (v * 31 + c.charCodeAt(j) * (i + 1)) % 256;
    }
    k += String.fromCharCode(v);
  }
  return k;
}

export function encryptWithKey(code, key, nonce) {
  const b = Buffer.from(code, 'utf8');
  const enc = Buffer.alloc(b.length);
  for (let i = 0; i < b.length; i++) {
    const kc = key.charCodeAt(i % key.length);
    const nc = nonce.charCodeAt(i % nonce.length);
    enc[i] = (b[i] + kc + nc) % 256;
  }
  return enc;
}

export function generateNonce(len) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let r = '';
  for (let i = 0; i < len; i++) {
    r += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return r;
}

export function generateChallenge() {
  const ops = ['+', '-', '*'];
  const op = ops[Math.floor(Math.random() * ops.length)];
  let a, b, ans;
  switch(op) {
    case '+': a = Math.floor(Math.random() * 50) + 1; b = Math.floor(Math.random() * 50) + 1; ans = a + b; break;
    case '-': a = Math.floor(Math.random() * 50) + 25; b = Math.floor(Math.random() * 25) + 1; ans = a - b; break;
    case '*': a = Math.floor(Math.random() * 12) + 1; b = Math.floor(Math.random() * 12) + 1; ans = a * b; break;
  }
  return {
    question: `${a} ${op} ${b} = ?`,
    answer: ans.toString(),
    token: Math.random().toString(36).substring(2, 15) + Date.now().toString(36)
  };
}

function buildLoader(hex, seed, ts, nonce) {
  const l = [];
  l.push('-- APEX HUB Loader v9');
  l.push('');
  l.push(`local _seed = "${seed}"`);
  l.push(`local _ts = "${ts}"`);
  l.push(`local _nc = "${nonce}"`);
  l.push(`local _hex = "${hex}"`);
  l.push('');
  l.push('local function _dk(s,t)');
  l.push('  local k=""');
  l.push('  local c=s..t');
  l.push('  for i=1,16 do');
  l.push('    local v=0');
  l.push('    for j=1,#c do');
  l.push('      v=(v*31+string.byte(c,j)*i)%256');
  l.push('    end');
  l.push('    k=k..string.char(v)');
  l.push('  end');
  l.push('  return k');
  l.push('end');
  l.push('');
  l.push('local _key = _dk(_seed, _ts)');
  l.push('local _bytes = {}');
  l.push('local _idx = 1');
  l.push('for _c in _hex:gmatch("..") do');
  l.push('  local _b = tonumber(_c, 16)');
  l.push('  local _kb = string.byte(_key, (_idx - 1) % #_key + 1)');
  l.push('  local _nb = string.byte(_nc, (_idx - 1) % #_nc + 1)');
  l.push('  _bytes[_idx] = string.char((_b - _kb - _nb) % 256)');
  l.push('  _idx = _idx + 1');
  l.push('end');
  l.push('');
  l.push('local _code = table.concat(_bytes)');
  l.push('_hex,_key,_nc,_bytes,_seed,_ts,_dk = nil,nil,nil,nil,nil,nil,nil');
  l.push('');
  l.push('local _f, _e = loadstring(_code)');
  l.push('if not _f then error("Error: "..tostring(_e)) end');
  l.push('_code = nil');
  l.push('_f()');
  l.push('_f = nil');
  l.push('collectgarbage("collect")');
  return l.join('\n');
}
