/**
 * APEX HUB - Encryption and Loader Generation
 * Preserved from original obfuscator logic
 */

export function generateLoader(code) {
  const timestamp = Date.now().toString(36);
  const seed = generateSeed(code);
  const key = deriveKey(seed, timestamp);
  const nonce = generateNonce(12);

  const encrypted = encryptWithKey(code, key, nonce);
  const hexData = bufferToHex(encrypted);

  return buildObfuscatedLoader(hexData, seed, timestamp, nonce);
}

export function generateSeed(code) {
  let hash = 0;
  for (let i = 0; i < Math.min(code.length, 100); i++) {
    hash = ((hash << 5) - hash) + code.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

export function deriveKey(seed, salt) {
  let key = '';
  const combined = seed + salt;
  for (let i = 0; i < 16; i++) {
    let charCode = 0;
    for (let j = 0; j < combined.length; j++) {
      charCode = (charCode * 31 + combined.charCodeAt(j) * (i + 1)) % 256;
    }
    key += String.fromCharCode(charCode);
  }
  return key;
}

export function encryptWithKey(code, key, nonce) {
  const bytes = Buffer.from(code, 'utf8');
  const encrypted = Buffer.alloc(bytes.length);

  for (let i = 0; i < bytes.length; i++) {
    const k = key.charCodeAt(i % key.length);
    const n = nonce.charCodeAt(i % nonce.length);
    encrypted[i] = (bytes[i] + k + n) % 256;
  }

  return encrypted;
}

export function generateNonce(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function generateChallenge() {
  const ops = ['+', '-', '*'];
  const op = ops[Math.floor(Math.random() * ops.length)];
  let num1, num2, answer;

  switch(op) {
    case '+':
      num1 = Math.floor(Math.random() * 50) + 1;
      num2 = Math.floor(Math.random() * 50) + 1;
      answer = num1 + num2;
      break;
    case '-':
      num1 = Math.floor(Math.random() * 50) + 25;
      num2 = Math.floor(Math.random() * 25) + 1;
      answer = num1 - num2;
      break;
    case '*':
      num1 = Math.floor(Math.random() * 12) + 1;
      num2 = Math.floor(Math.random() * 12) + 1;
      answer = num1 * num2;
      break;
  }

  return {
    question: `${num1} ${op} ${num2} = ?`,
    answer: answer.toString(),
    token: Math.random().toString(36).substring(2, 15) + Date.now().toString(36)
  };
}

export function bufferToHex(buffer) {
  return Array.from(buffer)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function buildObfuscatedLoader(hexData, seed, timestamp, nonce) {
  const lines = [];

  lines.push('-- APEX HUB Loader v9 (Phantom Edition)');
  lines.push('-- Multi-layer protection active');
  lines.push('');
  lines.push(`local _seed = "${seed}"`);
  lines.push(`local _ts = "${timestamp}"`);
  lines.push(`local _nc = "${nonce}"`);
  lines.push(`local _hex = "${hexData}"`);
  lines.push('');
  lines.push('local function _dk(s,t)');
  lines.push('    local k=""');
  lines.push('    local c=s..t');
  lines.push('    for i=1,16 do');
  lines.push('        local v=0');
  lines.push('        for j=1,#c do');
  lines.push('            v=(v*31+string.byte(c,j)*i)%256');
  lines.push('        end');
  lines.push('        k=k..string.char(v)');
  lines.push('    end');
  lines.push('    return k');
  lines.push('end');
  lines.push('');
  lines.push('local _key = _dk(_seed, _ts)');
  lines.push('local _bytes = {}');
  lines.push('local _idx = 1');
  lines.push('for _c in _hex:gmatch("..") do');
  lines.push('    local _b = tonumber(_c, 16)');
  lines.push('    local _kb = string.byte(_key, (_idx - 1) % #_key + 1)');
  lines.push('    local _nb = string.byte(_nc, (_idx - 1) % #_nc + 1)');
  lines.push('    _bytes[_idx] = string.char((_b - _kb - _nb) % 256)');
  lines.push('    _idx = _idx + 1');
  lines.push('end');
  lines.push('');
  lines.push('local _code = table.concat(_bytes)');
  lines.push('_hex = nil _key = nil _nc = nil _bytes = nil _seed = nil _ts = nil _dk = nil');
  lines.push('');
  lines.push('local _f, _e = loadstring(_code)');
  lines.push('if not _f then error("APEX Error: " .. tostring(_e)) end');
  lines.push('_code = nil');
  lines.push('_f()');
  lines.push('_f = nil');
  lines.push('collectgarbage("collect")');

  return lines.join('\n');
}
